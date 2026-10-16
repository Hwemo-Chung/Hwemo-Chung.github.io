import { $, fileInput, status, download, baseName, loadImage, toBlob } from '../common/tool.js';

const state = { file: null, img: null, device: 'phone', orient: 'portrait', fit: 'fill' };
const statusEl = $('#status');
const preview = $('#preview');

// Parts are rounded rects in CSS px, portrait orientation. Screen sizes follow real devices:
// phone 390×844 (6.1" class), tablet 820×1180 (10.9" class), laptop 1440×900 (16:10).
const DEVICES = {
  phone() {
    const b = 12, sw = 390, sh = 844, side = 3;
    const W = sw + 2 * b + 2 * side, H = sh + 2 * b;
    const body = { x: side, y: 0, w: sw + 2 * b, h: H };
    return {
      W, H,
      under: [
        { x: 0, y: 150, w: side + 2, h: 32, r: 1.5, fill: '#4d4d4d' },
        { x: 0, y: 210, w: side + 2, h: 62, r: 1.5, fill: '#4d4d4d' },
        { x: 0, y: 286, w: side + 2, h: 62, r: 1.5, fill: '#4d4d4d' },
        { x: W - side - 2, y: 240, w: side + 2, h: 100, r: 1.5, fill: '#4d4d4d' },
        { ...body, r: 62, fill: '#4d4d4d' },
        { x: body.x + 2, y: 2, w: body.w - 4, h: H - 4, r: 60, fill: '#171717' },
      ],
      screen: { x: side + b, y: b, w: sw, h: sh, r: 50 },
      over: [{ x: side + b + (sw - 124) / 2, y: b + 11, w: 124, h: 36, r: 18, fill: '#000' }],
    };
  },
  tablet() {
    const b = 24, sw = 820, sh = 1180;
    const W = sw + 2 * b, H = sh + 2 * b;
    return {
      W, H,
      under: [
        { x: 0, y: 0, w: W, h: H, r: 42, fill: '#4d4d4d' },
        { x: 2, y: 2, w: W - 4, h: H - 4, r: 40, fill: '#171717' },
        { x: W / 2 - 4, y: b / 2 - 4, w: 8, h: 8, r: 4, fill: '#4d4d4d' },
      ],
      screen: { x: b, y: b, w: sw, h: sh, r: 18 },
      over: [],
    };
  },
  laptop() {
    const sw = 1440, sh = 900, side = 18, top = 24, bottom = 22;
    const lw = sw + 2 * side, lh = sh + top + bottom;
    const bw = Math.round(lw * 1.14), bh = 22;
    const lx = (bw - lw) / 2;
    return {
      W: bw, H: lh + bh,
      under: [
        { x: lx, y: 0, w: lw, h: lh, r: [22, 22, 4, 4], fill: '#4d4d4d' },
        { x: lx + 2, y: 2, w: lw - 4, h: lh - 2, r: [20, 20, 2, 2], fill: '#171717' },
        { x: lx + lw / 2 - 3, y: top / 2 - 3, w: 6, h: 6, r: 3, fill: '#4d4d4d' },
        { x: 0, y: lh, w: bw, h: bh, r: [2, 2, 14, 14], fill: '#d4d4d4' },
        { x: 0, y: lh, w: bw, h: 4, r: 0, fill: '#ebebeb' },
        { x: bw / 2 - 110, y: lh, w: 220, h: 9, r: [0, 0, 8, 8], fill: '#a1a1a1' },
      ],
      screen: { x: lx + side, y: top, w: sw, h: sh, r: 0 },
      over: [],
    };
  },
  browser(img) {
    const scale = img.naturalWidth >= 2000 ? 2 : 1;
    const sw = Math.min(img.naturalWidth / scale, 1600);
    const sh = (img.naturalHeight / img.naturalWidth) * sw;
    const bar = 44, W = sw + 2, H = sh + bar + 2;
    const pw = Math.min(sw - 180, Math.max(240, sw * 0.5));
    return {
      W, H,
      under: [
        { x: 0, y: 0, w: W, h: H, r: 11, fill: '#ebebeb' },
        { x: 1, y: 1, w: sw, h: bar + sh, r: 10, fill: '#ffffff' },
        { x: 1, y: bar, w: sw, h: 1, r: 0, fill: '#ebebeb' },
        ...['#ff5f57', '#febc2e', '#28c840'].map((fill, i) => ({ x: 13 + i * 20, y: bar / 2 - 5, w: 12, h: 12, r: 6, fill })),
        ...(pw > 60 ? [{ x: 1 + (sw - pw) / 2, y: bar / 2 - 13, w: pw, h: 26, r: 7, fill: '#f5f5f5' }] : []),
      ],
      screen: { x: 1, y: bar + 1, w: sw, h: sh, r: [0, 0, 10, 10] },
      over: [],
    };
  },
};

fileInput($('#drop'), $('#file'), async (files, err) => {
  if (err) return status(statusEl, err.message, true);
  try {
    const img = await loadImage(files[0]);
    if (state.img) URL.revokeObjectURL(state.img.src);
    Object.assign(state, { file: files[0], img });
    setSeg('#orient', 'orient', img.naturalWidth > img.naturalHeight ? 'landscape' : 'portrait');
    $('#drop').hidden = true;
    $('#view').hidden = false;
    $('#save').disabled = $('#other').disabled = false;
    render();
  } catch (e) {
    status(statusEl, e.message, true);
  }
});

function setSeg(id, key, v) {
  state[key] = v;
  for (const b of $(id).children) b.setAttribute('aria-pressed', String(b.dataset.v === v));
}
for (const [id, key] of [['#device', 'device'], ['#orient', 'orient'], ['#fit', 'fit']]) {
  $(id).addEventListener('click', (e) => {
    if (!e.target.dataset.v) return;
    setSeg(id, key, e.target.dataset.v);
    render();
  });
}
$('#other').addEventListener('click', () => $('#file').click());
$('#save').addEventListener('click', async () => {
  const c = document.createElement('canvas');
  draw(c, 2);
  download(await toBlob(c, 'image/png'), `${baseName(state.file)}-${state.device}.png`);
  status(statusEl, `${c.width}×${c.height} 투명 PNG`);
});

// Phone and tablet turn sideways by mapping every portrait rect a quarter turn (device top to the left).
function geometry() {
  const g = DEVICES[state.device](state.img);
  if (state.orient === 'portrait' || state.device === 'laptop' || state.device === 'browser') return g;
  const turn = (p) => ({ ...p, x: p.y, y: g.W - p.x - p.w, w: p.h, h: p.w });
  return { W: g.H, H: g.W, under: g.under.map(turn), screen: turn(g.screen), over: g.over.map(turn) };
}

function rect(ctx, p) {
  ctx.beginPath();
  ctx.roundRect(p.x, p.y, p.w, p.h, p.r);
}

function draw(canvas, k) {
  const g = geometry();
  canvas.width = Math.round(g.W * k); canvas.height = Math.round(g.H * k);
  const ctx = canvas.getContext('2d');
  ctx.scale(k, k);
  for (const p of g.under) { rect(ctx, p); ctx.fillStyle = p.fill; ctx.fill(); }
  const s = g.screen;
  ctx.save();
  rect(ctx, s);
  ctx.clip();
  ctx.fillStyle = state.device === 'browser' ? '#fff' : '#000';
  ctx.fillRect(s.x, s.y, s.w, s.h);
  const iw = state.img.naturalWidth, ih = state.img.naturalHeight;
  const scale = (state.fit === 'fill' ? Math.max : Math.min)(s.w / iw, s.h / ih);
  const dw = iw * scale, dh = ih * scale;
  // Fill keeps the top of tall (scrolling) screenshots; fit centres.
  const dy = state.fit === 'fill' && dh > s.h ? s.y : s.y + (s.h - dh) / 2;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(state.img, s.x + (s.w - dw) / 2, dy, dw, dh);
  ctx.restore();
  for (const p of g.over) { rect(ctx, p); ctx.fillStyle = p.fill; ctx.fill(); }
  return g;
}

function render() {
  $('#orientField').hidden = state.device === 'laptop' || state.device === 'browser';
  $('#fit').closest('.field').hidden = state.device === 'browser';
  if (!state.img) return;
  const g = draw(preview, Math.min(2, devicePixelRatio || 1));
  const s = g.screen;
  const iw = state.img.naturalWidth, ih = state.img.naturalHeight;
  const same = Math.abs(iw / ih - s.w / s.h) < 0.02;
  $('#aspect').textContent = state.device === 'browser' ? '' : `화면 ${s.w}:${s.h} · 스크린샷 ${iw}×${ih}${same ? ' · 비율이 같습니다' : ''}`;
  status(statusEl, `받을 크기 ${Math.round(g.W * 2)}×${Math.round(g.H * 2)}px`);
}

render();
