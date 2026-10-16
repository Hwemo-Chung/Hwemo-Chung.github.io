import { $, fileInput, status, progress, download, baseName } from '../common/tool.js';
import { pageBlocks, finishDoc } from './layout.js';

const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/';
const DOCX = 'https://cdn.jsdelivr.net/npm/docx@9.11.0/+esm';
const TESS = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.esm.min.js';
const MAX_PAGES = 200;

const statusEl = $('#status');
const prog = $('#prog');
const state = { name: '', doc: null, scan: 'ocr', busy: false };
let pdfjsP, docxP, workerP;
const loadPdfjs = () => (pdfjsP ??= import(`${PDFJS}pdf.min.mjs`).then((m) => {
  m.GlobalWorkerOptions.workerSrc = `${PDFJS}pdf.worker.min.mjs`;
  return m;
}));

$('#scan').addEventListener('click', (e) => {
  const v = e.target.dataset.v;
  if (!v) return;
  state.scan = v;
  for (const b of $('#scan').children) b.setAttribute('aria-pressed', String(b.dataset.v === v));
});

fileInput($('#drop'), $('#file'), (files, err) => {
  if (err) return status(statusEl, 'PDF 파일만 넣을 수 있습니다.', true);
  if (!state.busy) convert(files[0]);
});

$('#clear').addEventListener('click', () => {
  state.doc = null;
  $('#preview').replaceChildren();
  $('#preview').hidden = true;
  $('#drop').hidden = false;
  $('#save').disabled = $('#clear').disabled = true;
  $('#pwPanel').hidden = true;
  status(statusEl, '');
});

$('#save').addEventListener('click', async () => {
  try {
    status(statusEl, 'DOCX 만드는 중…');
    const blob = await buildDocx(state.doc);
    download(blob, `${state.name}.docx`);
    status(statusEl, `${state.doc.pages}쪽을 DOCX로 만들었습니다.`);
  } catch (e) {
    status(statusEl, `DOCX를 만들지 못했습니다: ${e.message}`, true);
  }
});

function askPassword(wrong) {
  $('#pwPanel').hidden = false;
  $('#pwHint').textContent = wrong ? '비밀번호가 맞지 않습니다. 다시 입력하세요.' : '이 PDF는 비밀번호가 있어야 열립니다.';
  $('#pwHint').style.color = wrong ? 'var(--error)' : '';
  $('#pw').value = '';
  $('#pw').focus();
  return new Promise((resolve) => { $('#pwForm').onsubmit = (e) => { e.preventDefault(); resolve($('#pw').value); }; });
}

async function convert(file) {
  state.busy = true;
  state.name = baseName(file);
  status(statusEl, 'PDF 읽는 도구를 불러오는 중…');
  progress(prog, 0);
  try {
    const pdfjs = await loadPdfjs();
    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), fontExtraProperties: true, isEvalSupported: false });
    task.onPassword = async (update, reason) => update(await askPassword(reason === pdfjs.PasswordResponses.INCORRECT_PASSWORD));
    let pdf;
    try { pdf = await task.promise; } catch (e) {
      throw new Error(e?.name === 'InvalidPDFException' ? 'PDF 파일이 손상됐거나 형식이 맞지 않습니다. 원본 PDF를 다시 받아 넣으세요.' : `PDF를 열지 못했습니다: ${e.message}`);
    }
    $('#pwPanel').hidden = true;
    if (pdf.numPages > MAX_PAGES) throw new Error(`${pdf.numPages}쪽짜리 PDF입니다. ${MAX_PAGES}쪽 이하로 나눠서 넣으세요.`);
    const pages = [];
    const seen = new Set();
    let scanned = 0;
    for (let n = 1; n <= pdf.numPages; n++) {
      status(statusEl, `${n} / ${pdf.numPages}쪽 읽는 중…`);
      progress(prog, (n - 1) / pdf.numPages);
      const page = await pdf.getPage(n);
      const got = await readPage(pdfjs, page);
      // logos repeated on every page (or twice on one) go in once
      got.images = got.images.filter((im) => {
        const key = `${im.pxW}x${im.pxH}:${im.png.length}`;
        return !seen.has(key) && seen.add(key);
      });
      const chars = got.items.reduce((s, i) => s + i.str.trim().length, 0);
      const W = got.W, H = got.H;
      const cover = got.images.reduce((s, im) => s + (im.x1 - im.x0) * (im.y1 - im.y0), 0) / (W * H);
      if (chars < 10 && (cover > 0.4 || !got.images.length)) {
        scanned++;
        pages.push(await scannedPage(page, n, pdf.numPages));
      } else pages.push(pageBlocks(got));
      page.cleanup();
    }
    state.doc = { ...finishDoc(pages), pages: pdf.numPages };
    const words = state.doc.blocks.filter((b) => b.type === 'para').length;
    if (!words && !state.doc.blocks.length) throw new Error('읽을 내용이 없는 PDF입니다.');
    render(state.doc);
    $('#save').disabled = false;
    status(statusEl, `${pdf.numPages}쪽을 읽었습니다${scanned ? ` (스캔 ${scanned}쪽 ${state.scan === 'ocr' ? '글자 인식' : '그림으로'})` : ''}. 미리보기를 확인하고 받으세요.`);
  } catch (e) {
    status(statusEl, e.message || String(e), true);
  }
  progress(prog, null);
  $('#clear').disabled = false;
  state.busy = false;
}

async function readPage(pdfjs, page) {
  const vp = page.getViewport({ scale: 1 });
  const ops = await page.getOperatorList();
  const tc = await page.getTextContent();
  const fontInfo = (name) => {
    let f = null;
    try { f = page.commonObjs.get(name); } catch { /* font not exported */ }
    const n = `${f?.name || ''} ${tc.styles[name]?.fontFamily || ''}`;
    return {
      bold: !!f?.bold || /bold|black|heavy|semibold|demi|[-,]bd?\b|hdr|gothicb|extrab/i.test(n),
      italic: !!f?.italic || /italic|oblique|[-,]it\b/i.test(n),
    };
  };
  const fonts = {};
  const items = [];
  for (const it of tc.items) {
    if (!it.str || !it.str.trim()) continue;
    const t = pdfjs.Util.transform(vp.transform, it.transform);
    const size = Math.hypot(t[2], t[3]) || Math.hypot(it.transform[2], it.transform[3]);
    if (size < 1) continue;
    const f = (fonts[it.fontName] ??= fontInfo(it.fontName));
    items.push({ str: it.str, x: t[4], y: t[5], w: it.width, size: Math.round(size * 10) / 10, bold: f.bold, italic: f.italic });
  }
  return { items, images: await pageImages(pdfjs, page, ops, vp), W: vp.width, H: vp.height };
}

async function pageImages(pdfjs, page, ops, vp) {
  const { OPS, Util } = pdfjs;
  const out = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i], args = ops.argsArray[i];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
    else if (fn === OPS.transform) ctm = Util.transform(ctm, args);
    else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) {
      const m = Util.transform(vp.transform, ctm);
      const xs = [m[4], m[0] + m[4], m[2] + m[4], m[0] + m[2] + m[4]];
      const ys = [m[5], m[1] + m[5], m[3] + m[5], m[1] + m[3] + m[5]];
      const box = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
      if (box.x1 - box.x0 < 24 || box.y1 - box.y0 < 24) continue; // glyph-like decorations
      let img = args[0];
      if (typeof img === 'string') {
        const id = img;
        img = await new Promise((res) => (id.startsWith('g_') ? page.commonObjs : page.objs).get(id, res)).catch(() => null);
      }
      const png = img && (await toPng(img));
      if (png) out.push({ ...box, ...png });
    }
  }
  return out;
}

async function toPng(img) {
  const w = img.width, h = img.height;
  if (!w || !h) return null;
  const scale = Math.min(1, 1600 / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  const ctx = c.getContext('2d');
  if (img.bitmap) ctx.drawImage(img.bitmap, 0, 0, c.width, c.height);
  else if (img.data) {
    const src = document.createElement('canvas');
    src.width = w; src.height = h;
    const data = new ImageData(w, h);
    const d = img.data, o = data.data;
    if (img.kind === 3) o.set(d.subarray(0, o.length));
    else if (img.kind === 2) for (let p = 0, q = 0; q < o.length; p += 3, q += 4) { o[q] = d[p]; o[q + 1] = d[p + 1]; o[q + 2] = d[p + 2]; o[q + 3] = 255; }
    else {
      const row = (w + 7) >> 3;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const v = (d[y * row + (x >> 3)] >> (7 - (x & 7))) & 1 ? 255 : 0;
        const q = (y * w + x) * 4;
        o[q] = o[q + 1] = o[q + 2] = v; o[q + 3] = 255;
      }
    }
    src.getContext('2d').putImageData(data, 0, 0);
    ctx.drawImage(src, 0, 0, c.width, c.height);
  } else return null;
  const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
  return blob ? { png: new Uint8Array(await blob.arrayBuffer()), pxW: c.width, pxH: c.height } : null;
}

async function renderPage(page, width) {
  const vp1 = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: width / vp1.width });
  const c = document.createElement('canvas');
  c.width = Math.round(vp.width);
  c.height = Math.round(vp.height);
  await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  return { canvas: c, W: vp1.width, H: vp1.height };
}

const ocrAt = { n: 0, total: 1 };
async function scannedPage(page, n, total) {
  Object.assign(ocrAt, { n, total });
  if (state.scan === 'image') {
    const { canvas, W, H } = await renderPage(page, 1400);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    return [{ type: 'image', y: 0, image: { x0: 0, y0: 0, x1: W, y1: H, png: new Uint8Array(await blob.arrayBuffer()), pxW: canvas.width, pxH: canvas.height } }];
  }
  const worker = await (workerP ??= (async () => {
    const { createWorker } = (await import(TESS)).default;
    return createWorker(['kor', 'eng'], 1, {
      logger: (m) => {
        if (m.status === 'recognizing text') progress(prog, (ocrAt.n - 1 + m.progress) / ocrAt.total);
        else if (/load|initializ/.test(m.status)) status(statusEl, '글자 인식 데이터를 받는 중…');
      },
    });
  })().catch((e) => { workerP = null; throw new Error(`글자 인식 엔진을 불러오지 못했습니다. 인터넷 연결을 확인하세요. (${e.message || e})`); }));
  status(statusEl, `${n}쪽 글자 인식 중…`);
  const { canvas } = await renderPage(page, 2000);
  const { data } = await worker.recognize(canvas);
  return data.text.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean)
    .map((text, i) => ({ type: 'para', y: i, lines: [{ y: i, size: 11, text, bold: false, runs: [{ text, bold: false, italic: false, size: 11 }], x0: 0, x1: 0, cells: [] }], list: null }));
}

function render(doc) {
  const root = $('#preview');
  const nodes = [];
  for (const b of doc.blocks) {
    if (b.type === 'para') {
      const el = document.createElement(b.level ? `h${b.level}` : b.list === 'bullet' ? 'li' : 'p');
      if (b.list === 'number') el.className = 'num';
      for (const r of b.runs) {
        let n = document.createTextNode(r.text);
        if (r.italic) { const i = document.createElement('i'); i.append(n); n = i; }
        if (r.bold && !b.level) { const s = document.createElement('b'); s.append(n); n = s; }
        el.append(n);
      }
      if (b.list === 'bullet') {
        const prev = nodes.at(-1);
        if (prev?.tagName === 'UL') { prev.append(el); continue; }
        const ul = document.createElement('ul');
        ul.append(el);
        nodes.push(ul);
      } else nodes.push(el);
    } else if (b.type === 'table') {
      const t = document.createElement('table');
      t.className = 'data';
      for (const r of b.rows) {
        const tr = t.insertRow();
        for (const c of r) tr.insertCell().textContent = c;
      }
      nodes.push(t);
    } else if (b.type === 'image') {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(new Blob([b.image.png], { type: 'image/png' }));
      img.style.width = `${Math.min(100, ((b.image.x1 - b.image.x0) / 6.12))}%`;
      img.alt = '';
      nodes.push(img);
    }
  }
  root.querySelectorAll('img').forEach((i) => URL.revokeObjectURL(i.src));
  root.replaceChildren(...nodes);
  root.hidden = false;
  $('#drop').hidden = true;
}

async function buildDocx(doc) {
  const D = await (docxP ??= import(DOCX));
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ImageRun } = D;
  const pt = (s) => Math.round(s * 2);
  const children = [];
  for (const b of doc.blocks) {
    if (b.type === 'para') {
      const runs = b.runs.map((r) => new TextRun({ text: r.text, bold: r.bold && !b.level ? true : undefined, italics: r.italic || undefined, size: b.level ? undefined : pt(r.size) }));
      if (b.level) children.push(new Paragraph({ heading: HeadingLevel[`HEADING_${b.level}`], children: runs }));
      else if (b.list === 'bullet') children.push(new Paragraph({ bullet: { level: 0 }, children: runs }));
      else if (b.list === 'number') children.push(new Paragraph({ indent: { left: 400, hanging: 400 }, spacing: { after: 80 }, children: runs }));
      else children.push(new Paragraph({ spacing: { after: 160 }, children: runs }));
    } else if (b.type === 'table') {
      const width = Math.max(...b.rows.map((r) => r.length));
      children.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: b.rows.map((r) => new TableRow({
          children: Array.from({ length: width }, (_, k) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: r[k] || '', size: pt(b.size) })] })] })),
        })),
      }));
      children.push(new Paragraph({ children: [] }));
    } else if (b.type === 'image') {
      const im = b.image;
      const wPx = Math.min(620, ((im.x1 - im.x0) * 96) / 72);
      const hPx = (wPx * im.pxH) / im.pxW;
      children.push(new Paragraph({ children: [new ImageRun({ type: 'png', data: im.png, transformation: { width: Math.round(wPx), height: Math.round(hPx) } })] }));
    }
  }
  const font = { ascii: 'Calibri', hAnsi: 'Calibri', eastAsia: 'Malgun Gothic', cs: 'Calibri' };
  const heading = (size) => ({ run: { size, bold: true, font }, paragraph: { spacing: { before: 240, after: 120 } } });
  const document_ = new Document({
    creator: 'Lumos',
    title: state.name,
    styles: { default: { document: { run: { font, size: pt(doc.body) } }, heading1: heading(36), heading2: heading(30), heading3: heading(26) } },
    sections: [{ children }],
  });
  return Packer.toBlob(document_);
}
