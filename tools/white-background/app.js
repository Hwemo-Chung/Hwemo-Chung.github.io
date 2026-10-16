import { $, fileInput, status, progress, download, bytes, baseName, loadImage, toBlob } from '../common/tool.js';

const LIB = 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm';
const state = { file: null, cut: null, box: null, bg: '#ffffff', size: 1000, format: 'image/jpeg', busy: false };
const statusEl = $('#status');
const barEl = $('#bar');
const canvas = $('#outCanvas');

fileInput($('#drop'), $('#file'), (files, err) => {
  if (err) return status(statusEl, err.message, true);
  start(files[0]);
});

$('#sample').addEventListener('click', async (e) => {
  e.stopPropagation();
  const res = await fetch('sample.jpg');
  start(new File([await res.blob()], 'backpack.jpg', { type: 'image/jpeg' }));
});

$('#other').addEventListener('click', () => $('#file').click());
$('#save').addEventListener('click', save);

for (const [id, key, num] of [['#bg', 'bg'], ['#size', 'size', true], ['#format', 'format']]) {
  $(id).addEventListener('click', (e) => {
    const v = e.target.dataset.v;
    if (v == null) return;
    state[key] = num ? +v : v;
    for (const b of $(id).children) b.setAttribute('aria-pressed', String(b === e.target));
    render();
  });
}
$('#color').addEventListener('input', () => {
  state.bg = 'custom';
  for (const b of $('#bg').children) b.setAttribute('aria-pressed', String(b.dataset.v === 'custom'));
  render();
});
$('#margin').addEventListener('input', (e) => { $('#mOut').value = `${e.target.value}%`; render(); });

async function start(file) {
  if (state.busy) return;
  state.busy = true;
  $('#save').disabled = $('#other').disabled = true;
  status(statusEl, '');
  try {
    const img = await loadImage(file);
    if ($('#imgA').src) URL.revokeObjectURL($('#imgA').src);
    $('#imgA').src = img.src;
    $('#capA').textContent = `원본 · ${img.naturalWidth}×${img.naturalHeight} · ${bytes(file.size)}`;
    $('#drop').hidden = true;
    $('#result').hidden = false;
    canvas.width = canvas.height = 0;
    state.file = file;
    const blob = await cutout(file);
    state.cut = await createImageBitmap(blob);
    state.box = alphaBox(state.cut);
    if (!state.box) throw new Error('상품을 찾지 못했습니다. 상품이 크게 보이는 다른 사진으로 해 보세요.');
    status(statusEl, '');
    render();
    $('#save').disabled = false;
  } catch (e) {
    progress(barEl, null);
    status(statusEl, e.message || '배경을 지우지 못했습니다. 최신 Chrome, Edge, Safari에서 다시 해 보세요.', true);
  } finally {
    state.busy = false;
    $('#other').disabled = false;
  }
}

async function cutout(file) {
  status(statusEl, '배경 인식 모델을 불러오는 중…');
  progress(barEl, 0);
  let lib;
  try {
    lib = await import(LIB);
  } catch {
    throw new Error('배경 제거 모듈을 불러오지 못했습니다. 인터넷 연결을 확인하고 다시 시도하세요.');
  }
  const seen = {};
  const opts = {
    model: 'isnet_fp16',
    output: { format: 'image/png' },
    progress: (key, cur, total) => {
      if (key.startsWith('fetch:')) {
        seen[key] = [cur, total];
        const [c, t] = Object.values(seen).reduce(([a, b], [x, y]) => [a + x, b + y], [0, 0]);
        progress(barEl, c / t);
        status(statusEl, `배경 인식 모델 받는 중 ${(c / 1048576).toFixed(0)} MB`);
      } else if (key === 'compute:inference') {
        progress(barEl, null);
        status(statusEl, '배경을 지우는 중…');
      }
    },
  };
  const device = navigator.gpu ? 'gpu' : 'cpu';
  try {
    return await lib.removeBackground(file, { ...opts, device });
  } catch (e) {
    if (device === 'cpu') throw e;
    return lib.removeBackground(file, { ...opts, device: 'cpu' });
  }
}

// Bounding box of the product in source pixels. Rows/columns at the edges with only a few solid
// pixels (thin stray bits the model kept, like a door gap) are trimmed so they do not skew centering.
function alphaBox(bmp) {
  const { width: w, height: h } = bmp;
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  const { data } = ctx.getImageData(0, 0, w, h);
  const cols = new Uint32Array(w), rows = new Uint32Array(h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 128) { cols[x]++; rows[y]++; }
    }
  }
  const span = (arr) => {
    const min = Math.max(3, Math.max(...arr) * 0.01);
    let a = 0, b = arr.length - 1;
    while (a <= b && arr[a] < min) a++;
    while (b >= a && arr[b] < min) b--;
    return [a, b];
  };
  const [x0, x1] = span(cols), [y0, y1] = span(rows);
  return x1 < x0 || y1 < y0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function fill() {
  return state.bg === 'custom' ? $('#color').value : state.bg;
}

function render() {
  const transparent = state.bg === 'none';
  $('#pngHint').hidden = !transparent;
  for (const b of $('#format').children) b.disabled = transparent && b.dataset.v === 'image/jpeg';
  if (!state.cut) return;
  const { box } = state;
  const m = +$('#margin').value / 100;
  // Square canvas of the chosen size, or the product's own box plus margin.
  let W, H, scale;
  if (state.size) {
    W = H = state.size;
    scale = (W * (1 - 2 * m)) / Math.max(box.w, box.h);
  } else {
    const pad = Math.round(Math.max(box.w, box.h) * m);
    W = box.w + 2 * pad; H = box.h + 2 * pad; scale = 1;
  }
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!transparent) { ctx.fillStyle = fill(); ctx.fillRect(0, 0, W, H); }
  const dw = box.w * scale, dh = box.h * scale;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(state.cut, box.x, box.y, box.w, box.h, (W - dw) / 2, (H - dh) / 2, dw, dh);
  $('#capB').textContent = `결과 · ${W}×${H}`;
}

async function save() {
  const type = state.bg === 'none' ? 'image/png' : state.format;
  const blob = await toBlob(canvas, type, 0.92);
  download(blob, `${baseName(state.file)}-${state.bg === 'none' ? 'transparent' : 'bg'}.${type === 'image/png' ? 'png' : 'jpg'}`);
  status(statusEl, `${canvas.width}×${canvas.height} · ${bytes(blob.size)}`);
}
