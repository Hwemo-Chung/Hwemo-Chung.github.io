import { $, fileInput, status, progress, download, baseName, loadImage, toBlob } from '../common/tool.js';

const TF_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js';
const MODEL = 'Xenova/segformer-b2-finetuned-ade-512-512'; // SegFormer-B2, ADE20K 150 classes, 8-bit ONNX (29 MB)
const MAX_SIDE = 2000; // working/export resolution
const NET_SIDE = 1024; // model input, long side

const KO = {
  wall: '벽', floor: '바닥', ceiling: '천장', door: '문', cabinet: '수납장', windowpane: '창', curtain: '커튼',
  bed: '침대', table: '테이블', sofa: '소파', chair: '의자', armchair: '안락의자', shelf: '선반', rug: '러그',
  wardrobe: '옷장', 'chest of drawers': '서랍장', counter: '카운터', countertop: '조리대', 'kitchen island': '아일랜드',
  column: '기둥', stairs: '계단', stairway: '계단', bookcase: '책장', blind: '블라인드', fireplace: '벽난로',
  desk: '책상', 'coffee table': '커피 테이블', painting: '그림', mirror: '거울', radiator: '라디에이터',
  railing: '난간', bannister: '난간', building: '건물', house: '집', fence: '울타리', 'screen door': '방충문',
  cushion: '쿠션', pillow: '베개', 'television receiver': 'TV', box: '상자', plant: '식물', lamp: '조명', light: '조명',
  chandelier: '샹들리에', sconce: '벽등', towel: '수건', sink: '세면대', bathtub: '욕조', toilet: '변기', shower: '샤워기',
  stove: '레인지', refrigerator: '냉장고', oven: '오븐', microwave: '전자레인지', dishwasher: '식기세척기', hood: '후드',
  washer: '세탁기', 'swivel chair': '회전의자', stool: '스툴', bench: '벤치', ottoman: '오토만', seat: '좌석', vase: '꽃병',
  book: '책', flower: '꽃', pot: '화분', basket: '바구니', bag: '가방', apparel: '옷', blanket: '담요', poster: '포스터',
  screen: '스크린', monitor: '모니터', computer: '컴퓨터', 'crt screen': '모니터', clock: '시계', fan: '선풍기',
  base: '받침', case: '진열장', buffet: '찬장', bar: '바', 'pool table': '당구대', sculpture: '조각', tray: '쟁반',
  ashcan: '휴지통', bottle: '병', glass: '유리잔', plate: '접시', person: '사람', animal: '동물', sky: '하늘', tree: '나무',
  grass: '잔디', step: '단', 'bulletin board': '게시판', signboard: '간판',
};
const FIRST = ['wall', 'floor', 'ceiling'];
const PALETTE = [
  ['#F2EEE6', '웜 화이트'], ['#E4E1DA', '라이트 그레이'], ['#CFC6B8', '그레이지'], ['#E9D8B4', '버터'],
  ['#D9B9A3', '살구 베이지'], ['#C0735A', '테라코타'], ['#B5BFA6', '세이지'], ['#7E8B6A', '올리브'],
  ['#A9BCC9', '더스티 블루'], ['#5E7A8C', '스틸 블루'], ['#2F3D52', '네이비'], ['#4A4A48', '차콜'],
];

const statusEl = $('#status');
const prog = $('#prog');
const out = $('#out'), orig = $('#orig'), hover = $('#hover');
const S = { file: null, w: 0, h: 0, rgb: null, Y: null, gray: null, net: null, present: [], active: -1, colors: new Map(), masks: new Map(), stats: new Map(), job: 0 };

// ---------- color math (linear light) ----------
const LIN = new Float32Array(256).map((_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
const gam = (v) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const luma = (r, g, b) => 0.2126 * LIN[r] + 0.7152 * LIN[g] + 0.0722 * LIN[b];
const hexLin = (hex) => { const n = parseInt(hex.slice(1), 16); return [LIN[n >> 16], LIN[(n >> 8) & 255], LIN[n & 255]]; };

// ---------- model ----------
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

async function segment(job) {
  const { T, model } = await loadModel();
  if (job !== S.job) return;
  status(statusEl, '벽과 바닥을 찾는 중입니다.');
  progress(prog, null);
  const k = NET_SIDE / Math.max(S.w, S.h);
  const W = Math.max(64, Math.round((S.w * k) / 32) * 32), H = Math.max(64, Math.round((S.h * k) / 32) * 32);
  const c = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const cx = c.getContext('2d');
  cx.imageSmoothingQuality = 'high';
  cx.drawImage(out, 0, 0, W, H);
  const px = cx.getImageData(0, 0, W, H).data, n = W * H;
  const data = new Float32Array(3 * n), mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225];
  for (let i = 0; i < n; i++) for (let ch = 0; ch < 3; ch++) data[ch * n + i] = (px[i * 4 + ch] / 255 - mean[ch]) / std[ch];
  await new Promise(requestAnimationFrame);
  const { logits } = await model({ pixel_values: new T.Tensor('float32', data, [1, 3, H, W]) });
  if (job !== S.job) return;
  const [, C, lh, lw] = logits.dims, Lg = logits.data, m = lw * lh;
  const prob = new Float32Array(C * m), label = new Uint8Array(m);
  for (let i = 0; i < m; i++) {
    let mx = -Infinity, arg = 0;
    for (let c2 = 0; c2 < C; c2++) { const v = Lg[c2 * m + i]; if (v > mx) { mx = v; arg = c2; } }
    let sum = 0;
    for (let c2 = 0; c2 < C; c2++) { const e = Math.exp(Lg[c2 * m + i] - mx); prob[c2 * m + i] = e; sum += e; }
    for (let c2 = 0; c2 < C; c2++) prob[c2 * m + i] /= sum;
    label[i] = arg;
  }
  const names = Object.values(model.config.id2label).map((s) => s.trim());
  const count = new Uint32Array(C);
  for (let i = 0; i < m; i++) count[label[i]]++;
  S.net = { lw, lh, prob, label, names };
  S.present = [...count].map((n2, id) => ({ id, frac: n2 / m })).filter((x) => x.frac >= 0.01)
    .sort((a, b) => rank(names[a.id]) - rank(names[b.id]) || b.frac - a.frac);
  const wall = S.present.find((x) => names[x.id] === 'wall');
  S.active = (wall || S.present[0] || { id: -1 }).id;
  renderClasses();
  status(statusEl, S.present.length ? '칠할 곳을 고르고 색을 누르세요.' : '칠할 곳을 찾지 못했습니다. 방 안이 넓게 보이는 사진으로 다시 해 보세요.', !S.present.length);
  $('#cmp').disabled = false;
}
const rank = (name) => { const i = FIRST.indexOf(name); return i < 0 ? 9 : i; };
const nameOf = (id) => { const n = S.net.names[id]; return KO[n] || n; };

// ---------- mask: upsample class probability, snap edges to the photo with a guided filter ----------
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
  const add = (y, sgn) => { const o = y * w; for (let x = 0; x < w; x++) acc[x] += sgn * tmp[o + x]; n += sgn; };
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
  box(I, w, h, r, tmp, mI);
  box(p, w, h, r, tmp, mP);
  for (let i = 0; i < N; i++) t[i] = I[i] * p[i];
  box(t, w, h, r, tmp, mIP);
  for (let i = 0; i < N; i++) t[i] = I[i] * I[i];
  box(t, w, h, r, tmp, mII);
  for (let i = 0; i < N; i++) {
    const a = (mIP[i] - mI[i] * mP[i]) / (mII[i] - mI[i] * mI[i] + eps);
    mIP[i] = a; mP[i] = mP[i] - a * mI[i];
  }
  box(mIP, w, h, r, tmp, mII);
  box(mP, w, h, r, tmp, mI);
  for (let i = 0; i < N; i++) t[i] = mII[i] * I[i] + mI[i];
  return t;
}
function classMask(id) {
  if (S.masks.has(id)) return S.masks.get(id);
  const { lw, lh, prob } = S.net, w = S.w, h = S.h, off = id * lw * lh;
  const p = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = Math.min(lh - 1, Math.max(0, ((y + 0.5) * lh) / h - 0.5)), y0 = Math.floor(fy), y1 = Math.min(lh - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(lw - 1, Math.max(0, ((x + 0.5) * lw) / w - 0.5)), x0 = Math.floor(fx), x1 = Math.min(lw - 1, x0 + 1), tx = fx - x0;
      const a = prob[off + y0 * lw + x0] * (1 - tx) + prob[off + y0 * lw + x1] * tx;
      const b = prob[off + y1 * lw + x0] * (1 - tx) + prob[off + y1 * lw + x1] * tx;
      p[y * w + x] = a * (1 - ty) + b * ty;
    }
  }
  const r = Math.max(4, Math.round(Math.max(w, h) / 110));
  const q = guided(S.gray, p, w, h, r, 2e-4);
  const hist = new Uint32Array(1024); let total = 0;
  for (let i = 0; i < q.length; i++) {
    const v = Math.min(1, Math.max(0, (q[i] - 0.42) / 0.3));
    q[i] = v;
    if (v > 0.9) { hist[Math.min(1023, (S.Y[i] * 1023) | 0)]++; total++; }
  }
  // the brightly lit part of the region (85th percentile) shows the paint at its swatch color; everything darker keeps its shadow
  let acc = 0, ref = 1023;
  for (let b = 0; b < 1024; b++) { acc += hist[b]; if (acc >= total * 0.85) { ref = b; break; } }
  S.masks.set(id, q);
  S.stats.set(id, Math.max(0.02, (ref + 0.5) / 1023));
  return q;
}

// ---------- recolor: paint color x the photo's light (luminance relative to the lit part of the region) ----------
let pending = 0;
function paint() {
  cancelAnimationFrame(pending);
  pending = requestAnimationFrame(() => {
    const cx = out.getContext('2d'), img = cx.createImageData(S.w, S.h), d = img.data;
    d.set(S.rgb);
    const jobs = [...S.colors].map(([id, hex]) => ({ m: classMask(id), ref: S.stats.get(id), t: hexLin(hex) }));
    const Y = S.Y;
    for (let i = 0, n = S.w * S.h; i < n; i++) {
      for (const j of jobs) {
        const a = j.m[i];
        if (a < 0.004) continue;
        const r = Math.min(1.3, Y[i] / j.ref), k = i * 4;
        d[k] += (gam(Math.min(1, j.t[0] * r)) - d[k]) * a;
        d[k + 1] += (gam(Math.min(1, j.t[1] * r)) - d[k + 1]) * a;
        d[k + 2] += (gam(Math.min(1, j.t[2] * r)) - d[k + 2]) * a;
      }
    }
    cx.putImageData(img, 0, 0);
    $('#save').disabled = !S.colors.size;
    renderClasses();
  });
}

// ---------- UI ----------
function renderClasses() {
  const box2 = $('#classes');
  if (!S.net) { box2.replaceChildren(); return; }
  box2.replaceChildren(...S.present.map(({ id, frac }) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-pressed', String(id === S.active));
    const sw = document.createElement('i');
    sw.style.background = S.colors.get(id) || 'transparent';
    b.append(sw, nameOf(id), Object.assign(document.createElement('small'), { textContent: `${Math.round(frac * 100)}%` }));
    b.onclick = () => select(id, true);
    return b;
  }));
  $('#classHint').textContent = '사진을 눌러서 골라도 됩니다.';
  const hex = S.colors.get(S.active);
  $('#reset').disabled = !hex;
  for (const b of $('#swatches').children) b.setAttribute('aria-pressed', String(b.dataset.v === hex));
}

function select(id, flash) {
  S.active = id;
  renderClasses();
  if (flash) { drawHover(id); clearTimeout(select.t); select.t = setTimeout(() => drawHover(-1), 700); }
}

function setColor(hex) {
  if (!S.net) return;
  if (S.active < 0) return status(statusEl, '먼저 칠할 곳을 고르세요.', true);
  S.colors.set(S.active, hex.toUpperCase());
  $('#custom').value = hex.toLowerCase();
  $('#hex').textContent = hex.toUpperCase();
  status(statusEl, `${nameOf(S.active)} · ${hex.toUpperCase()}`);
  paint();
}

$('#swatches').append(...PALETTE.map(([hex, name]) => {
  const b = Object.assign(document.createElement('button'), { type: 'button', title: name });
  b.dataset.v = hex;
  b.setAttribute('aria-label', name);
  b.style.background = hex;
  b.onclick = () => setColor(hex);
  return b;
}));
$('#custom').addEventListener('input', (e) => setColor(e.target.value));
$('#reset').addEventListener('click', () => { S.colors.delete(S.active); paint(); });

let hovered = -1;
function drawHover(id) {
  hovered = id;
  const cx = hover.getContext('2d');
  if (!S.net) return;
  const { lw, lh, label } = S.net;
  if (hover.width !== lw || hover.height !== lh) { hover.width = lw; hover.height = lh; }
  const img = cx.createImageData(lw, lh);
  if (id >= 0) for (let i = 0; i < label.length; i++) if (label[i] === id) { img.data[i * 4 + 1] = 112; img.data[i * 4 + 2] = 243; img.data[i * 4 + 3] = 90; }
  cx.putImageData(img, 0, 0);
}
function labelAt(e) {
  if (!S.net) return -1;
  const r = out.getBoundingClientRect();
  const x = Math.floor(((e.clientX - r.left) / r.width) * S.net.lw), y = Math.floor(((e.clientY - r.top) / r.height) * S.net.lh);
  if (x < 0 || y < 0 || x >= S.net.lw || y >= S.net.lh) return -1;
  return S.net.label[y * S.net.lw + x];
}
$('#view').addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  const id = labelAt(e);
  if (id !== hovered) drawHover(id);
});
$('#view').addEventListener('pointerleave', () => drawHover(-1));
$('#view').addEventListener('click', (e) => {
  const id = labelAt(e);
  if (id < 0) return;
  if (!S.present.some((x) => x.id === id)) S.present.push({ id, frac: 0 });
  select(id, e.pointerType !== 'mouse');
  status(statusEl, `선택: ${nameOf(id)}. 색을 누르세요.`);
});

$('#cmp').addEventListener('input', (e) => {
  const v = +e.target.value;
  $('#cmpOut').value = `${v}%`;
  orig.style.clipPath = `inset(0 ${100 - v}% 0 0)`;
  $('#split').hidden = v === 0 || v === 100;
  $('#split').style.left = `${v}%`;
});

$('#save').addEventListener('click', async () => {
  download(await toBlob(out, 'image/jpeg', 0.92), `${baseName(S.file)}-color.jpg`);
});
$('#again').addEventListener('click', () => $('#file').click());

fileInput($('#drop'), $('#file'), (files, err) => {
  if (err) return status(statusEl, err.message, true);
  open(files[0]);
});
$('#sample').addEventListener('click', async (e) => {
  e.stopPropagation();
  const res = await fetch('sample.jpg');
  open(new File([await res.blob()], 'living-room.jpg', { type: 'image/jpeg' }));
});

async function open(file) {
  const job = ++S.job;
  let img;
  try { img = await loadImage(file); } catch (e) { return status(statusEl, e.message, true); }
  const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
  Object.assign(S, { file, w, h, net: null, present: [], active: -1 });
  S.colors.clear(); S.masks.clear(); S.stats.clear();
  for (const c of [out, orig]) { c.width = w; c.height = h; }
  const cx = out.getContext('2d');
  cx.imageSmoothingQuality = 'high';
  cx.drawImage(img, 0, 0, w, h);
  URL.revokeObjectURL(img.src);
  orig.getContext('2d').drawImage(out, 0, 0);
  const px = cx.getImageData(0, 0, w, h).data;
  S.rgb = px;
  S.Y = new Float32Array(w * h);
  S.gray = new Float32Array(w * h);
  for (let i = 0, n = w * h; i < n; i++) { S.Y[i] = luma(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]); S.gray[i] = Math.cbrt(S.Y[i]); }
  $('#drop').hidden = true;
  $('#view').hidden = false;
  $('#stage').classList.add('has');
  $('#again').disabled = false;
  $('#save').disabled = true;
  $('#cmp').value = 0; $('#cmp').dispatchEvent(new Event('input'));
  $('#cmp').disabled = true;
  renderClasses();
  drawHover(-1);
  try {
    await segment(job);
  } catch (e) {
    console.error(e);
    progress(prog, null);
    if (job === S.job) status(statusEl, '분석 모델을 불러오지 못했습니다. 네트워크를 확인하고 사진을 다시 올려 주세요. 최신 Chrome, Edge, Safari에서 동작합니다.', true);
  }
}
