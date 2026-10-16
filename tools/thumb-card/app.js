import { $, fileInput, status, download, bytes, baseName, loadImage, toBlob } from '../common/tool.js';

const W = 1280, H = 720, MAX_JPG = 2 * 1024 * 1024; // YouTube custom thumbnail limit
const INKS = ['#FFFFFF', '#FFE14D', '#111111', '#FF3B30', '#3BA3FF'];
const ACCENTS = ['#FFE14D', '#FF3B30', '#3BA3FF', '#39E58C', '#FFFFFF'];
const FONTS = {
  pretendard: (s) => `900 ${s}px "Pretendard Variable", Pretendard, sans-serif`,
  blackhan: (s) => `400 ${s}px "Black Han Sans", sans-serif`,
};

const cv = $('#thumb'), cx = cv.getContext('2d'), statusEl = $('#status');
const S = { img: null, file: null, zoom: 1, px: W / 2, py: H / 2, layout: 'left', font: 'pretendard', ink: INKS[0], accent: ACCENTS[0], hi: 1 };

function seg(id, key, cast = (v) => v) {
  $(id).addEventListener('click', (e) => {
    const v = e.target.dataset.v;
    if (v == null) return;
    S[key] = cast(v);
    for (const b of $(id).children) b.setAttribute('aria-pressed', String(b.dataset.v === v));
    render();
  });
}
seg('#layout', 'layout');
seg('#font', 'font');
seg('#hiLine', 'hi', Number);

function swatches(id, list, key) {
  const box = $(id);
  const mark = () => { for (const b of box.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.v === S[key])); };
  for (const c of list) {
    const b = Object.assign(document.createElement('button'), { type: 'button', title: c });
    b.dataset.v = c; b.style.background = c;
    b.onclick = () => { S[key] = c; mark(); render(); };
    box.append(b);
  }
  const custom = Object.assign(document.createElement('input'), { type: 'color', value: S[key].toLowerCase(), title: '직접 고르기' });
  custom.oninput = () => { S[key] = custom.value.toUpperCase(); mark(); render(); };
  box.append(custom);
  mark();
}
swatches('#ink', INKS, 'ink');
swatches('#accent', ACCENTS, 'accent');

$('#title').addEventListener('input', render);
$('#stroke').addEventListener('change', render);
$('#fs').addEventListener('input', (e) => { $('#fsOut').value = `${e.target.value}px`; render(); });
$('#dim').addEventListener('input', (e) => { $('#dimOut').value = e.target.value; render(); });
$('#zoom').addEventListener('input', (e) => { S.zoom = e.target.value / 100; $('#zOut').value = `${e.target.value}%`; clampPan(); render(); });

// ---------- background: cover-fit, zoom, drag to pan ----------
function cover() {
  const s = Math.max(W / S.img.naturalWidth, H / S.img.naturalHeight) * S.zoom;
  return { w: S.img.naturalWidth * s, h: S.img.naturalHeight * s };
}
function clampPan() {
  if (!S.img) return;
  const { w, h } = cover();
  S.px = Math.min(w / 2, Math.max(W - w / 2, S.px));
  S.py = Math.min(h / 2, Math.max(H - h / 2, S.py));
}
let drag = null;
cv.addEventListener('pointerdown', (e) => { if (!S.img) return; e.preventDefault(); drag = { x: e.clientX, y: e.clientY, px: S.px, py: S.py }; cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const k = W / cv.getBoundingClientRect().width;
  S.px = drag.px + (e.clientX - drag.x) * k; S.py = drag.py + (e.clientY - drag.y) * k;
  clampPan();
  render();
});
cv.addEventListener('pointerup', () => { drag = null; });
cv.addEventListener('pointercancel', () => { drag = null; });
cv.addEventListener('wheel', (e) => {
  if (!S.img) return;
  e.preventDefault();
  const z = Math.min(300, Math.max(100, Math.round(S.zoom * 100 - e.deltaY * 0.2)));
  $('#zoom').value = z; $('#zoom').dispatchEvent(new Event('input'));
}, { passive: false });

// ---------- text ----------
const lumOf = (hex) => { const n = parseInt(hex.slice(1), 16); return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255); };
const onColor = (hex) => (lumOf(hex) > 150 ? '#111111' : '#FFFFFF');

function layoutText(ctx, lines, size) {
  // shrink until the widest line fits
  const maxW = S.layout === 'center' ? W - 120 : W - 128 - (S.layout === 'tag' ? 48 : 0);
  let s = size;
  for (; s > 24; s -= 2) {
    ctx.font = FONTS[S.font](s);
    if (Math.max(...lines.map((l) => ctx.measureText(l).width)) <= maxW) break;
  }
  return s;
}

function drawText(ctx) {
  const lines = $('#title').value.split('\n').map((l) => l.trim());
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  while (lines.length && !lines[0]) lines.shift();
  if (!lines.length) return;
  const size = layoutText(ctx, lines, +$('#fs').value), lh = Math.round(size * 1.16);
  ctx.font = FONTS[S.font](size);
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const colorOf = (i) => (i === S.hi ? S.accent : S.ink);
  const stroke = $('#stroke').checked;
  const strokeColor = (c) => (lumOf(c) > 110 ? '#000000' : '#FFFFFF');
  const gap = S.layout === 'tag' ? 14 : 0, step = lh + gap, block = lines.length * step - gap;
  let x, y0, align;
  if (S.layout === 'center') { align = 'center'; x = W / 2; y0 = (H - block) / 2; }
  else if (S.layout === 'band') {
    align = 'left'; x = 64;
    const bandH = block + 56;
    ctx.fillStyle = 'rgba(10,10,10,0.86)';
    ctx.fillRect(0, H - bandH, W, bandH);
    ctx.fillStyle = S.accent;
    ctx.fillRect(0, H - bandH, 16, bandH);
    y0 = H - bandH + 28;
  } else { align = 'left'; x = S.layout === 'tag' ? 88 : 64; y0 = H - (S.layout === 'tag' ? 72 : 64) - block; }
  ctx.textAlign = align;
  lines.forEach((line, i) => {
    if (!line) return;
    const y = y0 + i * step + lh / 2;
    let fill = colorOf(i);
    if (S.layout === 'tag') {
      const w = ctx.measureText(line).width, padX = size * 0.28;
      const box = i === S.hi ? S.accent : '#111111';
      ctx.fillStyle = box;
      ctx.fillRect(x - padX, y - lh / 2, w + padX * 2, lh);
      fill = i === S.hi ? onColor(S.accent) : (lumOf(S.ink) < 60 ? '#FFFFFF' : S.ink);
      ctx.fillStyle = fill;
      ctx.fillText(line, x, y + size * 0.04);
      return;
    }
    if (stroke) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = size * 0.18; ctx.shadowOffsetY = size * 0.04;
      ctx.strokeStyle = strokeColor(fill); ctx.lineWidth = size * 0.16;
      ctx.strokeText(line, x, y);
      ctx.restore();
    }
    ctx.fillStyle = fill;
    ctx.fillText(line, x, y);
  });
}

function draw(ctx) {
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, W, H);
  if (S.img) {
    const { w, h } = cover();
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(S.img, S.px - w / 2, S.py - h / 2, w, h);
  }
  const dim = +$('#dim').value / 100;
  if (dim) { ctx.fillStyle = `rgba(0,0,0,${dim})`; ctx.fillRect(0, 0, W, H); }
  drawText(ctx);
}

let raf = 0, fontJob = 0;
async function render() {
  const my = ++fontJob, text = $('#title').value || ' ';
  try { await document.fonts.load(FONTS[S.font](100), text); } catch { /* fall back to system font */ }
  if (my !== fontJob) return;
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => draw(cx));
}

// ---------- files / export ----------
fileInput($('#drop'), $('#file'), async (files, err) => {
  if (err) return status(statusEl, err.message, true);
  try {
    const img = await loadImage(files[0]);
    if (S.img) URL.revokeObjectURL(S.img.src);
    Object.assign(S, { img, file: files[0], zoom: 1, px: W / 2, py: H / 2 });
    $('#zoom').value = 100; $('#zOut').value = '100%';
    $('#zoom').disabled = false;
    $('#drop').hidden = true;
    cv.hidden = false;
    $('#stage').classList.add('has');
    for (const id of ['#saveJpg', '#savePng', '#again']) $(id).disabled = false;
    status(statusEl, `${img.naturalWidth}×${img.naturalHeight} 사진 · 끌어서 위치를 맞추세요.`);
    render();
  } catch (e) { status(statusEl, e.message, true); }
});
$('#again').addEventListener('click', () => $('#file').click());

async function exportBlob(type) {
  await render();
  await new Promise(requestAnimationFrame);
  const c = Object.assign(document.createElement('canvas'), { width: W, height: H });
  draw(c.getContext('2d'));
  if (type === 'image/png') return toBlob(c, type);
  let q = 0.92, blob = await toBlob(c, type, q);
  while (blob.size > MAX_JPG && q > 0.5) { q -= 0.07; blob = await toBlob(c, type, q); }
  return blob;
}
$('#saveJpg').addEventListener('click', async () => {
  const b = await exportBlob('image/jpeg');
  download(b, `${baseName(S.file)}-thumbnail.jpg`);
  status(statusEl, `1280×720 JPG · ${bytes(b.size)}`);
});
$('#savePng').addEventListener('click', async () => {
  const b = await exportBlob('image/png');
  download(b, `${baseName(S.file)}-thumbnail.png`);
  status(statusEl, `1280×720 PNG · ${bytes(b.size)}${b.size > MAX_JPG ? ' · 유튜브에는 2MB 아래 JPG를 올리세요.' : ''}`);
});

render();
