import { $, fileInput, status, progress, download, baseName, loadImage, toBlob } from '../common/tool.js';

const TF_URL = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/+esm';
// idealo ISR RRDN GAN weights, packaged by UpscalerJS
const MODEL_URL = (s) => `https://cdn.jsdelivr.net/npm/@upscalerjs/esrgan-thick@1.0.0/models/x${s}/model.json`;
const MAX_SIDE = { 2: 1000, 4: 800 };
const TILE = 96;
const PAD = 12;

const state = { scale: 4, file: null, img: null, out: null, outScale: 0, zoom: '1', busy: false };
const models = {};
let tf;

const statusEl = $('#status');
const bar = $('#bar');
const vp = $('#vp');
const pane = $('#pane');
const after = $('#after');
const before = $('#before');

function setScale(v) {
  state.scale = +v;
  for (const b of $('#scale').children) b.setAttribute('aria-pressed', String(b.dataset.v === v));
  $('#limit').textContent = `${v}배는 긴 변 ${MAX_SIDE[v]}px까지 됩니다.`;
  refresh();
}
$('#scale').addEventListener('click', (e) => { if (e.target.dataset.v) setScale(e.target.dataset.v); });
setScale('4');

$('#zoom').addEventListener('click', (e) => {
  if (!e.target.dataset.v) return;
  state.zoom = e.target.dataset.v;
  for (const b of $('#zoom').children) b.setAttribute('aria-pressed', String(b.dataset.v === state.zoom));
  layout();
});
$('#cmp').addEventListener('input', placeSplit);
vp.addEventListener('scroll', placeSplit);
addEventListener('resize', layout);

fileInput($('#drop'), $('#file'), (files, err) => {
  if (err) return status(statusEl, err.message, true);
  open(files[0]);
});

$('#sample').addEventListener('click', async (e) => {
  e.stopPropagation();
  const res = await fetch('sample.jpg');
  open(new File([await res.blob()], 'barber-shop-1935.jpg', { type: 'image/jpeg' }));
});

async function open(file) {
  if (state.busy) return;
  status(statusEl, '');
  try {
    state.img = await loadImage(file);
  } catch (e) {
    return status(statusEl, e.message, true);
  }
  state.file = file;
  state.out = null;
  state.outScale = 0;
  $('#drop').hidden = true;
  $('#view').hidden = false;
  before.src = state.img.src;
  refresh();
}

function tooBig() {
  const { img } = state;
  return img && Math.max(img.naturalWidth, img.naturalHeight) > MAX_SIDE[state.scale];
}

function refresh() {
  const { img, out } = state;
  $('#run').disabled = !img || state.busy || tooBig();
  $('#save').disabled = !out || state.busy;
  if (!img) return;
  const w = img.naturalWidth, h = img.naturalHeight, s = state.scale;
  $('#info').textContent = out
    ? `${w}×${h} → ${out.width}×${out.height}`
    : `${w}×${h} → ${w * s}×${h * s}`;
  if (tooBig() && !state.busy) {
    const side = Math.max(w, h);
    const alt = s === 4 && side <= MAX_SIDE[2] ? '2배를 고르거나 ' : '';
    status(statusEl, `이 사진은 긴 변이 ${side}px입니다. ${alt}긴 변 ${MAX_SIDE[s]}px 이하로 줄여서 올리세요.`, true);
    statusEl.dataset.size = '1';
  } else if (statusEl.dataset.size) {
    status(statusEl, '');
    delete statusEl.dataset.size;
  }
  layout();
}

function layout() {
  const { img, out } = state;
  if (!img) return;
  const W = out ? out.width : img.naturalWidth * state.scale;
  const H = out ? out.height : img.naturalHeight * state.scale;
  let k = 1;
  if (state.zoom === 'fit') k = Math.min(1, (vp.clientWidth - 2) / W, (vp.clientHeight - 2) / H);
  pane.style.width = `${Math.round(W * k)}px`;
  pane.style.height = `${Math.round(H * k)}px`;
  after.hidden = !out;
  $('#line').hidden = !out;
  before.style.clipPath = '';
  placeSplit();
}

function placeSplit() {
  if (!state.out) return;
  const x = vp.scrollLeft + vp.clientWidth * ($('#cmp').value / 100) - pane.offsetLeft;
  const pct = Math.max(0, Math.min(100, (x / pane.offsetWidth) * 100));
  before.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
  $('#line').style.left = `${pct}%`;
}

async function getModel(scale) {
  if (models[scale]) return models[scale];
  if (!tf) {
    status(statusEl, '라이브러리를 받는 중…');
    tf = await import(TF_URL);
    registerLayers(tf);
    await tf.ready();
  }
  status(statusEl, '모델을 받는 중…');
  models[scale] = await tf.loadLayersModel(MODEL_URL(scale), { onProgress: (r) => progress(bar, r) });
  return models[scale];
}

// Custom layers used by the RRDN weights (same definitions as @upscalerjs/esrgan-thick).
function registerLayers(tf) {
  class MultiplyBeta extends tf.layers.Layer {
    static className = 'MultiplyBeta';
    call(inputs) { return tf.mul(Array.isArray(inputs) ? inputs[0] : inputs, 0.2); }
  }
  tf.serialization.registerClass(MultiplyBeta);
  for (const s of [2, 4]) {
    const PixelShuffle = class extends tf.layers.Layer {
      static className = `PixelShuffle${s}x`;
      computeOutputShape(shape) { return [shape[0], shape[1], shape[2], 3]; }
      call(inputs) { return tf.depthToSpace(Array.isArray(inputs) ? inputs[0] : inputs, s, 'NHWC'); }
    };
    tf.serialization.registerClass(PixelShuffle);
  }
}

$('#run').addEventListener('click', async () => {
  const { img } = state;
  const s = state.scale;
  state.busy = true;
  refresh();
  const t0 = performance.now();
  let src;
  try {
    const model = await getModel(s);
    const w = img.naturalWidth, h = img.naturalHeight;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0);
    // Every tile gets the same input shape: WebGL recompiles all shaders for each new shape.
    src = tf.tidy(() => {
      let t = tf.browser.fromPixels(c).toFloat().div(255);
      if (Math.min(w, h) > PAD) t = tf.mirrorPad(t, [[PAD, PAD], [PAD, PAD], [0, 0]], 'symmetric');
      else t = tf.pad(t, [[PAD, PAD], [PAD, PAD], [0, 0]]);
      return tf.pad(t, [[0, Math.ceil(h / TILE) * TILE - h], [0, Math.ceil(w / TILE) * TILE - w], [0, 0]]);
    });

    const out = document.createElement('canvas');
    out.width = w * s; out.height = h * s;
    const ctx = out.getContext('2d');
    const tiles = [];
    for (let y = 0; y < h; y += TILE) for (let x = 0; x < w; x += TILE) tiles.push([x, y]);
    for (let i = 0; i < tiles.length; i++) {
      const [x, y] = tiles[i];
      const tw = Math.min(TILE, w - x), th = Math.min(TILE, h - y);
      const t = tf.tidy(() => {
        const inp = src.slice([y, x, 0], [TILE + 2 * PAD, TILE + 2 * PAD, 3]).expandDims(0);
        return model.predict(inp).squeeze()
          .slice([PAD * s, PAD * s, 0], [th * s, tw * s, 3])
          .clipByValue(0, 1);
      });
      const px = await tf.browser.toPixels(t);
      t.dispose();
      ctx.putImageData(new ImageData(px, tw * s, th * s), x * s, y * s);
      progress(bar, (i + 1) / tiles.length);
      status(statusEl, `키우는 중… ${i + 1}/${tiles.length}`);
    }
    after.width = out.width; after.height = out.height;
    after.getContext('2d').drawImage(out, 0, 0);
    state.out = out;
    state.outScale = s;
    layout();
    vp.scrollLeft = (pane.offsetWidth - vp.clientWidth) / 2;
    vp.scrollTop = (pane.offsetHeight - vp.clientHeight) / 2;
    status(statusEl, `${((performance.now() - t0) / 1000).toFixed(1)}초 걸렸습니다.`);
  } catch (e) {
    console.error(e);
    status(statusEl, models[s] ? '처리 중 메모리가 부족했습니다. 더 작은 사진이나 2배로 다시 해 보세요.' : '모델을 받지 못했습니다. 네트워크를 확인하고 다시 누르세요.', true);
  } finally {
    src?.dispose();
    progress(bar, null);
    state.busy = false;
    refresh();
  }
});

$('#save').addEventListener('click', async () => {
  download(await toBlob(state.out, 'image/png'), `${baseName(state.file)}-x${state.outScale}.png`);
});
