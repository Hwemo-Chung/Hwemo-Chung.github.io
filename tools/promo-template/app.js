import { $, fileInput, status, progress, download, loadImage, toBlob } from '../common/tool.js';

const BG_URL = 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm';
const BG_MODEL = 'isnet_quint8';
const W = 1080;
const PALETTE = ['#F5F3EF', '#FFFFFF', '#E3E8E1', '#DCE4EE', '#F2DDD5', '#22262B', '#2C3E57'];
const SANS = '"Pretendard Variable", Pretendard, sans-serif';

const cv = $('#card'), cx = cv.getContext('2d'), statusEl = $('#status'), prog = $('#prog');
const S = { photo: null, cut: null, H: 1350, tpl: 'clean', bg: { clean: '#F5F3EF', color: '#E3E8E1', photo: '#FFFFFF' }, dx: 0, dy: 0 };

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
        status(statusEl, '상품 배경을 지우는 중입니다.');
      }
    },
  });
}
function trim(img) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1, clear = 0;
  for (let y = 0; y < c.height; y++) for (let xx = 0; xx < c.width; xx++) {
    const a = d[(y * c.width + xx) * 4 + 3];
    if (a < 250) clear++;
    if (a > 16) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0 || clear < (c.width * c.height) / 50) return null;
  const t = Object.assign(document.createElement('canvas'), { width: x1 - x0 + 1, height: y1 - y0 + 1 });
  t.getContext('2d').drawImage(c, x0, y0, t.width, t.height, 0, 0, t.width, t.height);
  return t;
}

// ---------- inputs ----------
const digits = (el) => { const n = parseInt(el.value.replace(/[^\d]/g, ''), 10); return Number.isFinite(n) ? n : 0; };
const won = (n) => `${n.toLocaleString('ko-KR')}원`;
function discount() {
  const p = digits($('#price')), o = digits($('#orig'));
  return p && o > p ? Math.round(((o - p) / o) * 100) : 0;
}
for (const id of ['#name', '#price', '#orig', '#badge']) $(id).addEventListener('input', () => { $('#pct').value = discount() ? `${discount()}%` : '정가를 넣으면 표시됩니다'; render(); });

function seg(id, fn) {
  $(id).addEventListener('click', (e) => {
    const v = e.target.dataset.v;
    if (v == null) return;
    for (const b of $(id).children) b.setAttribute('aria-pressed', String(b.dataset.v === v));
    fn(v);
    markBg();
    render();
  });
}
seg('#size', (v) => { S.H = +v; cv.height = S.H; S.dx = S.dy = 0; });
seg('#tpl', (v) => { S.tpl = v; S.dx = S.dy = 0; });

const bgBox = $('#bgc');
for (const c of PALETTE) {
  const b = Object.assign(document.createElement('button'), { type: 'button', title: c });
  b.dataset.v = c; b.style.background = c;
  b.onclick = () => { S.bg[S.tpl] = c; markBg(); render(); };
  bgBox.append(b);
}
const customBg = Object.assign(document.createElement('input'), { type: 'color', title: '직접 고르기' });
customBg.oninput = () => { S.bg[S.tpl] = customBg.value.toUpperCase(); markBg(); render(); };
bgBox.append(customBg);
function markBg() {
  for (const b of bgBox.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.v === S.bg[S.tpl]));
  customBg.value = S.bg[S.tpl].toLowerCase();
}
markBg();

$('#pz').addEventListener('input', (e) => { $('#pzOut').value = `${e.target.value}%`; render(); });
$('#cut').addEventListener('change', async (e) => {
  if (!e.target.checked || S.cut || !S.photo) return render();
  e.target.disabled = true;
  try {
    const img = await loadImage(await cutout(S.file));
    S.cut = trim(img);
    URL.revokeObjectURL(img.src);
    if (!S.cut) throw new Error('상품을 찾지 못했습니다. 상품이 크게 보이는 사진으로 다시 올려 주세요.');
    status(statusEl, '상품을 끌어 위치를 맞추세요.');
  } catch (err) {
    console.error(err);
    e.target.checked = false;
    status(statusEl, err.message?.startsWith('상품') ? err.message
      : '배경을 지우지 못했습니다. 네트워크를 확인하고 다시 시도하세요. 최신 Chrome, Edge, Safari에서 동작합니다.', true);
  } finally {
    e.target.disabled = false;
    progress(prog, null);
    render();
  }
});

// ---------- drawing ----------
const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255); };
function colors(bg) {
  const light = lum(bg) > 140;
  return { ink: light ? '#141414' : '#FFFFFF', mute: light ? '#8C8C8C' : 'rgba(255,255,255,0.6)', sale: light ? '#E0352B' : '#FF7A6E', chip: light ? '#141414' : '#FFFFFF', chipText: light ? '#FFFFFF' : '#141414' };
}
function wrap(ctx, text, maxW, maxLines) {
  const words = text.split(/\s+/).filter(Boolean), lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width <= maxW || !cur) cur = t;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    let last = lines[maxLines - 1];
    while (last && ctx.measureText(`${last}…`).width > maxW) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last}…`;
  }
  return lines.map((l) => { while (ctx.measureText(l).width > maxW && l.length > 1) l = l.slice(0, -1); return l; });
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

// returns the height used; draws name + prices starting at top-left (x, y), or measures only when dry
function textBlock(ctx, x, y, maxW, align, col, dry) {
  const name = $('#name').value.trim(), price = digits($('#price')), orig = digits($('#orig')), pct = discount();
  let h = 0;
  ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  const ax = align === 'center' ? x + maxW / 2 : x;
  if (name) {
    ctx.font = `600 54px ${SANS}`;
    for (const l of wrap(ctx, name, maxW, 2)) { h += 66; if (!dry) { ctx.fillStyle = col.ink; ctx.fillText(l, ax, y + h - 14); } }
    h += 18;
  }
  if (pct) {
    ctx.font = `400 40px ${SANS}`;
    h += 48;
    if (!dry) {
      ctx.fillStyle = col.mute; ctx.fillText(won(orig), ax, y + h - 8);
      const tw = ctx.measureText(won(orig)).width, sx = align === 'center' ? ax - tw / 2 : ax;
      ctx.fillRect(sx, y + h - 22, tw, 3);
    }
  }
  if (price) {
    h += 100;
    if (!dry) {
      ctx.font = `800 92px ${SANS}`;
      const pw = ctx.measureText(won(price)).width;
      ctx.font = `800 64px ${SANS}`;
      const tag = pct ? `${pct}%` : '', tw = tag ? ctx.measureText(tag).width + 22 : 0;
      let sx = align === 'center' ? ax - (tw + pw) / 2 : ax;
      ctx.textAlign = 'left';
      if (tag) { ctx.fillStyle = col.sale; ctx.fillText(tag, sx, y + h - 14); sx += tw; }
      ctx.font = `800 92px ${SANS}`;
      ctx.fillStyle = col.ink; ctx.fillText(won(price), sx, y + h - 14);
      ctx.textAlign = align;
    }
  }
  return h;
}
function badge(ctx, x, y, col, size = 34) {
  const t = $('#badge').value.trim();
  if (!t) return 0;
  ctx.font = `700 ${size}px ${SANS}`;
  const w = ctx.measureText(t).width + size * 1.4, h = size * 1.9;
  ctx.fillStyle = col.chip; roundRect(ctx, x, y, w, h, h / 2); ctx.fill();
  ctx.fillStyle = col.chipText; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(t, x + w / 2, y + h / 2 + 1);
  ctx.textBaseline = 'alphabetic';
  return h;
}
// fits the product into a box; cut-outs get a soft floor shadow, photos get rounded corners
function product(ctx, bx, by, bw, bh) {
  const src = $('#cut').checked && S.cut ? S.cut : S.photo, isCut = src === S.cut;
  const sw = src.naturalWidth || src.width, sh = src.naturalHeight || src.height;
  const k = Math.min(bw / sw, bh / sh) * (+$('#pz').value / 100);
  const w = sw * k, h = sh * k, x = bx + (bw - w) / 2 + S.dx, y = by + (bh - h) / 2 + S.dy;
  if (isCut) {
    ctx.save();
    ctx.translate(x + w / 2, y + h);
    ctx.scale(1, 0.12);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, w * 0.5);
    g.addColorStop(0, 'rgba(0,0,0,0.28)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, w * 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.drawImage(src, x, y, w, h);
  } else {
    ctx.save(); roundRect(ctx, x, y, w, h, 28); ctx.clip(); ctx.drawImage(src, x, y, w, h); ctx.restore();
  }
}

function draw(ctx) {
  const H = S.H, bg = S.bg[S.tpl], col = colors(bg), pad = 72, story = H > 1500;
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  if (S.tpl === 'clean') {
    const textH = textBlock(ctx, pad, 0, W - pad * 2, 'left', col, true);
    const top = pad + (story ? 140 : 0), bTop = top + ($('#badge').value.trim() ? 100 : 0);
    const bottom = H - pad - textH - (story ? 180 : 48);
    product(ctx, pad, bTop, W - pad * 2, bottom - bTop);
    badge(ctx, pad, top, col);
    textBlock(ctx, pad, H - pad - textH - (story ? 140 : 0), W - pad * 2, 'left', col, false);
  } else if (S.tpl === 'color') {
    const textH = textBlock(ctx, pad, 0, W - pad * 2, 'center', col, true), t = $('#badge').value.trim();
    const badgeTop = story ? 220 : 64, top = badgeTop + (t ? 110 : 0), bottom = H - textH - (story ? 300 : 120);
    product(ctx, pad, top, W - pad * 2, bottom - top);
    textBlock(ctx, pad, H - textH - (story ? 240 : pad), W - pad * 2, 'center', col, false);
    if (t) {
      ctx.font = `700 34px ${SANS}`;
      badge(ctx, (W - ctx.measureText(t).width - 34 * 1.4) / 2, badgeTop, col);
    }
  } else {
    const panel = Math.max(textBlockHeight(ctx, col) + pad * 2, story ? 560 : 400), ph = H - panel;
    const src = S.photo, k = Math.max(W / src.naturalWidth, ph / src.naturalHeight) * Math.max(1, +$('#pz').value / 100);
    const w = src.naturalWidth * k, h = src.naturalHeight * k;
    S.dx = Math.max(W - w - (W - w) / 2, Math.min(-(W - w) / 2, S.dx));
    S.dy = Math.max(ph - h - (ph - h) / 2, Math.min(-(ph - h) / 2, S.dy));
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, ph); ctx.clip();
    ctx.drawImage(src, (W - w) / 2 + S.dx, (ph - h) / 2 + S.dy, w, h);
    ctx.restore();
    badge(ctx, pad, pad + (story ? 120 : 0), colors('#FFFFFF'));
    textBlock(ctx, pad, ph + pad - 6, W - pad * 2, 'left', col, false);
  }
}
const textBlockHeight = (ctx, col) => textBlock(ctx, 0, 0, W - 144, 'left', col, true);

let raf = 0, job = 0;
async function render() {
  if (!S.photo) return;
  const my = ++job, text = `${$('#name').value}${$('#badge').value}0123456789원%,…`;
  try { await Promise.all([400, 600, 700, 800].map((w) => document.fonts.load(`${w} 40px "Pretendard Variable"`, text))); } catch { /* system font */ }
  if (my !== job) return;
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => draw(cx));
}

let drag = null;
cv.addEventListener('pointerdown', (e) => {
  if (!S.photo) return;
  e.preventDefault();
  drag = { x: e.clientX, y: e.clientY, dx: S.dx, dy: S.dy };
  cv.setPointerCapture(e.pointerId);
});
cv.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const k = W / cv.getBoundingClientRect().width;
  S.dx = drag.dx + (e.clientX - drag.x) * k; S.dy = drag.dy + (e.clientY - drag.y) * k;
  render();
});
cv.addEventListener('pointerup', () => { drag = null; });
cv.addEventListener('pointercancel', () => { drag = null; });

// ---------- files / export ----------
fileInput($('#drop'), $('#file'), async (files, err) => {
  if (err) return status(statusEl, err.message, true);
  try {
    const img = await loadImage(files[0]);
    if (S.photo) URL.revokeObjectURL(S.photo.src);
    Object.assign(S, { photo: img, file: files[0], cut: null, dx: 0, dy: 0 });
    // an already transparent PNG is used as the cut-out directly
    const t = files[0].type === 'image/png' || files[0].type === 'image/webp' ? trim(img) : null;
    if (t) { S.cut = t; $('#cut').checked = true; }
    $('#drop').hidden = true;
    cv.hidden = false;
    $('#stage').classList.add('has');
    $('#save').disabled = false;
    $('#again').disabled = false;
    status(statusEl, '사진을 끌어 위치를 맞추세요.');
    if ($('#cut').checked && !S.cut) $('#cut').dispatchEvent(new Event('change'));
    else render();
  } catch (e) { status(statusEl, e.message, true); }
});
$('#again').addEventListener('click', () => $('#file').click());

$('#save').addEventListener('click', async () => {
  await render();
  const c = Object.assign(document.createElement('canvas'), { width: W, height: S.H });
  draw(c.getContext('2d'));
  const name = ($('#name').value.trim() || 'promo').replace(/[\\/:*?"<>|]+/g, '').slice(0, 40);
  download(await toBlob(c, 'image/png'), `${name}-${W}x${S.H}.png`);
});
