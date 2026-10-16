import { $, fileInput, status, progress, download } from '../common/tool.js';
import { extract, money } from './fields.js';

const TESS = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.esm.min.js';
const SHEETJS = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs';
const statusEl = $('#status');
const prog = $('#prog');
const tbody = $('#list tbody');
const state = { items: [], selected: null };
let workerP = null;
let queue = Promise.resolve();

fileInput($('#drop'), $('#file'), (files, err) => {
  if (err) return status(statusEl, '사진 파일만 넣을 수 있습니다. JPG, PNG, WebP를 고르세요.', true);
  add(files);
});

$('#sample').addEventListener('click', async (e) => {
  e.stopPropagation();
  const res = await fetch('sample.jpg');
  add([new File([await res.blob()], '동대문마트 영수증.jpg', { type: 'image/jpeg' })]);
});

$('#clear').addEventListener('click', () => {
  state.items.forEach((it) => URL.revokeObjectURL(it.url));
  state.items = [];
  state.selected = null;
  status(statusEl, '');
  render();
});

function getWorker() {
  return (workerP ??= (async () => {
    const { createWorker } = (await import(TESS)).default;
    const worker = await createWorker(['kor', 'eng'], 1, {
      logger: (m) => {
        if (m.status === 'recognizing text') return;
        if (/load|initializ/.test(m.status)) {
          status(statusEl, m.status.includes('traineddata') ? '글자 인식 데이터를 받는 중…' : '글자 인식 엔진을 준비하는 중…');
          progress(prog, m.progress);
        }
      },
    });
    await worker.setParameters({ preserve_interword_spaces: '1' });
    return worker;
  })().catch((e) => {
    workerP = null;
    throw new Error(`글자 인식 엔진을 불러오지 못했습니다. 인터넷 연결을 확인하고 다시 넣으세요. (${e.message || e})`);
  }));
}

function add(files) {
  for (const file of files) {
    const it = { file, url: URL.createObjectURL(file), date: '', time: '', store: '', total: null, payment: '', text: '', state: 'wait' };
    state.items.push(it);
    queue = queue.then(() => run(it));
  }
  if (!state.selected) state.selected = state.items[0];
  render();
}

async function run(it) {
  if (!state.items.includes(it)) return;
  const n = state.items.indexOf(it) + 1;
  try {
    const worker = await getWorker();
    it.state = 'busy';
    render();
    status(statusEl, `${n} / ${state.items.length}장 읽는 중…`);
    progress(prog, (n - 1) / state.items.length);
    const blob = await (await prepare(it.file)).convertToBlob({ type: 'image/png' });
    // single-column mode reads most receipts best; block mode rescues tilted ones where it drops the price column
    let best = null;
    for (const psm of ['4', '6']) {
      await worker.setParameters({ tessedit_pageseg_mode: psm });
      const text = (await worker.recognize(blob)).data.text.replace(/[ \t]+$/gm, '');
      const fields = extract(text);
      const score = ['date', 'store', 'total', 'payment'].filter((k) => fields[k]).length;
      if (!best || score > best.score) best = { text, fields, score };
      if (score === 4) break;
    }
    it.text = best.text;
    Object.assign(it, best.fields);
    it.state = 'done';
  } catch (e) {
    it.state = 'error';
    it.text = e.message || String(e);
    status(statusEl, it.text, true);
  }
  render();
  if (state.items.every((x) => x.state === 'done' || x.state === 'error')) {
    progress(prog, null);
    const ok = state.items.filter((x) => x.state === 'done').length;
    if (ok) status(statusEl, `${ok}장을 읽었습니다. 틀린 칸은 눌러서 고치세요.`);
  }
}

// grayscale → contrast stretch → deskew, at a size Tesseract reads well
async function prepare(file) {
  let bmp;
  try { bmp = await createImageBitmap(file); } catch { throw new Error(`${file.name}: 사진을 열지 못했습니다. JPG나 PNG로 다시 저장해 넣으세요.`); }
  const long = Math.max(bmp.width, bmp.height);
  const scale = long > 2400 ? 2400 / long : long < 1200 ? 1600 / long : 1;
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const img = ctx.getImageData(0, 0, w, h);
  const px = img.data;
  const gray = new Uint8ClampedArray(w * h);
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) {
    const g = (px[i * 4] * 299 + px[i * 4 + 1] * 587 + px[i * 4 + 2] * 114) / 1000;
    gray[i] = g;
    hist[gray[i]]++;
  }
  const pct = (p) => { let s = 0; for (let v = 0; v < 256; v++) { s += hist[v]; if (s >= p * gray.length) return v; } return 255; };
  const lo = pct(0.01), hi = Math.max(pct(0.99), lo + 1);
  for (let i = 0; i < gray.length; i++) {
    const v = ((gray[i] - lo) * 255) / (hi - lo);
    gray[i] = v;
    px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = gray[i];
  }
  ctx.putImageData(img, 0, 0);
  const angle = skew(gray, w, h);
  if (Math.abs(angle) < 0.2) return c;
  const out = new OffscreenCanvas(w, h);
  const o = out.getContext('2d');
  o.fillStyle = '#fff';
  o.fillRect(0, 0, w, h);
  o.translate(w / 2, h / 2);
  o.rotate((-angle * Math.PI) / 180);
  o.drawImage(c, -w / 2, -h / 2);
  return out;
}

// Projection-profile skew estimate on dark (ink) pixels: text rows give the sharpest histogram when level.
function skew(gray, w, h) {
  const step = Math.max(1, Math.round(Math.max(w, h) / 900));
  const pts = [];
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) if (gray[y * w + x] < 70) pts.push(x / step, y / step);
  if (pts.length < 200) return 0;
  const H = Math.ceil(Math.hypot(w, h) / step) + 2;
  const score = (deg) => {
    const a = (deg * Math.PI) / 180, sin = Math.sin(a), cos = Math.cos(a);
    const bins = new Float32Array(H * 2);
    for (let i = 0; i < pts.length; i += 2) bins[Math.round(pts[i + 1] * cos - pts[i] * sin) + H]++;
    let s = 0;
    for (const b of bins) s += b * b;
    return s;
  };
  let best = 0, bestS = -1;
  for (let d = -12; d <= 12; d += 0.5) { const s = score(d); if (s > bestS) { bestS = s; best = d; } }
  for (let d = best - 0.4; d <= best + 0.4; d += 0.1) { const s = score(d); if (s > bestS) { bestS = s; best = d; } }
  return best;
}

const fmt = (v) => (v == null ? '' : v.toLocaleString('ko-KR'));
const FIELDS = ['when', 'store', 'total', 'payment'];

function render() {
  const has = state.items.length > 0;
  $('#drop').hidden = has;
  $('#list').hidden = !has;
  $('#clear').disabled = !has;
  const done = state.items.some((it) => it.state === 'done');
  $('#xlsx').disabled = $('#csv').disabled = !done;
  tbody.replaceChildren(...state.items.map((it) => {
    const tr = document.createElement('tr');
    tr.setAttribute('aria-selected', String(it === state.selected));
    tr.innerHTML = '<td class="thumb"><img alt=""></td><td class="date"></td><td></td><td class="num"></td><td></td>';
    tr.cells[0].firstChild.src = it.url;
    tr.addEventListener('click', () => { if (state.selected !== it) { state.selected = it; render(); } });
    if (it.state !== 'done') {
      tr.cells[1].colSpan = 4;
      tr.cells[1].textContent = it.state === 'error' ? it.text : it.state === 'busy' ? '읽는 중…' : '기다리는 중';
      for (let i = 4; i >= 2; i--) tr.deleteCell(i);
      return tr;
    }
    [it.time ? `${it.date} ${it.time}` : it.date, it.store, fmt(it.total), it.payment].forEach((v, j) => {
      const td = tr.cells[j + 1];
      td.textContent = v;
      td.contentEditable = 'plaintext-only';
      td.addEventListener('blur', () => edit(it, FIELDS[j], td));
    });
    return tr;
  }));
  const sel = state.selected;
  $('#detail').hidden = !sel;
  if (sel) {
    $('#detailImg').src = sel.url;
    $('#capImg').textContent = sel.file.name;
    $('#detailText').textContent = sel.state === 'done' ? sel.text || '(읽힌 글자 없음)' : '';
  }
}

function edit(it, field, td) {
  const v = td.textContent.trim();
  if (field === 'when') {
    const [d = '', t = ''] = v.split(/\s+/);
    it.date = d;
    it.time = t;
  } else if (field === 'total') {
    it.total = v ? money(v.replace(/[^\d.,]/g, '')) || null : null;
    td.textContent = fmt(it.total);
  } else it[field] = v;
}

const HEAD = ['날짜', '시간', '상호', '합계', '결제', '파일'];
const rows = () => state.items.filter((it) => it.state === 'done').map((it) => [it.date, it.time, it.store, it.total ?? '', it.payment, it.file.name]);
const stamp = () => new Date().toISOString().slice(0, 10);

$('#csv').addEventListener('click', () => {
  const esc = (v) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const text = [HEAD, ...rows()].map((r) => r.map((v) => esc(String(v))).join(',')).join('\r\n');
  download(new Blob([`\ufeff${text}\r\n`], { type: 'text/csv;charset=utf-8' }), `영수증-${stamp()}.csv`);
});

$('#xlsx').addEventListener('click', async () => {
  let XLSX;
  try { XLSX = await import(SHEETJS); } catch { return status(statusEl, '엑셀 도구를 불러오지 못했습니다. 인터넷 연결을 확인하거나 CSV로 받으세요.', true); }
  const data = rows();
  const ws = XLSX.utils.aoa_to_sheet([HEAD, ...data]);
  data.forEach((r, i) => {
    const cell = ws[XLSX.utils.encode_cell({ r: i + 1, c: 3 })];
    if (cell && cell.t === 'n') cell.z = '#,##0.##';
  });
  ws['!cols'] = [{ wch: 12 }, { wch: 7 }, { wch: 24 }, { wch: 12 }, { wch: 14 }, { wch: 28 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '영수증');
  download(new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `영수증-${stamp()}.xlsx`);
});
