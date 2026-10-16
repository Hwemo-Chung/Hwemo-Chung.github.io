import { $, fileInput, status, progress, download, baseName, loadImage, toBlob } from '../common/tool.js';

const CV_URL = 'https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.12.0-release.1/dist/opencv.js';
const CV_BYTES = 10872779;
const RADIUS = 5;

const statusEl = $('#status');
const bar = $('#bar');
const wrap = $('#wrap');
const img = $('#img');
const orig = $('#orig');
const mask = $('#mask');
const cursor = $('#cursor');
const ictx = img.getContext('2d', { willReadFrequently: true });
const mctx = mask.getContext('2d', { willReadFrequently: true });
const paint = getComputedStyle(document.documentElement).getPropertyValue('--link').trim();
const state = { file: null, undo: [], busy: false };
let cvReady;

function loadCv() {
  cvReady ||= (async () => {
    const res = await fetch(CV_URL);
    if (!res.ok) throw new Error(res.statusText);
    const reader = res.body.getReader();
    const chunks = [];
    let n = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      n += value.length;
      progress(bar, n / CV_BYTES);
    }
    const url = URL.createObjectURL(new Blob(chunks, { type: 'text/javascript' }));
    await new Promise((ok, fail) => {
      document.head.append(Object.assign(document.createElement('script'), { src: url, onload: ok, onerror: fail }));
    });
    const cv = window.cv;
    // The emscripten module has a broken thenable; wait for the runtime flag instead of awaiting it.
    if (!cv.Mat) await new Promise((r) => { cv.onRuntimeInitialized = r; });
    progress(bar, null);
    return cv;
  })().catch((e) => {
    cvReady = null;
    progress(bar, null);
    throw e;
  });
  return cvReady;
}

$('#size').addEventListener('input', (e) => { $('#sizeOut').value = `${e.target.value}px`; });

fileInput($('#drop'), $('#file'), (files, err) => {
  if (err) return status(statusEl, err.message, true);
  open(files[0]);
});

async function open(file) {
  let el;
  try {
    el = await loadImage(file);
  } catch (e) {
    return status(statusEl, e.message, true);
  }
  state.file = file;
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
  status(statusEl, '지울 곳을 문지르세요.');
  loadCv().catch(() => status(statusEl, '지우개를 받지 못했습니다. 네트워크를 확인하고 다시 문질러 보세요.', true));
}

function fit() {
  if (!img.width) return;
  const box = $('#edit');
  const k = Math.min(1, (box.clientWidth - 24) / img.width, (innerHeight * 0.72) / img.height);
  wrap.style.width = `${Math.round(img.width * k)}px`;
  wrap.style.height = `${Math.round(img.height * k)}px`;
}
addEventListener('resize', fit);

function refresh() {
  $('#save').disabled = !state.file || state.busy;
  $('#undo').disabled = !state.undo.length || state.busy;
  $('#hold').disabled = !state.file;
}

// painting
let stroke = null;
const toImg = (e) => {
  const k = img.width / wrap.clientWidth;
  return [e.offsetX * k, e.offsetY * k];
};
function moveCursor(e) {
  const d = +$('#size').value;
  Object.assign(cursor.style, { left: `${e.offsetX}px`, top: `${e.offsetY}px`, width: `${d}px`, height: `${d}px` });
  cursor.hidden = false;
}
wrap.addEventListener('pointerleave', () => { cursor.hidden = true; });
wrap.addEventListener('pointerdown', (e) => {
  if (state.busy || e.button > 0) return;
  wrap.setPointerCapture(e.pointerId);
  const r = (+$('#size').value * img.width) / wrap.clientWidth / 2;
  const [x, y] = toImg(e);
  stroke = { r, x0: x, y0: y, x1: x, y1: y, lx: x, ly: y };
  Object.assign(mctx, { strokeStyle: paint, fillStyle: paint, lineWidth: r * 2, lineCap: 'round', lineJoin: 'round' });
  mctx.beginPath();
  mctx.arc(x, y, r, 0, Math.PI * 2);
  mctx.fill();
});
wrap.addEventListener('pointermove', (e) => {
  moveCursor(e);
  if (!stroke) return;
  const [x, y] = toImg(e);
  mctx.beginPath();
  mctx.moveTo(stroke.lx, stroke.ly);
  mctx.lineTo(x, y);
  mctx.stroke();
  Object.assign(stroke, { lx: x, ly: y, x0: Math.min(stroke.x0, x), y0: Math.min(stroke.y0, y), x1: Math.max(stroke.x1, x), y1: Math.max(stroke.y1, y) });
});
wrap.addEventListener('pointerup', finish);
wrap.addEventListener('pointercancel', finish);

async function finish() {
  if (!stroke) return;
  const s = stroke;
  stroke = null;
  const m = Math.ceil(s.r + RADIUS * 2 + 2);
  const x = Math.max(0, Math.floor(s.x0 - m)), y = Math.max(0, Math.floor(s.y0 - m));
  const w = Math.min(img.width, Math.ceil(s.x1 + m)) - x, h = Math.min(img.height, Math.ceil(s.y1 + m)) - y;
  state.busy = true;
  refresh();
  try {
    if (!window.cv?.Mat) status(statusEl, '지우개를 준비하는 중…');
    const cv = await loadCv();
    erase(cv, x, y, w, h);
    status(statusEl, '');
  } catch (e) {
    console.error(e);
    status(statusEl, '지우개를 받지 못했습니다. 네트워크를 확인하고 다시 문질러 보세요.', true);
  } finally {
    mctx.clearRect(0, 0, mask.width, mask.height);
    state.busy = false;
    refresh();
  }
}

function erase(cv, x, y, w, h) {
  const before = ictx.getImageData(x, y, w, h);
  const alpha = mctx.getImageData(x, y, w, h).data;
  const src = cv.matFromImageData(before);
  const rgb = new cv.Mat();
  const hole = new cv.Mat(h, w, cv.CV_8UC1);
  const dst = new cv.Mat();
  try {
    for (let i = 0; i < w * h; i++) hole.data[i] = alpha[i * 4 + 3] ? 255 : 0;
    cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);
    cv.inpaint(rgb, hole, dst, RADIUS, cv.INPAINT_TELEA);
    cv.cvtColor(dst, src, cv.COLOR_RGB2RGBA);
    ictx.putImageData(new ImageData(new Uint8ClampedArray(src.data), w, h), x, y);
    state.undo.push({ x, y, data: before });
  } finally {
    for (const m of [src, rgb, hole, dst]) m.delete();
  }
}

function undo() {
  const u = state.undo.pop();
  if (u) ictx.putImageData(u.data, u.x, u.y);
  refresh();
}
$('#undo').addEventListener('click', undo);
addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !state.busy) { e.preventDefault(); undo(); }
});

const hold = $('#hold');
const show = (v) => { orig.hidden = !v; };
hold.addEventListener('pointerdown', () => show(true));
for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) hold.addEventListener(ev, () => show(false));
hold.addEventListener('keydown', (e) => { if (e.key === ' ') show(true); });
hold.addEventListener('keyup', () => show(false));

$('#save').addEventListener('click', async () => {
  const jpg = state.file.type === 'image/jpeg';
  const blob = await toBlob(img, jpg ? 'image/jpeg' : 'image/png', 0.95);
  download(blob, `${baseName(state.file)}-erased.${jpg ? 'jpg' : 'png'}`);
});
