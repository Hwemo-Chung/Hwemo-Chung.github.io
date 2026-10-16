import { $, fileInput, status, progress, download, baseName } from '../common/tool.js';
import { fromPdf, fromGrid, num } from './parse.js';

const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/';
const SHEETJS = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/';
let pdfjsP, xlsxP, cptableP;
const loadPdfjs = () => (pdfjsP ??= import(`${PDFJS}pdf.min.mjs`).then((m) => {
  m.GlobalWorkerOptions.workerSrc = `${PDFJS}pdf.worker.min.mjs`;
  return m;
}));
const loadXlsx = () => (xlsxP ??= import(`${SHEETJS}xlsx.mjs`));

const statusEl = $('#status');
const prog = $('#prog');
const tbody = $('#sheet tbody');
const state = { name: '', rows: [], check: null };
const fmt = (v) => (v == null ? '' : v.toLocaleString('ko-KR'));
const FIELDS = ['when', 'desc', 'out', 'in', 'bal', 'memo'];

fileInput($('#drop'), $('#file'), (files, err) => {
  if (err) return status(statusEl, '이 형식은 열 수 없습니다. PDF, CSV, XLSX, XLS 파일을 넣으세요.', true);
  open(files[0]);
});

$('#clear').addEventListener('click', () => {
  state.rows = [];
  state.check = null;
  state.name = '';
  $('#pwPanel').hidden = true;
  status(statusEl, '');
  render();
});

async function open(file) {
  state.name = baseName(file);
  status(statusEl, '여는 중…');
  progress(prog, 0);
  try {
    const res = /\.pdf$/i.test(file.name) || file.type === 'application/pdf' ? await readPdf(file) : await readSheet(file);
    state.rows = res.rows;
    state.check = res.check;
    if (!res.rows.length) {
      status(statusEl, '거래 표를 찾지 못했습니다. 날짜와 출금, 입금, 잔액 열이 있는 거래내역 파일인지 확인하세요.', true);
    } else status(statusEl, `${res.rows.length}건을 읽었습니다.`);
  } catch (e) {
    status(statusEl, e.message || String(e), true);
  }
  progress(prog, null);
  $('#pwPanel').hidden = true;
  render();
}

function askPassword(wrong) {
  $('#pwPanel').hidden = false;
  $('#pwHint').textContent = wrong ? '비밀번호가 맞지 않습니다. 다시 입력하세요.' : '은행 거래내역서는 보통 생년월일 6자리입니다.';
  $('#pwHint').style.color = wrong ? 'var(--error)' : '';
  status(statusEl, '비밀번호가 걸린 PDF입니다.');
  $('#pw').value = '';
  $('#pw').focus();
  return new Promise((resolve) => {
    $('#pwForm').onsubmit = (e) => { e.preventDefault(); resolve($('#pw').value); };
  });
}

async function readPdf(file) {
  status(statusEl, 'PDF 읽는 도구를 불러오는 중…');
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false });
  task.onPassword = async (update, reason) => update(await askPassword(reason === pdfjs.PasswordResponses.INCORRECT_PASSWORD));
  let doc;
  try {
    doc = await task.promise;
  } catch (e) {
    throw new Error(e?.name === 'InvalidPDFException' ? 'PDF 파일이 손상됐거나 형식이 맞지 않습니다. 은행에서 다시 받아 넣으세요.' : `PDF를 열지 못했습니다: ${e.message}`);
  }
  $('#pwPanel').hidden = true;
  const pages = [];
  let chars = 0;
  for (let i = 1; i <= doc.numPages; i++) {
    status(statusEl, `${i} / ${doc.numPages}쪽 읽는 중…`);
    progress(prog, i / doc.numPages);
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const items = tc.items.filter((it) => it.str).map((it) => {
      const t = pdfjs.Util.transform(vp.transform, it.transform);
      chars += it.str.trim().length;
      return { str: it.str, x: t[4], y: t[5], w: it.width, h: Math.hypot(it.transform[2], it.transform[3]) || 10 };
    });
    pages.push({ items });
  }
  if (chars < 20) throw new Error('글자가 없는 스캔 PDF입니다. 은행 앱이나 인터넷뱅킹에서 PDF나 엑셀로 다시 받아 넣으세요.');
  return fromPdf(pages);
}

async function readSheet(file) {
  status(statusEl, '표 읽는 도구를 불러오는 중…');
  const XLSX = await loadXlsx();
  const buf = await file.arrayBuffer();
  let wb;
  if (/\.(csv|txt)$/i.test(file.name) || file.type === 'text/csv') {
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { text = new TextDecoder('euc-kr').decode(buf); }
    wb = XLSX.read(text.replace(/^\ufeff/, ''), { type: 'string', raw: true });
  } else {
    if (/\.xls$/i.test(file.name)) XLSX.set_cptable(await (cptableP ??= import(`${SHEETJS}dist/cpexcel.full.mjs`)));
    wb = XLSX.read(buf, { cellDates: true, dense: false });
  }
  for (const name of wb.SheetNames) {
    const grid = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '' });
    const res = fromGrid(grid);
    if (res.rows.length) return res;
  }
  return { rows: [], check: null };
}

function when(r) {
  return r.time ? `${r.date} ${r.time}` : r.date;
}

function render() {
  const has = state.rows.length > 0;
  $('#drop').hidden = has;
  $('#sheet').hidden = !has;
  $('#sumPanel').hidden = !has;
  for (const id of ['#xlsx', '#csv']) $(id).disabled = !has;
  $('#clear').disabled = !has && !state.name;
  tbody.replaceChildren(...state.rows.map((r, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td class="date"></td><td></td><td class="num"></td><td class="num"></td><td class="num"></td><td></td><td class="x"></td>';
    const vals = [when(r), r.desc, fmt(r.out), fmt(r.in), fmt(r.bal), r.memo];
    vals.forEach((v, j) => {
      const td = tr.cells[j];
      td.textContent = v;
      td.contentEditable = 'plaintext-only';
      td.addEventListener('blur', () => edit(i, FIELDS[j], td));
    });
    const del = Object.assign(document.createElement('button'), { className: 'btn', textContent: '빼기', type: 'button' });
    del.onclick = () => { state.rows.splice(i, 1); render(); };
    tr.cells[6].append(del);
    return tr;
  }));
  summary();
}

function edit(i, field, td) {
  const r = state.rows[i];
  const text = td.textContent.trim();
  if (field === 'when') {
    const m = text.match(/^(\S+)\s*(.*)$/);
    r.date = m ? m[1] : '';
    r.time = m ? m[2] : '';
  } else if (field === 'desc' || field === 'memo') r[field] = text;
  else {
    r[field] = text === '' ? null : num(text);
    td.textContent = fmt(r[field]);
  }
  summary();
}

function summary() {
  if (!state.rows.length) return;
  const rows = state.rows;
  const sum = (k) => rows.reduce((s, r) => s + (r[k] || 0), 0);
  const dates = rows.map((r) => r.date).filter(Boolean).sort();
  $('#fileName').textContent = state.name;
  $('#sCount').textContent = `${rows.length}건`;
  $('#sRange').textContent = dates.length ? `${dates[0]} ~ ${dates.at(-1)}` : '';
  $('#sOut').textContent = `${fmt(sum('out'))}원`;
  $('#sIn').textContent = `${fmt(sum('in'))}원`;
  const c = state.check;
  $('#sCheck').textContent = c && c.n ? `${c.ok} / ${c.n} 맞음` : '잔액 열 없음';
}

const HEAD = ['날짜', '내용', '출금', '입금', '잔액', '메모'];

$('#csv').addEventListener('click', () => {
  const esc = (v) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [HEAD, ...state.rows.map((r) => [when(r), r.desc, r.out ?? '', r.in ?? '', r.bal ?? '', r.memo])]
    .map((row) => row.map((v) => esc(String(v))).join(','));
  download(new Blob([`\ufeff${lines.join('\r\n')}\r\n`], { type: 'text/csv;charset=utf-8' }), `${state.name}.csv`);
});

$('#xlsx').addEventListener('click', async () => {
  const XLSX = await loadXlsx();
  const toDate = (r) => {
    const [y, m, d] = r.date.split('-').map(Number);
    const [hh = 0, mm = 0, ss = 0] = (r.time || '').split(':').map(Number);
    const dt = new Date(y, m - 1, d, hh, mm, ss);
    return isNaN(dt) ? when(r) : dt;
  };
  const aoa = [HEAD, ...state.rows.map((r) => [toDate(r), r.desc, r.out, r.in, r.bal, r.memo])];
  const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
  const withTime = state.rows.some((r) => r.time);
  for (let i = 1; i < aoa.length; i++) {
    const a = ws[XLSX.utils.encode_cell({ r: i, c: 0 })];
    if (a && a.t === 'd') a.z = withTime ? 'yyyy-mm-dd hh:mm:ss' : 'yyyy-mm-dd';
    for (const c of [2, 3, 4]) {
      const cell = ws[XLSX.utils.encode_cell({ r: i, c })];
      if (cell && cell.t === 'n') cell.z = '#,##0';
    }
  }
  ws['!cols'] = [{ wch: withTime ? 20 : 12 }, { wch: 28 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 16 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '거래내역');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx', cellDates: true });
  download(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${state.name}.xlsx`);
});
