import { $, fileInput, status, progress, download, baseName, loadImage, toBlob } from '../common/tool.js';

const BG_URL = 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm';
const BG_MODEL = 'isnet_quint8';
const MAX_SIDE = 2560;
const BUILTINS = [['item-wirechair.webp', '철제 의자'], ['item-basket.webp', '바구니'], ['item-stump.webp', '원목 스툴']];

const statusEl = $('#status'), prog = $('#prog'), cv = $('#room'), cx = cv.getContext('2d');
const S = { file: null, bg: null, items: [], sel: null, format: 'image/jpeg', busy: 0 };

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
        status(statusEl, '배경을 지우는 중입니다.');
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

// trims transparent margins; returns { img: canvas, alpha, sh: shadow canvas }
function makeItem(img, name) {
  const c = document.createElement('canvas');
  const k = Math.min(1, 1400 / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
  c.width = Math.round((img.naturalWidth || img.width) * k); c.height = Math.round((img.naturalHeight || img.height) * k);
  const x = c.getContext('2d'); x.drawImage(img, 0, 0, c.width, c.height);
  const d = x.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let xx = 0; xx < c.width; xx++) {
    if (d[(y * c.width + xx) * 4 + 3] > 16) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return null;
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const t = Object.assign(document.createElement('canvas'), { width: w, height: h });
  t.getContext('2d').drawImage(c, x0, y0, w, h, 0, 0, w, h);
  const td = t.getContext('2d').getImageData(0, 0, w, h).data, alpha = new Uint8Array(w * h);
  for (let i = 0; i < alpha.length; i++) alpha[i] = td[i * 4 + 3];
  return { name, img: t, alpha, sh: makeShadow(t) };
}

// contact shadow: the silhouette squashed into a band at the base (wide and soft), plus the bottom of the
// silhouette (legs, feet) as a tight dark band where it touches the floor
function makeShadow(img) {
  const W = 512, c = Object.assign(document.createElement('canvas'), { width: W * 1.4, height: W * 0.3 });
  const x = c.getContext('2d'), off = c.width * 2;
  x.shadowColor = 'rgba(0,0,0,0.75)'; x.shadowBlur = W * 0.04; x.shadowOffsetX = off;
  x.drawImage(img, W * 0.2 - off, c.height / 2 - W * 0.035, W, W * 0.07);
  x.shadowColor = '#000'; x.shadowBlur = W * 0.01;
  x.drawImage(img, 0, img.height * 0.9, img.width, img.height * 0.1, W * 0.2 - off, c.height / 2 - W * 0.01, W, W * 0.018);
  return c;
}

// ---------- scene ----------
function geom(it) {
  const h = it.h, w = (h * it.img.width) / it.img.height;
  return { w, h, cx: it.x, cy: it.y - h / 2 };
}
function draw(ctx, forExport) {
  ctx.drawImage(S.bg, 0, 0, cv.width, cv.height);
  for (const it of S.items) {
    const { w, h, cx: X, cy: Y } = geom(it);
    if (it.shadow > 0) {
      ctx.save();
      ctx.globalAlpha = it.shadow / 100;
      ctx.translate(it.x, it.y - w * 0.01);
      if (it.flip) ctx.scale(-1, 1);
      ctx.drawImage(it.sh, -w * 0.7, -w * 0.15, w * 1.4, w * 0.3);
      ctx.restore();
    }
    ctx.save();
    ctx.translate(X, Y);
    ctx.rotate((it.rot * Math.PI) / 180);
    ctx.scale(it.flip ? -1 : 1, 1);
    ctx.drawImage(it.img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
  if (!forExport && S.sel) {
    const { w, h, cx: X, cy: Y } = geom(S.sel), u = cv.width / cv.getBoundingClientRect().width;
    ctx.save();
    ctx.translate(X, Y);
    ctx.rotate((S.sel.rot * Math.PI) / 180);
    ctx.lineWidth = 1.5 * u;
    ctx.strokeStyle = '#fff'; ctx.setLineDash([6 * u, 4 * u]);
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.strokeStyle = '#171717'; ctx.lineDashOffset = 6 * u;
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.setLineDash([]);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#171717';
    ctx.fillRect(w / 2 - 7 * u, h / 2 - 7 * u, 14 * u, 14 * u);
    ctx.strokeRect(w / 2 - 7 * u, h / 2 - 7 * u, 14 * u, 14 * u);
    ctx.restore();
  }
}
let raf = 0;
const render = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => draw(cx, false)); };

function toLocal(it, px, py) {
  const { w, h, cx: X, cy: Y } = geom(it), a = (-it.rot * Math.PI) / 180;
  const dx = px - X, dy = py - Y;
  return { u: (dx * Math.cos(a) - dy * Math.sin(a)) / w, v: (dx * Math.sin(a) + dy * Math.cos(a)) / h, w, h };
}
function hit(it, px, py) {
  const { u, v } = toLocal(it, px, py);
  if (Math.abs(u) > 0.5 || Math.abs(v) > 0.5) return false;
  const uu = it.flip ? -u : u, W = it.img.width, H = it.img.height;
  const ix = Math.min(W - 1, Math.floor((uu + 0.5) * W)), iy = Math.min(H - 1, Math.floor((v + 0.5) * H));
  return it.alpha[iy * W + ix] > 24;
}
function onHandle(it, px, py) {
  const { u, v, w, h } = toLocal(it, px, py), r = (16 * cv.width) / cv.getBoundingClientRect().width;
  return Math.abs((u - 0.5) * w) < r && Math.abs((v - 0.5) * h) < r;
}

function pt(e) {
  const r = cv.getBoundingClientRect();
  return [((e.clientX - r.left) * cv.width) / r.width, ((e.clientY - r.top) * cv.height) / r.height];
}
let drag = null;
cv.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  const [px, py] = pt(e);
  if (S.sel && onHandle(S.sel, px, py)) {
    drag = { mode: 'size', it: S.sel, h0: S.sel.h, d0: Math.hypot(px - S.sel.x, py - S.sel.y) };
  } else {
    const it = [...S.items].reverse().find((i) => hit(i, px, py));
    select(it || null);
    if (it) drag = { mode: 'move', it, dx: px - it.x, dy: py - it.y };
  }
  if (drag) cv.setPointerCapture(e.pointerId);
});
cv.addEventListener('pointermove', (e) => {
  const [px, py] = pt(e);
  if (!drag) {
    cv.style.cursor = S.sel && onHandle(S.sel, px, py) ? 'nwse-resize' : S.items.some((i) => hit(i, px, py)) ? 'move' : 'default';
    return;
  }
  const it = drag.it;
  if (drag.mode === 'move') { it.x = px - drag.dx; it.y = py - drag.dy; }
  else it.h = Math.max(20, (drag.h0 * Math.hypot(px - it.x, py - it.y)) / Math.max(1, drag.d0));
  syncPanel();
  render();
});
const endDrag = () => { drag = null; };
cv.addEventListener('pointerup', endDrag);
cv.addEventListener('pointercancel', endDrag);
addEventListener('keydown', (e) => {
  if (!S.sel || e.target.matches('input, textarea')) return;
  const step = e.shiftKey ? 20 : 4;
  const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
  if (mv) { e.preventDefault(); S.sel.x += mv[0]; S.sel.y += mv[1]; render(); }
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(); }
});

function select(it) {
  S.sel = it;
  $('#sel').disabled = !it;
  syncPanel();
  render();
}
function syncPanel() {
  const it = S.sel;
  if (!it) return;
  const pct = Math.round((it.h / it.h0) * 100);
  $('#size').value = Math.min(300, pct); $('#sizeOut').value = `${pct}%`;
  $('#rot').value = it.rot; $('#rotOut').value = `${it.rot}°`;
  $('#shadow').value = it.shadow; $('#shOut').value = it.shadow;
}
$('#size').addEventListener('input', (e) => { if (S.sel) { S.sel.h = (S.sel.h0 * e.target.value) / 100; syncPanel(); render(); } });
$('#rot').addEventListener('input', (e) => { if (S.sel) { S.sel.rot = +e.target.value; syncPanel(); render(); } });
$('#shadow').addEventListener('input', (e) => { if (S.sel) { S.sel.shadow = +e.target.value; syncPanel(); render(); } });
$('#flip').addEventListener('click', () => { if (S.sel) { S.sel.flip = !S.sel.flip; render(); } });
$('#front').addEventListener('click', () => reorder(1));
$('#back').addEventListener('click', () => reorder(-1));
$('#del').addEventListener('click', () => remove());
function reorder(dir) {
  const i = S.items.indexOf(S.sel), j = i + dir;
  if (i < 0 || j < 0 || j >= S.items.length) return;
  [S.items[i], S.items[j]] = [S.items[j], S.items[i]];
  render();
}
function remove() {
  S.items = S.items.filter((i) => i !== S.sel);
  select(null);
  updateButtons();
}

function place(item) {
  const h0 = cv.height * 0.3 * Math.min(1, (cv.width * 0.4) / ((cv.height * 0.3 * item.img.width) / item.img.height));
  const n = S.items.length % 5;
  const it = { ...item, shadow: 50, x: cv.width * (0.5 + (n - 2) * 0.08), y: cv.height * 0.88, h: h0, h0, rot: 0, flip: false };
  S.items.push(it);
  select(it);
  updateButtons();
}
function updateButtons() {
  $('#save').disabled = !S.bg;
}

// ---------- built-in items ----------
const cache = {};
$('#builtins').append(...BUILTINS.map(([src, name]) => {
  const b = Object.assign(document.createElement('button'), { type: 'button', title: name, disabled: true });
  b.append(Object.assign(document.createElement('img'), { src, alt: name, loading: 'lazy' }));
  b.onclick = async () => {
    try {
      cache[src] ??= makeItem(await loadImage(src), name);
      place(cache[src]);
    } catch (e) { status(statusEl, e.message, true); }
  };
  return b;
}));

// ---------- files ----------
$('#addBtn').addEventListener('click', () => $('#itemFile').click());
$('#itemFile').addEventListener('change', async (e) => {
  const files = [...e.target.files];
  e.target.value = '';
  for (const f of files) await addFurniture(f);
});
async function addFurniture(file) {
  if (!S.bg) return status(statusEl, '먼저 방 사진을 올리세요.', true);
  S.busy++;
  $('#addBtn').disabled = true;
  try {
    let img = await loadImage(file);
    if (!hasTransparency(img)) {
      status(statusEl, `${file.name}: 배경을 지우는 중입니다.`);
      const png = await cutout(file);
      URL.revokeObjectURL(img.src);
      img = await loadImage(png);
    }
    const it = makeItem(img, file.name);
    URL.revokeObjectURL(img.src);
    if (!it) throw new Error('가구를 찾지 못했습니다. 가구가 크게 보이는 사진으로 다시 올려 주세요.');
    place(it);
    status(statusEl, '끌어서 자리를 잡으세요.');
  } catch (e) {
    console.error(e);
    status(statusEl, e.message?.startsWith('가구') || e.message?.startsWith('이미지') ? e.message
      : '배경을 지우지 못했습니다. 네트워크를 확인하고 다시 올려 주세요. 최신 Chrome, Edge, Safari에서 동작합니다.', true);
  } finally {
    progress(prog, null);
    if (--S.busy === 0) $('#addBtn').disabled = false;
  }
}

let roomPick = false;
fileInput($('#drop'), $('#file'), async (files, err) => {
  if (err) return status(statusEl, err.message, true);
  // once a room is open, files dropped on the page are furniture
  if (!S.bg || roomPick) { roomPick = false; return openRoom(files[0]); }
  for (const f of files) await addFurniture(f);
});
$('#sample').addEventListener('click', async (e) => {
  e.stopPropagation();
  const res = await fetch('sample.jpg');
  openRoom(new File([await res.blob()], 'room.jpg', { type: 'image/jpeg' }));
});
$('#again').addEventListener('click', () => { roomPick = true; $('#file').click(); });
$('#file').addEventListener('cancel', () => { roomPick = false; });

async function openRoom(file) {
  let img;
  try { img = await loadImage(file); } catch (e) { return status(statusEl, e.message, true); }
  const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
  const old = S.bg && { w: cv.width, h: cv.height };
  cv.width = w; cv.height = h;
  const bg = Object.assign(document.createElement('canvas'), { width: w, height: h });
  bg.getContext('2d').drawImage(img, 0, 0, w, h);
  URL.revokeObjectURL(img.src);
  S.bg = bg;
  S.file = file;
  if (old) for (const it of S.items) { it.x *= w / old.w; it.y *= h / old.h; it.h *= h / old.h; it.h0 *= h / old.h; }
  $('#drop').hidden = true;
  cv.hidden = false;
  $('#stage').classList.add('has');
  $('#addBtn').disabled = false;
  $('#again').disabled = false;
  for (const b of $('#builtins').children) b.disabled = false;
  updateButtons();
  status(statusEl, '가구를 고르거나 가구 사진을 올리세요.');
  render();
}

$('#format').addEventListener('click', (e) => {
  if (!e.target.dataset.v) return;
  S.format = e.target.dataset.v;
  for (const b of $('#format').children) b.setAttribute('aria-pressed', String(b.dataset.v === S.format));
});
$('#save').addEventListener('click', async () => {
  const c = Object.assign(document.createElement('canvas'), { width: cv.width, height: cv.height });
  draw(c.getContext('2d'), true);
  const blob = await toBlob(c, S.format, 0.92);
  download(blob, `${baseName(S.file)}-staged.${S.format === 'image/png' ? 'png' : 'jpg'}`);
});
