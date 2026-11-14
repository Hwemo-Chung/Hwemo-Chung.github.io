import { $, fileInput, status, progress, download, baseName, loadImage, toBlob } from '../common/tool.js';

const ORT_URL = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/ort.wasm.min.mjs';
// Big-LaMa exported to ONNX (Carve), as published in the OpenCV model zoo. Fixed 512×512 input, RGB 0..1 in, 0..255 out.
// WebGPU gives wrong output for this graph, so it runs on the wasm backend in a worker.
const MODEL_URL = 'https://huggingface.co/opencv/inpainting_lama/resolve/main/inpainting_lama_2025jan.onnx';
const MODEL_BYTES = 92591623;
const N = 512;

const statusEl = $('#status');
const bar = $('#bar');
const wrap = $('#wrap');
const img = $('#img');
const orig = $('#orig');
const mask = $('#mask');
const cursor = $('#cursor');
const ictx = img.getContext('2d', { willReadFrequently: true });
const mctx = mask.getContext('2d');
const paint = getComputedStyle(document.documentElement).getPropertyValue('--link').trim();
const state = { file: null, strokes: [], undo: [], busy: false };
let model;

async function fetchModel() {
  const cache = await caches.open('lumos-models').catch(() => null);
  const hit = await cache?.match(MODEL_URL);
  if (hit) return hit.arrayBuffer();
  const res = await fetch(MODEL_URL);
  if (!res.ok) throw new Error(res.statusText);
  const total = +res.headers.get('content-length') || MODEL_BYTES;
  const out = new Uint8Array(total);
  const reader = res.body.getReader();
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out.set(value, n);
    n += value.length;
    progress(bar, n / total);
    status(statusEl, `모델을 받는 중… ${Math.round(n / 1048576)} / ${Math.round(total / 1048576)}MB`);
  }
  cache?.put(MODEL_URL, new Response(out)).catch(() => {});
  return out.buffer;
}

function getModel() {
  model ||= (async () => {
    status(statusEl, '모델을 받는 중…');
    const ort = await import(ORT_URL);
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = true;
    ort.env.logLevel = 'error';
    const buf = await fetchModel();
    progress(bar, null);
    status(statusEl, '모델을 여는 중…');
    const session = await ort.InferenceSession.create(buf, { executionProviders: ['wasm'], logSeverityLevel: 3 });
    return { ort, session };
  })().catch((e) => {
    model = null;
    throw e;
  });
  return model;
}

$('#size').addEventListener('input', (e) => { $('#sizeOut').value = `${e.target.value}px`; });

fileInput($('#drop'), $('#file'), (files, err) => {
  if (err) return status(statusEl, err.message, true);
  if (!state.busy) open(files[0]);
});

async function open(file) {
  let el;
  try {
    el = await loadImage(file);
  } catch (e) {
    return status(statusEl, e.message, true);
  }
  state.file = file;
  state.strokes = [];
  state.undo = [];
  const w = el.naturalWidth, h = el.naturalHeight;
  for (const c of [img, orig, mask]) { c.width = w; c.height = h; }
  ictx.drawImage(el, 0, 0);
  orig.getContext('2d').drawImage(el, 0, 0);
  URL.revokeObjectURL(el.src);
  $('#drop').hidden = true;
  $('#edit').hidden = false;
  fit();
  refresh();
  status(statusEl, '지울 곳을 칠하세요.');
}

function fit() {
  if (!img.width) return;
  const k = Math.min(1, ($('#edit').clientWidth - 24) / img.width, (innerHeight * 0.72) / img.height);
  wrap.style.width = `${Math.round(img.width * k)}px`;
  wrap.style.height = `${Math.round(img.height * k)}px`;
}
addEventListener('resize', fit);

function refresh() {
  $('#run').disabled = !state.strokes.length || state.busy;
  $('#undo').disabled = !(state.strokes.length || state.undo.length) || state.busy;
  $('#save').disabled = !state.file || state.busy;
  $('#hold').disabled = !state.file;
}

function drawStroke(ctx, s, grow = 0, ox = 0, oy = 0) {
  const r = s.r + grow;
  ctx.strokeStyle = ctx.fillStyle = paint;
  ctx.lineWidth = r * 2;
  ctx.lineCap = ctx.lineJoin = 'round';
  const [x0, y0] = s.pts[0];
  ctx.beginPath();
  ctx.arc(x0 - ox, y0 - oy, r, 0, Math.PI * 2);
  ctx.fill();
  if (s.pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(x0 - ox, y0 - oy);
  for (const [x, y] of s.pts.slice(1)) ctx.lineTo(x - ox, y - oy);
  ctx.stroke();
}

function redrawMask() {
  mctx.clearRect(0, 0, mask.width, mask.height);
  for (const s of state.strokes) drawStroke(mctx, s);
}

// painting
let stroke = null;
const toImg = (e) => {
  const k = img.width / wrap.clientWidth;
  return [e.offsetX * k, e.offsetY * k];
};
wrap.addEventListener('pointerleave', () => { cursor.hidden = true; });
wrap.addEventListener('pointerdown', (e) => {
  if (state.busy || e.button > 0) return;
  wrap.setPointerCapture(e.pointerId);
  stroke = { r: (+$('#size').value * img.width) / wrap.clientWidth / 2, pts: [toImg(e)] };
  state.strokes.push(stroke);
  drawStroke(mctx, stroke);
});
wrap.addEventListener('pointermove', (e) => {
  const d = +$('#size').value;
  Object.assign(cursor.style, { left: `${e.offsetX}px`, top: `${e.offsetY}px`, width: `${d}px`, height: `${d}px` });
  cursor.hidden = false;
  if (!stroke) return;
  const last = stroke.pts[stroke.pts.length - 1];
  const p = toImg(e);
  stroke.pts.push(p);
  mctx.beginPath();
  mctx.moveTo(...last);
  mctx.lineTo(...p);
  mctx.stroke();
});
const end = () => {
  if (!stroke) return;
  stroke = null;
  refresh();
};
wrap.addEventListener('pointerup', end);
wrap.addEventListener('pointercancel', end);

$('#run').addEventListener('click', async () => {
  state.busy = true;
  refresh();
  const t0 = performance.now();
  try {
    const { ort, session } = await getModel();
    status(statusEl, '지우는 중…');
    await inpaint(ort, session);
    state.strokes = [];
    redrawMask();
    status(statusEl, `${((performance.now() - t0) / 1000).toFixed(1)}초 걸렸습니다. 더 지울 곳이 있으면 다시 칠하세요.`);
  } catch (e) {
    console.error(e);
    progress(bar, null);
    status(statusEl, model ? '지우지 못했습니다. 페이지를 새로 고친 뒤 다시 해 보세요.' : '모델을 받지 못했습니다. 네트워크를 확인하고 다시 누르세요.', true);
  } finally {
    state.busy = false;
    refresh();
  }
});

async function inpaint(ort, session) {
  const W = img.width, H = img.height;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of state.strokes) for (const [x, y] of s.pts) {
    x0 = Math.min(x0, x - s.r); y0 = Math.min(y0, y - s.r);
    x1 = Math.max(x1, x + s.r); y1 = Math.max(y1, y + s.r);
  }
  // Square crop around the painted area with room for context; small areas stay at full resolution.
  const side = Math.max(N, Math.round(Math.max(x1 - x0, y1 - y0) * 1.8));
  const cw = Math.min(W, side), ch = Math.min(H, side);
  const cx = Math.round(Math.min(Math.max(0, (x0 + x1 - cw) / 2), W - cw));
  const cy = Math.round(Math.min(Math.max(0, (y0 + y1 - ch) / 2), H - ch));
  const grow = Math.max(3, Math.round(Math.max(cw, ch) / 128));

  // hole mask at crop size, grown a little so the object's edge goes too
  const hole = new OffscreenCanvas(cw, ch);
  const hctx = hole.getContext('2d');
  for (const s of state.strokes) drawStroke(hctx, s, grow, cx, cy);

  const small = new OffscreenCanvas(N, N);
  const sctx = small.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(img, cx, cy, cw, ch, 0, 0, N, N);
  const px = sctx.getImageData(0, 0, N, N).data;
  sctx.clearRect(0, 0, N, N);
  sctx.drawImage(hole, 0, 0, N, N);
  const mk = sctx.getImageData(0, 0, N, N).data;

  const P = N * N;
  const image = new Float32Array(3 * P);
  const m = new Float32Array(P);
  for (let i = 0; i < P; i++) {
    if (mk[i * 4 + 3] > 0) { m[i] = 1; continue; }
    image[i] = px[i * 4] / 255;
    image[P + i] = px[i * 4 + 1] / 255;
    image[2 * P + i] = px[i * 4 + 2] / 255;
  }
  const res = await session.run({
    image: new ort.Tensor('float32', image, [1, 3, N, N]),
    mask: new ort.Tensor('float32', m, [1, 1, N, N]),
  });
  const o = res[session.outputNames[0]].data;
  const outPx = new ImageData(N, N);
  for (let i = 0; i < P; i++) {
    outPx.data[i * 4] = o[i];
    outPx.data[i * 4 + 1] = o[P + i];
    outPx.data[i * 4 + 2] = o[2 * P + i];
    outPx.data[i * 4 + 3] = 255;
  }
  sctx.putImageData(outPx, 0, 0);

  // keep only the filled hole, scaled back to full resolution with a soft edge, and lay it over the photo
  const patch = new OffscreenCanvas(cw, ch);
  const pctx = patch.getContext('2d');
  pctx.imageSmoothingQuality = 'high';
  pctx.drawImage(small, 0, 0, cw, ch);
  pctx.globalCompositeOperation = 'destination-in';
  pctx.filter = `blur(${Math.round(grow / 2)}px)`;
  pctx.drawImage(hole, 0, 0);
  state.undo.push({ x: cx, y: cy, data: ictx.getImageData(cx, cy, cw, ch) });
  ictx.drawImage(patch, cx, cy);
}

function undo() {
  if (state.busy) return;
  if (state.strokes.length) {
    state.strokes.pop();
    redrawMask();
  } else {
    const u = state.undo.pop();
    if (u) ictx.putImageData(u.data, u.x, u.y);
  }
  refresh();
}
$('#undo').addEventListener('click', undo);
addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); undo(); }
});

const hold = $('#hold');
const show = (v) => { orig.hidden = !v; mask.hidden = v; };
hold.addEventListener('pointerdown', () => show(true));
for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) hold.addEventListener(ev, () => show(false));
hold.addEventListener('keydown', (e) => { if (e.key === ' ') show(true); });
hold.addEventListener('keyup', () => show(false));

$('#save').addEventListener('click', async () => {
  const jpg = state.file.type === 'image/jpeg';
  const blob = await toBlob(img, jpg ? 'image/jpeg' : 'image/png', 0.95);
  download(blob, `${baseName(state.file)}-removed.${jpg ? 'jpg' : 'png'}`);
});
