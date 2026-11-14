import { $, fileInput, status, progress, download, baseName, loadImage, toBlob } from '../common/tool.js';

const BG_URL = 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm';
const BG_MODEL = 'isnet_quint8';
const MAX_SIDE = 2560;
const BACKS = [['bg-woodwall.jpg', '원목 테이블'], ['bg-corner.jpg', '둥근 테이블'], ['bg-teapot.jpg', '창틀'], ['bg-workspace.jpg', '책상']];

const statusEl = $('#status'), prog = $('#prog'), cv = $('#scene'), cx = cv.getContext('2d');
const S = { file: null, bg: null, p: null, format: 'image/jpeg' };

// ---------- background removal ----------
let bgLib = null;
async function cutout(blob) {
  bgLib ??= import(BG_URL).catch((e) => { bgLib = null; throw e; });
  const { removeBackground } = await bgLib;
  return removeBackground(blob, {
    model: BG_MODEL,
    output: { format: 'image/png' },
    progress: (key, cur, total) => {
      if (key.startsWith('fetch') && total) {
        progress(prog, cur / total);
        status(statusEl, `배경 지우기 모델 받는 중 ${Math.round((cur / total) * 100)}%`);
      } else if (key.startsWith('compute')) {
        progress(prog, null);
        status(statusEl, '제품 배경을 지우는 중입니다.');
      }
    },
  });
}
function hasTransparency(img) {
  const c = document.createElement('canvas');
  c.width = Math.min(256, img.naturalWidth); c.height = Math.max(1, Math.round((img.naturalHeight * c.width) / img.naturalWidth));
  const x = c.getContext('2d'); x.drawImage(img, 0, 0, c.width, c.height);
  const d = x.getImageData(0, 0, c.width, c.height).data;
  let clear = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 250) clear++;
  return clear > d.length / 4 / 50;
}
function trim(img) {
  const c = document.createElement('canvas');
  const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
  c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  const x = c.getContext('2d'); x.drawImage(img, 0, 0, c.width, c.height);
  const d = x.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let xx = 0; xx < c.width; xx++) {
    if (d[(y * c.width + xx) * 4 + 3] > 16) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return null;
  const t = Object.assign(document.createElement('canvas'), { width: x1 - x0 + 1, height: y1 - y0 + 1 });
  t.getContext('2d').drawImage(c, x0, y0, t.width, t.height, 0, 0, t.width, t.height);
  return t;
}
// contact shadow: the silhouette squashed into a band at the base; a wide soft layer plus a tight dark one where it touches
function makeShadow(img) {
  const W = 512, c = Object.assign(document.createElement('canvas'), { width: W * 1.4, height: W * 0.3 });
  const x = c.getContext('2d'), off = c.width * 2;
  x.shadowColor = 'rgba(0,0,0,0.9)'; x.shadowBlur = W * 0.03; x.shadowOffsetX = off;
  x.drawImage(img, W * 0.2 - off, c.height / 2 - W * 0.05, W, W * 0.1);
  x.shadowColor = '#000'; x.shadowBlur = W * 0.012;
  x.drawImage(img, 0, img.height * 0.85, img.width, img.height * 0.15, W * 0.2 - off, c.height / 2 - W * 0.012, W, W * 0.024);
  return c;
}

// ---------- product color: brightness (exposure) and warmth (red/blue balance) ----------
function applyAdjust() {
  const p = S.p, f = 2 ** (p.bright / 100), wr = 1 + p.warm / 250, wb = 1 - p.warm / 250;
  const img = new ImageData(new Uint8ClampedArray(p.data.data), p.data.width, p.data.height), d = img.data;
  for (let i = 0; i < d.length; i += 4) { d[i] *= f * wr; d[i + 1] *= f; d[i + 2] *= f * wb; }
  p.adj.getContext('2d').putImageData(img, 0, 0);
}
// light level = 97th-percentile luminance (specular/white parts), light color = average of the brightest 5%
function lightOf(d, useAlpha) {
  const px = [];
  for (let i = 0; i < d.length; i += 16) if (!useAlpha || d[i + 3] > 200) px.push(i);
  if (!px.length) return { L: 128, t: 0 };
  const L = (i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  px.sort((a, b) => L(a) - L(b));
  const top = px.slice(Math.floor(px.length * 0.95));
  let r = 0, g = 0, b = 0;
  for (const i of top) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
  return { L: Math.max(1, L(px[Math.floor(px.length * 0.97)])), t: (r - b) / Math.max(1, r + g + b) };
}
// moves the product halfway toward the light around where it stands
function matchToBackground() {
  const p = S.p, { w, h } = geom();
  const X = p.nx * cv.width, Y = p.ny * cv.height;
  const rx = Math.max(0, Math.round(X - w * 1.5)), ry = Math.max(0, Math.round(Y - h * 2));
  const rw = Math.min(cv.width - rx, Math.round(w * 3)), rh = Math.min(cv.height - ry, Math.round(h * 2.5));
  const around = lightOf(S.bg.getContext('2d').getImageData(rx, ry, Math.max(1, rw), Math.max(1, rh)).data, false);
  const mine = lightOf(p.data.data, true);
  p.bright = Math.round(Math.max(-35, Math.min(35, 50 * Math.log2(around.L / mine.L))));
  p.warm = Math.round(Math.max(-35, Math.min(35, 187 * (around.t - mine.t))));
  applyAdjust();
  sync();
  render();
}

// ---------- scene ----------
function geom() {
  const p = S.p, h = p.nh * cv.height;
  return { w: (h * p.src.width) / p.src.height, h };
}
function draw(ctx, ui) {
  ctx.drawImage(S.bg, 0, 0);
  const p = S.p;
  if (!p) return;
  const { w, h } = geom(), X = p.nx * cv.width, Y = p.ny * cv.height;
  if (p.shadow > 0) {
    ctx.save();
    ctx.globalAlpha = p.shadow / 100;
    ctx.translate(X, Y);
    if (p.flip) ctx.scale(-1, 1);
    ctx.drawImage(p.sh, -w * 0.7, -w * 0.15, w * 1.4, w * 0.3);
    ctx.restore();
  }
  ctx.save();
  ctx.translate(X, Y - h / 2);
  ctx.scale(p.flip ? -1 : 1, 1);
  ctx.drawImage(p.adj, -w / 2, -h / 2, w, h);
  ctx.restore();
  if (ui && p.selected) {
    const u = cv.width / cv.getBoundingClientRect().width;
    ctx.save();
    ctx.lineWidth = 1.5 * u;
    ctx.setLineDash([6 * u, 4 * u]);
    ctx.strokeStyle = '#fff'; ctx.strokeRect(X - w / 2, Y - h, w, h);
    ctx.strokeStyle = '#171717'; ctx.lineDashOffset = 6 * u; ctx.strokeRect(X - w / 2, Y - h, w, h);
    ctx.setLineDash([]);
    ctx.fillStyle = '#fff';
    ctx.fillRect(X + w / 2 - 7 * u, Y - 7 * u, 14 * u, 14 * u);
    ctx.strokeRect(X + w / 2 - 7 * u, Y - 7 * u, 14 * u, 14 * u);
    ctx.restore();
  }
}
let raf = 0;
const render = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => draw(cx, true)); };

function pt(e) {
  const r = cv.getBoundingClientRect();
  return [((e.clientX - r.left) * cv.width) / r.width, ((e.clientY - r.top) * cv.height) / r.height];
}
function where(px, py) {
  const p = S.p;
  if (!p) return null;
  const { w, h } = geom(), X = p.nx * cv.width, Y = p.ny * cv.height, r = (16 * cv.width) / cv.getBoundingClientRect().width;
  if (Math.abs(px - (X + w / 2)) < r && Math.abs(py - Y) < r) return 'size';
  if (Math.abs(px - X) <= w / 2 && py >= Y - h && py <= Y) return 'move';
  return null;
}
let drag = null;
cv.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  const [px, py] = pt(e), hit = where(px, py);
  if (!S.p) return;
  S.p.selected = !!hit;
  if (hit === 'size') drag = { mode: 'size', nh0: S.p.nh, d0: Math.hypot(px - S.p.nx * cv.width, py - S.p.ny * cv.height) };
  if (hit === 'move') drag = { mode: 'move', dx: px - S.p.nx * cv.width, dy: py - S.p.ny * cv.height };
  if (drag) cv.setPointerCapture(e.pointerId);
  render();
});
cv.addEventListener('pointermove', (e) => {
  const [px, py] = pt(e);
  if (!drag) { const w = where(px, py); cv.style.cursor = w === 'size' ? 'nwse-resize' : w ? 'move' : 'default'; return; }
  const p = S.p;
  if (drag.mode === 'move') { p.nx = (px - drag.dx) / cv.width; p.ny = (py - drag.dy) / cv.height; }
  else p.nh = Math.max(0.03, (drag.nh0 * Math.hypot(px - p.nx * cv.width, py - p.ny * cv.height)) / Math.max(1, drag.d0));
  sync();
  render();
});
cv.addEventListener('pointerup', () => { drag = null; });
cv.addEventListener('pointercancel', () => { drag = null; });

function sync() {
  const p = S.p;
  if (!p) return;
  const pct = Math.round((p.nh / p.nh0) * 100);
  $('#size').value = Math.min(300, pct); $('#sizeOut').value = `${pct}%`;
  $('#shadow').value = p.shadow; $('#shOut').value = p.shadow;
  $('#bright').value = p.bright; $('#brOut').value = p.bright;
  $('#warm').value = p.warm; $('#wmOut').value = p.warm;
}
$('#size').addEventListener('input', (e) => { if (S.p) { S.p.nh = (S.p.nh0 * e.target.value) / 100; sync(); render(); } });
$('#shadow').addEventListener('input', (e) => { if (S.p) { S.p.shadow = +e.target.value; sync(); render(); } });
for (const k of ['bright', 'warm']) {
  $(`#${k}`).addEventListener('input', (e) => { if (S.p) { S.p[k] = +e.target.value; sync(); applyAdjust(); render(); } });
}
$('#match').addEventListener('click', () => S.p && matchToBackground());
$('#flip').addEventListener('click', () => { if (S.p) { S.p.flip = !S.p.flip; render(); } });
$('#other').addEventListener('click', () => $('#file').click());

// ---------- backgrounds ----------
let bgIndex = 0;
$('#bgs').append(...BACKS.map(([src, name], i) => {
  const b = Object.assign(document.createElement('button'), { type: 'button', title: name });
  b.setAttribute('aria-pressed', String(i === 0));
  b.append(Object.assign(document.createElement('img'), { src, alt: name }));
  b.onclick = async () => { bgIndex = i; markBg(); setBackground(await loadImage(src)); };
  return b;
}));
function markBg() { [...$('#bgs').children].forEach((b, i) => b.setAttribute('aria-pressed', String(i === bgIndex))); }
$('#bgBtn').addEventListener('click', () => $('#bgFile').click());
$('#bgFile').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try { bgIndex = -1; markBg(); setBackground(await loadImage(f)); } catch (err) { status(statusEl, err.message, true); }
});
function setBackground(img) {
  const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const c = Object.assign(document.createElement('canvas'), { width: Math.round(img.naturalWidth * k), height: Math.round(img.naturalHeight * k) });
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
  S.bg = c;
  cv.width = c.width; cv.height = c.height;
  render();
}

// ---------- product ----------
fileInput($('#drop'), $('#file'), (files, err) => {
  if (err) return status(statusEl, err.message, true);
  openProduct(files[0]);
});
$('#sample').addEventListener('click', async (e) => {
  e.stopPropagation();
  const res = await fetch('sample.jpg');
  openProduct(new File([await res.blob()], 'mug.jpg', { type: 'image/jpeg' }));
});

let job = 0;
async function openProduct(file) {
  const my = ++job;
  $('#save').disabled = true;
  try {
    let img = await loadImage(file);
    if (!hasTransparency(img)) {
      status(statusEl, '제품 배경을 지우는 중입니다.');
      const png = await cutout(file);
      URL.revokeObjectURL(img.src);
      img = await loadImage(png);
    }
    if (my !== job) return;
    const src = trim(img);
    URL.revokeObjectURL(img.src);
    if (!src) throw new Error('제품을 찾지 못했습니다. 제품이 크게 보이는 사진으로 다시 올려 주세요.');
    if (!S.bg) { markBg(); setBackground(await loadImage(BACKS[0][0])); }
    const adj = Object.assign(document.createElement('canvas'), { width: src.width, height: src.height });
    const data = src.getContext('2d').getImageData(0, 0, src.width, src.height);
    const nh0 = Math.min(0.4, (0.35 * cv.width * src.height) / (src.width * cv.height));
    S.p = { src, adj, data, sh: makeShadow(src), nx: 0.5, ny: 0.8, nh: nh0, nh0, flip: false, shadow: 55, bright: 0, warm: 0, selected: true };
    S.file = file;
    applyAdjust();
    $('#drop').hidden = true;
    cv.hidden = false;
    $('#stage').classList.add('has');
    $('#adj').disabled = false;
    $('#save').disabled = false;
    sync();
    render();
    status(statusEl, '제품을 끌어 자리를 잡고, 오른쪽 아래 네모로 크기를 바꾸세요.');
  } catch (e) {
    console.error(e);
    status(statusEl, e.message?.startsWith('제품') || e.message?.startsWith('이미지') ? e.message
      : '배경을 지우지 못했습니다. 네트워크를 확인하고 다시 올려 주세요. 최신 Chrome, Edge, Safari에서 동작합니다.', true);
  } finally {
    progress(prog, null);
  }
}

$('#format').addEventListener('click', (e) => {
  if (!e.target.dataset.v) return;
  S.format = e.target.dataset.v;
  for (const b of $('#format').children) b.setAttribute('aria-pressed', String(b.dataset.v === S.format));
});
$('#save').addEventListener('click', async () => {
  const c = Object.assign(document.createElement('canvas'), { width: cv.width, height: cv.height });
  draw(c.getContext('2d'), false);
  download(await toBlob(c, S.format, 0.92), `${baseName(S.file)}-scene.${S.format === 'image/png' ? 'png' : 'jpg'}`);
});
