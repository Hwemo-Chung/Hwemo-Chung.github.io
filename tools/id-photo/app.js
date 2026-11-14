import { $, fileInput, status, progress, download, baseName, loadImage, toBlob } from '../common/tool.js';

const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1';
const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const BG_LIB = 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm';
const DPI = 300;
const PX_MM = DPI / 25.4;

// head: target length from top of skull (hair excluded) to chin, mm. top: skull top from the photo's top edge, mm.
const PRESETS = {
  passport: { w: 35, h: 45, head: 34, top: 5, file: 'passport', spec: '3.5×4.5cm · 머리 길이(정수리~턱) 3.2~3.6cm · 외교부 규격', range: [32, 36] },
  id: { w: 35, h: 45, head: 33, top: 5.5, file: 'id', spec: '3.5×4.5cm · 주민등록증, 운전면허증, 자격증' },
  half: { w: 30, h: 40, head: 28, top: 4.5, file: 'half', spec: '3×4cm · 이력서, 학생증, 사원증' },
  us: { w: 50.8, h: 50.8, head: 29, top: 5, file: 'us-visa', spec: '2×2in(51×51mm) · 머리카락 포함 머리 25~35mm, 눈 높이 28~35mm · 600×600px' },
};
// Hair adds roughly this much to skull-top-to-chin; used only for the US rule, which measures to the top of the hair.
const HAIR = 1.08;

const state = { preset: 'passport', file: null, img: null, cut: null, face: null, dx: 0, dy: 0, zoom: 1, busy: false, loading: false };
const statusEl = $('#status');
const barEl = $('#bar');
const single = $('#single');
const sheet = $('#sheet');
let landmarker;

fileInput($('#drop'), $('#file'), (files, err) => {
  if (err) return status(statusEl, err.message, true);
  start(files[0]);
});
$('#sample').addEventListener('click', async (e) => {
  e.stopPropagation();
  const res = await fetch('sample.jpg');
  start(new File([await res.blob()], 'portrait.jpg', { type: 'image/jpeg' }));
});
$('#preset').addEventListener('click', (e) => {
  if (!e.target.dataset.v) return;
  state.preset = e.target.dataset.v;
  for (const b of $('#preset').children) b.setAttribute('aria-pressed', String(b === e.target));
  Object.assign(state, { dx: 0, dy: 0, zoom: 1 });
  $('#zoom').value = 100; $('#zOut').value = '100%';
  render();
});
$('#zoom').addEventListener('input', (e) => {
  state.zoom = e.target.value / 100;
  $('#zOut').value = `${e.target.value}%`;
  render();
});
$('#reset').addEventListener('click', () => {
  Object.assign(state, { dx: 0, dy: 0, zoom: 1 });
  $('#zoom').value = 100; $('#zOut').value = '100%';
  render();
});
$('#white').addEventListener('change', async () => {
  render();
  if ($('#white').checked && state.img && !state.cut) await removeBg();
});
$('#saveOne').addEventListener('click', saveOne);
$('#saveSheet').addEventListener('click', saveSheet);

// Drag the photo inside the frame. Offsets are kept in mm so every output size matches the preview.
single.addEventListener('pointerdown', (e) => {
  if (!state.face) return;
  single.setPointerCapture(e.pointerId);
  const k = single.width / single.clientWidth / (PX_MM * 2);
  let x = e.clientX, y = e.clientY;
  const move = (ev) => {
    state.dx += (ev.clientX - x) * k; state.dy += (ev.clientY - y) * k;
    x = ev.clientX; y = ev.clientY;
    render();
  };
  single.addEventListener('pointermove', move);
  single.addEventListener('pointerup', () => single.removeEventListener('pointermove', move), { once: true });
});

async function start(file) {
  if (state.busy) return;
  state.busy = true;
  setButtons(false);
  status(statusEl, '');
  try {
    const img = await loadImage(file);
    Object.assign(state, { file, img, cut: null, face: null, dx: 0, dy: 0, zoom: 1 });
    $('#zoom').value = 100; $('#zOut').value = '100%';
    await loadLandmarker();
    state.face = findFace(img);
    $('#drop').hidden = true;
    $('#result').hidden = false;
    render();
    setButtons(true);
    if ($('#white').checked) await removeBg();
  } catch (e) {
    progress(barEl, null);
    status(statusEl, e.message, true);
  } finally {
    state.busy = false;
  }
}

function setButtons(on) {
  for (const id of ['#saveOne', '#saveSheet', '#reset']) $(id).disabled = !on;
}

async function fetchProgress(urls, label) {
  const total = [], got = [];
  await Promise.all(urls.map(async (url, i) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error();
    total[i] = +res.headers.get('content-length') || 0;
    got[i] = 0;
    const reader = res.body.getReader();
    const parts = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      got[i] += value.length;
      const t = total.reduce((a, b) => a + b, 0);
      if (t) progress(barEl, got.reduce((a, b) => a + b, 0) / t);
      status(statusEl, `${label} ${(got.reduce((a, b) => a + b, 0) / 1048576).toFixed(1)} MB`);
    }
    got[i] = new Uint8Array(await new Blob(parts).arrayBuffer());
  }));
  progress(barEl, null);
  return got;
}

async function loadLandmarker() {
  if (landmarker) return;
  try {
    // The wasm is fetched once here for a visible progress bar; MediaPipe then reads it from the HTTP cache.
    const [, model] = await fetchProgress([`${MP}/wasm/vision_wasm_internal.wasm`, FACE_MODEL], '얼굴 인식 모델 받는 중');
    const { FilesetResolver, FaceLandmarker } = await import(`${MP}/vision_bundle.mjs`);
    const files = await FilesetResolver.forVisionTasks(`${MP}/wasm`);
    landmarker = await FaceLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetBuffer: model }, runningMode: 'IMAGE', numFaces: 3,
    });
    status(statusEl, '');
  } catch {
    progress(barEl, null);
    throw new Error('얼굴 인식 모델을 불러오지 못했습니다. 인터넷 연결을 확인하고 최신 Chrome, Edge, Safari에서 다시 시도하세요.');
  }
}

// Skull top (hair excluded) is estimated from the face mesh: it sits about 1.95× the eye-to-upper-forehead
// (landmark 10) distance above the eyes. This ignores the mouth, so a smile does not change the result.
// Returns the head centre, roll angle, skull-top-to-chin length in source pixels and where the eyes sit.
function findFace(img) {
  const faces = landmarker.detect(img).faceLandmarks;
  if (!faces.length) throw new Error('얼굴을 찾지 못했습니다. 정면을 보고 얼굴이 크게 나온 사진을 쓰세요.');
  const W = img.naturalWidth, H = img.naturalHeight;
  const pt = (f, i) => ({ x: f[i].x * W, y: f[i].y * H });
  const size = (f) => Math.hypot(pt(f, 152).x - pt(f, 10).x, pt(f, 152).y - pt(f, 10).y);
  const f = faces.reduce((a, b) => (size(b) > size(a) ? b : a));
  const l = pt(f, 468), r = pt(f, 473), chin = pt(f, 152), fh = pt(f, 10);
  const eye = { x: (l.x + r.x) / 2, y: (l.y + r.y) / 2 };
  const top = { x: eye.x - 1.95 * (eye.x - fh.x), y: eye.y - 1.95 * (eye.y - fh.y) };
  const mid = { x: (top.x + chin.x) / 2, y: (top.y + chin.y) / 2 };
  const head = Math.hypot(chin.x - top.x, chin.y - top.y);
  const [a, b] = l.x < r.x ? [l, r] : [r, l];
  return { mid, head, eyeOff: (Math.hypot(eye.x - top.x, eye.y - top.y) - head / 2) / head, angle: Math.atan2(b.y - a.y, b.x - a.x), many: faces.length > 1 };
}

async function removeBg() {
  if (state.loading) return;
  state.loading = true;
  const file = state.file;
  status(statusEl, '배경 인식 모델을 불러오는 중…');
  progress(barEl, 0);
  try {
    const lib = await import(BG_LIB);
    const seen = {};
    const opts = {
      model: 'isnet_fp16',
      output: { format: 'image/png' },
      progress: (key, cur, total) => {
        if (key.startsWith('fetch:')) {
          seen[key] = [cur, total];
          const [c, t] = Object.values(seen).reduce(([x, y], [p, q]) => [x + p, y + q], [0, 0]);
          progress(barEl, c / t);
          status(statusEl, `배경 인식 모델 받는 중 ${(c / 1048576).toFixed(0)} MB`);
        } else if (key === 'compute:inference') {
          progress(barEl, null);
          status(statusEl, '배경을 지우는 중…');
        }
      },
    };
    const device = navigator.gpu ? 'gpu' : 'cpu';
    let blob;
    try { blob = await lib.removeBackground(file, { ...opts, device }); } catch (e) {
      if (device === 'cpu') throw e;
      blob = await lib.removeBackground(file, { ...opts, device: 'cpu' });
    }
    if (file === state.file) state.cut = await createImageBitmap(blob);
    state.loading = false;
    if (file !== state.file && $('#white').checked) return removeBg();
    render();
  } catch {
    state.loading = false;
    progress(barEl, null);
    $('#white').checked = false;
    status(statusEl, '배경을 지우지 못했습니다. 최신 Chrome, Edge, Safari에서 다시 시도하세요.', true);
  }
}

// Draws one photo with its top-left at (x, y) using pxmm pixels per mm. Returns guide positions.
function drawPhoto(ctx, x, y, pxmm) {
  const P = PRESETS[state.preset];
  const W = P.w * pxmm, H = P.h * pxmm;
  const f = state.face;
  const head = P.head * state.zoom * pxmm;
  const cx = x + W / 2 + state.dx * pxmm;
  const cy = y + (P.top + P.head / 2 + state.dy) * pxmm;
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, W, H); ctx.clip();
  ctx.fillStyle = '#fff'; ctx.fillRect(x, y, W, H);
  ctx.translate(cx, cy);
  ctx.rotate(-f.angle);
  ctx.scale(head / f.head, head / f.head);
  ctx.translate(-f.mid.x, -f.mid.y);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage($('#white').checked && state.cut ? state.cut : state.img, 0, 0);
  ctx.restore();
  return { top: cy - head / 2, chin: cy + head / 2 };
}

function sheetLayout() {
  const P = PRESETS[state.preset];
  const SW = 152.4, SH = 101.6;
  const fit = (gap, margin) => {
    const cols = Math.floor((SW - 2 * margin + gap) / (P.w + gap));
    const rows = Math.floor((SH - 2 * margin + gap) / (P.h + gap));
    return { cols, rows, gap, n: cols * rows };
  };
  const a = fit(2, 3), b = fit(0, 0);
  return { ...(a.n < 4 ? b : a), SW, SH, P };
}

function drawSheet(canvas, pxmm) {
  const L = sheetLayout();
  canvas.width = Math.round(L.SW * pxmm); canvas.height = Math.round(L.SH * pxmm);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const gw = L.cols * L.P.w + (L.cols - 1) * L.gap, gh = L.rows * L.P.h + (L.rows - 1) * L.gap;
  const x0 = (L.SW - gw) / 2, y0 = (L.SH - gh) / 2;
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--line-strong').trim();
  ctx.lineWidth = Math.max(1, pxmm / 12);
  for (let r = 0; r < L.rows; r++) {
    for (let c = 0; c < L.cols; c++) {
      const x = (x0 + c * (L.P.w + L.gap)) * pxmm, y = (y0 + r * (L.P.h + L.gap)) * pxmm;
      drawPhoto(ctx, x, y, pxmm);
      ctx.strokeRect(x, y, L.P.w * pxmm, L.P.h * pxmm);
    }
  }
  return L.n;
}

function render() {
  const P = PRESETS[state.preset];
  $('#spec').textContent = P.spec;
  $('#whiteHint').hidden = !($('#white').checked && (state.preset === 'passport' || state.preset === 'us'));
  if (!state.face) return;
  const pxmm = PX_MM * 2;
  single.width = Math.round(P.w * pxmm); single.height = Math.round(P.h * pxmm);
  const ctx = single.getContext('2d');
  const g = drawPhoto(ctx, 0, 0, pxmm);
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--link').trim();
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 8]);
  for (const y of [g.top, g.chin]) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(single.width, y); ctx.stroke(); }
  const n = drawSheet(sheet, 6);
  const sizeTxt = state.preset === 'us' ? '2×2in' : `${P.w / 10}×${P.h / 10}cm`;
  $('#capA').textContent = `사진 · ${sizeTxt} · ${Math.round(P.w * PX_MM)}×${Math.round(P.h * PX_MM)}px`;
  $('#capB').textContent = `4×6 인화지 · ${n}장`;
  const head = P.head * state.zoom;
  let msg;
  if (state.preset === 'us') {
    const eyeUp = P.h - (P.top + P.head / 2 + state.dy + state.face.eyeOff * head);
    msg = `머리카락 포함 머리 약 ${(head * HAIR).toFixed(0)}mm · 눈 높이 약 ${eyeUp.toFixed(0)}mm`;
    if (head * HAIR < 25 || head * HAIR > 35 || eyeUp < 28 || eyeUp > 35) msg += ' · 규격 범위를 벗어났습니다';
  } else {
    msg = `머리 길이 약 ${(head / 10).toFixed(2)}cm`;
    if (P.range && (head < P.range[0] || head > P.range[1])) msg += ' · 규격 범위를 벗어났습니다';
  }
  if (state.face.many) msg += ' · 가장 큰 얼굴로 맞췄습니다';
  if (!state.loading) status(statusEl, msg);
}

async function jpeg(canvas) {
  // Write 300 dpi into the JFIF header so print shops and editors read the physical size.
  const buf = new Uint8Array(await (await toBlob(canvas, 'image/jpeg', 0.92)).arrayBuffer());
  if (buf[2] === 0xff && buf[3] === 0xe0 && String.fromCharCode(...buf.slice(6, 10)) === 'JFIF') {
    buf[13] = 1;
    buf[14] = buf[16] = DPI >> 8;
    buf[15] = buf[17] = DPI & 255;
  }
  return new Blob([buf], { type: 'image/jpeg' });
}

async function saveOne() {
  const P = PRESETS[state.preset];
  const c = document.createElement('canvas');
  c.width = Math.round(P.w * PX_MM); c.height = Math.round(P.h * PX_MM);
  drawPhoto(c.getContext('2d'), 0, 0, PX_MM);
  download(await jpeg(c), `${baseName(state.file)}-${P.file}.jpg`);
}

async function saveSheet() {
  const c = document.createElement('canvas');
  drawSheet(c, PX_MM);
  download(await jpeg(c), `${baseName(state.file)}-${PRESETS[state.preset].file}-4x6.jpg`);
}

render();
