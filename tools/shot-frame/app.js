import { $, fileInput, status, download, baseName, loadImage, toBlob } from '../common/tool.js';

const state = { file: null, img: null, chrome: 'mac', bg: '#f5f5f5', ratio: 0 };
const statusEl = $('#status');
const preview = $('#preview');
const FONT = getComputedStyle(document.body).fontFamily;
const BAR = { mac: 32, browser: 44, none: 0 };

fileInput($('#drop'), $('#file'), async (files, err) => {
  if (err) return status(statusEl, err.message, true);
  try {
    const img = await loadImage(files[0]);
    if (state.img) URL.revokeObjectURL(state.img.src);
    Object.assign(state, { file: files[0], img });
    $('#drop').hidden = true;
    $('#view').hidden = false;
    $('#save').disabled = $('#other').disabled = false;
    render();
  } catch (e) {
    status(statusEl, e.message, true);
  }
});

for (const b of $('#bg').querySelectorAll('button')) b.style.background = b.dataset.v;
$('#bg').addEventListener('click', (e) => {
  if (!e.target.dataset.v) return;
  state.bg = e.target.dataset.v;
  for (const b of $('#bg').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b === e.target));
  render();
});
$('#color').addEventListener('input', (e) => {
  state.bg = e.target.value;
  for (const b of $('#bg').querySelectorAll('button')) b.setAttribute('aria-pressed', 'false');
  render();
});
for (const [id, key, num] of [['#chrome', 'chrome'], ['#ratio', 'ratio', true]]) {
  $(id).addEventListener('click', (e) => {
    if (e.target.dataset.v == null) return;
    state[key] = num ? +e.target.dataset.v : e.target.dataset.v;
    for (const b of $(id).children) b.setAttribute('aria-pressed', String(b === e.target));
    render();
  });
}
for (const [id, out, unit] of [['#pad', '#padOut', 'px'], ['#rad', '#radOut', 'px'], ['#shadow', '#shOut', '']]) {
  $(id).addEventListener('input', (e) => { $(out).value = e.target.value + unit; render(); });
}
$('#title').addEventListener('input', render);
$('#other').addEventListener('click', () => $('#file').click());
$('#save').addEventListener('click', async () => {
  const c = document.createElement('canvas');
  draw(c, 2);
  const blob = await toBlob(c, 'image/png');
  download(blob, `${baseName(state.file)}-frame.png`);
  status(statusEl, `${c.width}×${c.height} PNG`);
});

// Screenshots wider than 2000px are taken on 2x (Retina/HiDPI) screens; lay them out at half size
// so window bars and padding keep the same proportions as on a 1x screenshot.
function srcScale() {
  return state.img.naturalWidth >= 2000 ? 2 : 1;
}

function layout() {
  const s = srcScale();
  const sw = state.img.naturalWidth / s, sh = state.img.naturalHeight / s;
  const bar = BAR[state.chrome];
  const pad = +$('#pad').value;
  const ww = sw, wh = sh + bar;
  let W = ww + 2 * pad, H = wh + 2 * pad;
  if (state.ratio) {
    if (W / H < state.ratio) W = H * state.ratio; else H = W / state.ratio;
  }
  return { sw, sh, bar, ww, wh, W: Math.round(W), H: Math.round(H) };
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function draw(canvas, k) {
  const L = layout();
  canvas.width = L.W * k; canvas.height = L.H * k;
  const ctx = canvas.getContext('2d');
  ctx.scale(k, k);
  ctx.fillStyle = state.bg;
  ctx.fillRect(0, 0, L.W, L.H);
  const x = (L.W - L.ww) / 2, y = (L.H - L.wh) / 2;
  const r = Math.min(+$('#rad').value, L.ww / 2, L.wh / 2);
  const t = +$('#shadow').value / 100;
  if (t > 0) {
    ctx.save();
    ctx.shadowColor = `rgba(0,0,0,${0.12 + 0.28 * t})`;
    ctx.shadowBlur = (8 + 56 * t) * k;
    ctx.shadowOffsetY = (2 + 18 * t) * k;
    ctx.fillStyle = '#fff';
    rr(ctx, x, y, L.ww, L.wh, r);
    ctx.fill();
    ctx.restore();
  }
  ctx.save();
  rr(ctx, x, y, L.ww, L.wh, r);
  ctx.clip();
  ctx.fillStyle = '#fff';
  ctx.fillRect(x, y, L.ww, L.wh);
  if (L.bar) drawBar(ctx, x, y, L.ww, L.bar);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(state.img, x, y + L.bar, L.sw, L.sh);
  ctx.restore();
  // Hairline edge so light screenshots do not melt into a light background.
  ctx.save();
  rr(ctx, x + 0.25, y + 0.25, L.ww - 0.5, L.wh - 0.5, r);
  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  ctx.lineWidth = 0.5;
  ctx.stroke();
  ctx.restore();
}

function drawBar(ctx, x, y, w, h) {
  ctx.fillStyle = state.chrome === 'mac' ? '#f5f5f5' : '#ffffff';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#ebebeb';
  ctx.fillRect(x, y + h - 1, w, 1);
  const cy = y + h / 2;
  ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => {
    ctx.beginPath();
    ctx.arc(x + 18 + i * 20, cy, 6, 0, Math.PI * 2);
    ctx.fillStyle = c;
    ctx.fill();
  });
  const title = $('#title').value.trim();
  if (state.chrome === 'browser') {
    const pw = Math.min(w - 160, Math.max(240, w * 0.5));
    if (pw > 60) {
      ctx.fillStyle = '#f5f5f5';
      rr(ctx, x + (w - pw) / 2, cy - 13, pw, 26, 7);
      ctx.fill();
      text(ctx, title, x + w / 2, cy, pw - 24);
    }
  } else {
    text(ctx, title, x + w / 2, cy, w - 160);
  }
}

function text(ctx, s, cx, cy, max) {
  if (!s || max < 20) return;
  ctx.font = `500 13px ${FONT}`;
  ctx.fillStyle = '#4d4d4d';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let out = s;
  while (out.length > 1 && ctx.measureText(out).width > max) out = out.slice(0, -1);
  ctx.fillText(out === s ? s : `${out.slice(0, -1)}…`, cx, cy + 0.5);
}

function render() {
  $('#titleField').hidden = state.chrome === 'none';
  if (!state.img) return;
  draw(preview, Math.min(2, devicePixelRatio || 1));
  const L = layout();
  preview.style.aspectRatio = `${L.W} / ${L.H}`;
  status(statusEl, `받을 크기 ${L.W * 2}×${L.H * 2}px`);
}

render();
