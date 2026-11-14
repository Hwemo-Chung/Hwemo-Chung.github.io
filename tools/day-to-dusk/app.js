import { $, fileInput, status, progress, download, baseName, loadImage, toBlob } from '../common/tool.js';

const TF_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js';
const MODEL = 'Xenova/segformer-b2-finetuned-ade-512-512'; // SegFormer-B2, ADE20K, 8-bit ONNX (29 MB)
const MAX_SIDE = 2400;
const NET_SIDE = 1024;
const SKIES = {
  dusk: [[0, [24, 34, 74]], [0.55, [112, 86, 140]], [0.85, [232, 132, 98]], [1, [250, 186, 120]]],
  blue: [[0, [10, 22, 58]], [0.6, [36, 66, 122]], [1, [96, 128, 178]]],
  sunset: [[0, [52, 40, 92]], [0.5, [196, 92, 92]], [0.8, [244, 148, 72]], [1, [255, 206, 120]]],
};

const statusEl = $('#status');
const prog = $('#prog');
const out = $('#out'), orig = $('#orig');
const S = { file: null, w: 0, h: 0, rgb: null, gray: null, sky: null, win: null, horizon: 0, top: 0, job: 0, skyName: 'dusk' };

const LIN = new Float32Array(256).map((_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
const gam = (v) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.min(1, v) ** (1 / 2.4) - 0.055);

let modelP = null;
function loadModel() {
  modelP ??= (async () => {
    const T = await import(TF_URL);
    const files = {};
    const model = await T.SegformerForSemanticSegmentation.from_pretrained(MODEL, {
      dtype: 'q8', device: 'wasm',
      progress_callback: (p) => {
        if (p.status !== 'progress' || !p.total) return;
        files[p.file] = [p.loaded, p.total];
        const v = Object.values(files), r = v.reduce((s, x) => s + x[0], 0) / v.reduce((s, x) => s + x[1], 0);
        progress(prog, r);
        status(statusEl, `분석 모델 받는 중 ${Math.round(r * 100)}%`);
      },
    });
    return { T, model };
  })().catch((e) => { modelP = null; throw e; });
  return modelP;
}

// edge-aware upsampling of a class probability map (guided filter on the photo's gray)
function box(src, w, h, r, tmp, dst) {
  for (let y = 0; y < h; y++) {
    const o = y * w; let s = 0, n = 0;
    for (let x = 0; x < Math.min(r, w); x++) { s += src[o + x]; n++; }
    for (let x = 0; x < w; x++) {
      if (x + r < w) { s += src[o + x + r]; n++; }
      if (x - r - 1 >= 0) { s -= src[o + x - r - 1]; n--; }
      tmp[o + x] = s / n;
    }
  }
  const acc = new Float64Array(w); let n = 0;
  const add = (y, sg) => { const o = y * w; for (let x = 0; x < w; x++) acc[x] += sg * tmp[o + x]; n += sg; };
  for (let y = 0; y < Math.min(r, h); y++) add(y, 1);
  for (let y = 0; y < h; y++) {
    if (y + r < h) add(y + r, 1);
    if (y - r - 1 >= 0) add(y - r - 1, -1);
    const o = y * w; for (let x = 0; x < w; x++) dst[o + x] = acc[x] / n;
  }
}
function guided(I, p, w, h, r, eps) {
  const N = w * h, tmp = new Float32Array(N), t = new Float32Array(N);
  const mI = new Float32Array(N), mP = new Float32Array(N), mIP = new Float32Array(N), mII = new Float32Array(N);
  box(I, w, h, r, tmp, mI); box(p, w, h, r, tmp, mP);
  for (let i = 0; i < N; i++) t[i] = I[i] * p[i];
  box(t, w, h, r, tmp, mIP);
  for (let i = 0; i < N; i++) t[i] = I[i] * I[i];
  box(t, w, h, r, tmp, mII);
  for (let i = 0; i < N; i++) { const a = (mIP[i] - mI[i] * mP[i]) / (mII[i] - mI[i] * mI[i] + eps); mIP[i] = a; mP[i] -= a * mI[i]; }
  box(mIP, w, h, r, tmp, mII); box(mP, w, h, r, tmp, mI);
  for (let i = 0; i < N; i++) t[i] = Math.min(1, Math.max(0, mII[i] * I[i] + mI[i]));
  return t;
}
function upsample(prob, lw, lh, ids, lo = 0.4) {
  const w = S.w, h = S.h, p = new Float32Array(w * h), m = lw * lh;
  for (let y = 0; y < h; y++) {
    const fy = Math.min(lh - 1, Math.max(0, ((y + 0.5) * lh) / h - 0.5)), y0 = fy | 0, y1 = Math.min(lh - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(lw - 1, Math.max(0, ((x + 0.5) * lw) / w - 0.5)), x0 = fx | 0, x1 = Math.min(lw - 1, x0 + 1), tx = fx - x0;
      let v = 0;
      for (const id of ids) {
        const o = id * m;
        const a = prob[o + y0 * lw + x0] * (1 - tx) + prob[o + y0 * lw + x1] * tx;
        const b = prob[o + y1 * lw + x0] * (1 - tx) + prob[o + y1 * lw + x1] * tx;
        v += a * (1 - ty) + b * ty;
      }
      p[y * w + x] = v;
    }
  }
  const q = guided(S.gray, p, w, h, Math.max(4, Math.round(Math.max(w, h) / 120)), 1e-4);
  for (let i = 0; i < q.length; i++) q[i] = Math.min(1, Math.max(0, (q[i] - lo) / 0.3));
  return q;
}

async function segment(job) {
  const { T, model } = await loadModel();
  if (job !== S.job) return false;
  status(statusEl, '하늘과 창을 찾는 중입니다.');
  progress(prog, null);
  const k = NET_SIDE / Math.max(S.w, S.h);
  const W = Math.max(64, Math.round((S.w * k) / 32) * 32), H = Math.max(64, Math.round((S.h * k) / 32) * 32);
  const c = Object.assign(document.createElement('canvas'), { width: W, height: H });
  c.getContext('2d').drawImage(orig, 0, 0, W, H);
  const px = c.getContext('2d').getImageData(0, 0, W, H).data, n = W * H;
  const data = new Float32Array(3 * n), mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225];
  for (let i = 0; i < n; i++) for (let ch = 0; ch < 3; ch++) data[ch * n + i] = (px[i * 4 + ch] / 255 - mean[ch]) / std[ch];
  await new Promise(requestAnimationFrame);
  const { logits } = await model({ pixel_values: new T.Tensor('float32', data, [1, 3, H, W]) });
  if (job !== S.job) return false;
  const [, C, lh, lw] = logits.dims, L = logits.data, m = lw * lh;
  const prob = new Float32Array(C * m);
  for (let i = 0; i < m; i++) {
    let mx = -Infinity;
    for (let c2 = 0; c2 < C; c2++) mx = Math.max(mx, L[c2 * m + i]);
    let sum = 0;
    for (let c2 = 0; c2 < C; c2++) { const e = Math.exp(L[c2 * m + i] - mx); prob[c2 * m + i] = e; sum += e; }
    for (let c2 = 0; c2 < C; c2++) prob[c2 * m + i] /= sum;
  }
  const names = Object.values(model.config.id2label).map((s) => s.trim());
  const ids = (list) => list.map((nm) => names.indexOf(nm)).filter((i) => i >= 0);
  S.sky = upsample(prob, lw, lh, ids(['sky']));
  S.win = upsample(prob, lw, lh, ids(['windowpane']), 0.12);
  S.winModel = S.win.slice();
  S.winFrac = S.win.reduce((s, v) => s + v, 0) / S.win.length;
  // sky band: top of the sky to the lowest row that is still mostly sky
  let top = S.h, bottom = 0, area = 0;
  for (let y = 0; y < S.h; y++) {
    let s = 0; for (let x = 0; x < S.w; x++) s += S.sky[y * S.w + x];
    if (s > S.w * 0.05) { top = Math.min(top, y); bottom = y; }
    area += s;
  }
  S.top = top; S.horizon = Math.max(bottom, top + 1);
  return area / (S.w * S.h);
}

let raf = 0;
function render() {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => {
    if (!S.sky) return;
    const k = +$('#amount').value / 100, glow = +$('#glow').value / 100, grad = SKIES[S.skyName || 'dusk'];
    const cx = out.getContext('2d'), img = cx.createImageData(S.w, S.h), d = img.data, src = S.rgb;
    const span = S.horizon - S.top;
    const skyAt = (y) => {
      const t = Math.min(1, Math.max(0, (y - S.top) / span));
      let i = 1; while (i < grad.length - 1 && grad[i][0] < t) i++;
      const [t0, a] = grad[i - 1], [t1, b] = grad[i], u = (t - t0) / (t1 - t0 || 1);
      return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
    };
    for (let y = 0; y < S.h; y++) {
      const sc = skyAt(y);
      for (let x = 0; x < S.w; x++) {
        const i = y * S.w + x, o = i * 4;
        const r = LIN[src[o]], g = LIN[src[o + 1]], b = LIN[src[o + 2]];
        // dusk grade: about 2 stops darker, cooler shadows, slightly warm highlights
        const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        let R = r * 0.13 * 0.85, G = g * 0.13 * 0.95, B = b * 0.13 * 1.25;
        R += Y * 0.02; // keep a little warmth in lit surfaces
        // windows: warm interior light, brighter where the glass was dark
        const wv = S.win[i] * glow;
        if (wv > 0.002) {
          const lit = 0.55 + 0.45 * (1 - Math.min(1, Y * 3));
          R += wv * lit * 0.95; G += wv * lit * 0.55; B += wv * lit * 0.2;
        }
        let rr = gam(R), gg = gam(G), bb = gam(B);
        const sv = S.sky[i];
        if (sv > 0.002) { rr += (sc[0] - rr) * sv; gg += (sc[1] - gg) * sv; bb += (sc[2] - bb) * sv; }
        d[o] = src[o] + (rr - src[o]) * k;
        d[o + 1] = src[o + 1] + (gg - src[o + 1]) * k;
        d[o + 2] = src[o + 2] + (bb - src[o + 2]) * k;
        d[o + 3] = 255;
      }
    }
    cx.putImageData(img, 0, 0);
    // soft light spill around windows
    if (glow > 0) {
      const g = Object.assign(document.createElement('canvas'), { width: S.w, height: S.h });
      const gc = g.getContext('2d'), gi = gc.createImageData(S.w, S.h);
      for (let i = 0; i < S.win.length; i++) { const a = S.win[i] * glow * k; gi.data[i * 4] = 255; gi.data[i * 4 + 1] = 170; gi.data[i * 4 + 2] = 90; gi.data[i * 4 + 3] = a * 255; }
      gc.putImageData(gi, 0, 0);
      cx.save();
      cx.globalCompositeOperation = 'screen';
      cx.filter = `blur(${Math.round(Math.max(S.w, S.h) / 160)}px)`;
      cx.globalAlpha = 0.6;
      cx.drawImage(g, 0, 0);
      cx.restore();
    }
  });
}

for (const id of ['amount', 'glow']) $(`#${id}`).addEventListener('input', (e) => { $(`#${id}Out`).value = `${e.target.value}%`; render(); });
$('#brush').addEventListener('input', (e) => { $('#brushOut').value = `${e.target.value}%`; });
$('#sky').addEventListener('click', (e) => {
  const v = e.target.dataset.v; if (!v) return;
  S.skyName = v;
  for (const b of $('#sky').children) b.setAttribute('aria-pressed', String(b.dataset.v === v));
  render();
});
$('#cmp').addEventListener('input', (e) => {
  const v = +e.target.value;
  $('#cmpOut').value = `${v}%`;
  orig.style.clipPath = `inset(0 ${100 - v}% 0 0)`;
  $('#split').hidden = v === 0 || v === 100;
  $('#split').style.left = `${v}%`;
});
// windows the model misses (exterior glass is often labeled as "house"): paint them to light them up
const paintMask = document.createElement('canvas');
let painting = false;
function brushAt(e) {
  const r = out.getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width) * S.w, y = ((e.clientY - r.top) / r.height) * S.h;
  const pc = paintMask.getContext('2d');
  pc.fillStyle = '#fff';
  pc.beginPath(); pc.arc(x, y, (+$('#brush').value / 100) * Math.max(S.w, S.h) * 0.03, 0, Math.PI * 2); pc.fill();
}
function mergePaint() {
  const d = paintMask.getContext('2d').getImageData(0, 0, S.w, S.h).data;
  for (let i = 0; i < S.win.length; i++) S.win[i] = Math.max(S.winModel[i], d[i * 4 + 3] / 255);
  render();
}
$('#view').addEventListener('pointerdown', (e) => { if (!S.sky) return; painting = true; $('#view').setPointerCapture(e.pointerId); brushAt(e); });
$('#view').addEventListener('pointermove', (e) => { if (painting) brushAt(e); });
$('#view').addEventListener('pointerup', () => { if (painting) { painting = false; mergePaint(); } });
$('#clearWin').addEventListener('click', () => { paintMask.getContext('2d').clearRect(0, 0, S.w, S.h); mergePaint(); });

$('#save').addEventListener('click', async () => download(await toBlob(out, 'image/jpeg', 0.92), `${baseName(S.file)}-dusk.jpg`));
$('#again').addEventListener('click', () => $('#file').click());
fileInput($('#drop'), $('#file'), (files, err) => (err ? status(statusEl, err.message, true) : open(files[0])));
$('#sample').addEventListener('click', async (e) => {
  e.stopPropagation();
  const res = await fetch('sample.jpg');
  open(new File([await res.blob()], 'house.jpg', { type: 'image/jpeg' }));
});

async function open(file) {
  const job = ++S.job;
  let img;
  try { img = await loadImage(file); } catch (e) { return status(statusEl, e.message, true); }
  const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
  Object.assign(S, { file, w, h, sky: null, win: null });
  for (const c of [out, orig, paintMask]) { c.width = w; c.height = h; }
  const oc = orig.getContext('2d');
  oc.imageSmoothingQuality = 'high';
  oc.drawImage(img, 0, 0, w, h);
  out.getContext('2d').drawImage(orig, 0, 0);
  URL.revokeObjectURL(img.src);
  S.rgb = oc.getImageData(0, 0, w, h).data;
  S.gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) S.gray[i] = Math.cbrt(0.2126 * LIN[S.rgb[i * 4]] + 0.7152 * LIN[S.rgb[i * 4 + 1]] + 0.0722 * LIN[S.rgb[i * 4 + 2]]);
  $('#drop').hidden = true;
  $('#view').hidden = false;
  $('#stage').classList.add('has');
  for (const id of ['save', 'cmp', 'amount', 'glow', 'brush', 'clearWin']) $(`#${id}`).disabled = true;
  $('#again').disabled = false;
  $('#cmp').value = 0; $('#cmp').dispatchEvent(new Event('input'));
  try {
    const skyFrac = await segment(job);
    if (skyFrac === false) return;
    for (const id of ['save', 'cmp', 'amount', 'glow', 'brush', 'clearWin']) $(`#${id}`).disabled = false;
    render();
    status(statusEl, skyFrac < 0.02 ? '하늘이 거의 보이지 않아 색만 저녁으로 바꿨습니다.' : S.winFrac < 0.002 ? '창을 찾지 못했습니다. 불을 켤 창을 사진 위에 칠하세요.' : '강도와 창 불빛을 조절한 뒤 받으세요.');
  } catch (e) {
    console.error(e);
    progress(prog, null);
    if (job === S.job) status(statusEl, '분석 모델을 불러오지 못했습니다. 네트워크를 확인하고 사진을 다시 올려 주세요. 최신 Chrome, Edge, Safari에서 동작합니다.', true);
  }
}
