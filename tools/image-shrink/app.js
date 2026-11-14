import { $, fileInput, status, download, bytes, baseName, loadImage, toBlob } from '../common/tool.js';

const ext = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };
const state = { format: 'image/webp', items: [] };
const tbody = $('#list tbody');
const statusEl = $('#status');

function setFormat(v) {
  state.format = v;
  for (const b of $('#format').children) b.setAttribute('aria-pressed', String(b.dataset.v === v));
  $('#quality').disabled = v === 'image/png';
  $('#pngHint').hidden = v !== 'image/png';
  rerunAll();
}

$('#format').addEventListener('click', (e) => { if (e.target.dataset.v) setFormat(e.target.dataset.v); });
$('#quality').addEventListener('input', (e) => { $('#qOut').value = e.target.value; });
$('#size').addEventListener('input', (e) => { $('#sOut').value = `${e.target.value}px`; });
$('#quality').addEventListener('change', rerunAll);
$('#size').addEventListener('change', rerunAll);

fileInput($('#drop'), $('#file'), (files, err) => {
  if (err) return status(statusEl, err.message, true);
  addFiles(files);
});

$('#sample').addEventListener('click', async (e) => {
  e.stopPropagation();
  const res = await fetch('sample.jpg');
  addFiles([new File([await res.blob()], 'sample.jpg', { type: 'image/jpeg' })]);
});

$('#clear').addEventListener('click', () => {
  state.items.forEach((it) => it.img && URL.revokeObjectURL(it.img.src));
  state.items = [];
  render();
});

$('#saveAll').addEventListener('click', () => {
  state.items.filter((it) => it.out).forEach((it) => download(it.out, outName(it)));
});

function outName(it) {
  return `${baseName(it.file)}.${ext[state.format]}`;
}

async function addFiles(files) {
  status(statusEl, '');
  for (const file of files) {
    const it = { file, img: null, out: null, w: 0, h: 0, error: '' };
    state.items.push(it);
    try {
      it.img = await loadImage(file);
    } catch (e) {
      it.error = e.message;
    }
  }
  render();
  rerunAll();
}

let run = 0;
async function rerunAll() {
  const id = ++run;
  const max = +$('#size').value;
  const q = +$('#quality').value / 100;
  for (const it of state.items) {
    if (!it.img || id !== run) continue;
    const scale = Math.min(1, max / Math.max(it.img.naturalWidth, it.img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(it.img.naturalWidth * scale);
    c.height = Math.round(it.img.naturalHeight * scale);
    const ctx = c.getContext('2d');
    if (state.format === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(it.img, 0, 0, c.width, c.height);
    it.out = await toBlob(c, state.format, q);
    it.w = c.width; it.h = c.height;
    if (id === run) render();
  }
}

function render() {
  const has = state.items.length > 0;
  $('#drop').hidden = has;
  $('#list').hidden = !has;
  $('#saveAll').disabled = !state.items.some((it) => it.out);
  $('#clear').disabled = !has;
  tbody.replaceChildren(...state.items.map((it) => {
    const tr = document.createElement('tr');
    const pct = it.out ? Math.round((it.out.size / it.file.size - 1) * 100) : null;
    tr.innerHTML = `<td></td><td class="meta">${it.out ? `${it.w}×${it.h}` : ''}</td>
      <td class="num meta">${bytes(it.file.size)}</td>
      <td class="num meta">${it.out ? bytes(it.out.size) : it.error ? '' : '…'}</td>
      <td class="num meta">${pct == null ? '' : `${pct > 0 ? '+' : ''}${pct}%`}</td><td class="num"></td>`;
    tr.cells[0].textContent = it.error ? `${it.file.name}: ${it.error}` : it.file.name;
    if (it.out) {
      const b = Object.assign(document.createElement('button'), { className: 'btn', textContent: '받기' });
      b.style.height = '28px';
      b.onclick = () => download(it.out, outName(it));
      tr.cells[5].append(b);
    }
    return tr;
  }));
  const shown = state.items.find((it) => it.out);
  $('#preview').hidden = !shown;
  if (shown) {
    $('#imgA').src = shown.img.src;
    if ($('#imgB').dataset.blob) URL.revokeObjectURL($('#imgB').dataset.blob);
    $('#imgB').src = $('#imgB').dataset.blob = URL.createObjectURL(shown.out);
    $('#capA').textContent = `원본 · ${bytes(shown.file.size)}`;
    $('#capB').textContent = `결과 · ${bytes(shown.out.size)}`;
  }
  const done = state.items.filter((it) => it.out);
  if (done.length) {
    const a = done.reduce((s, it) => s + it.file.size, 0);
    const b = done.reduce((s, it) => s + it.out.size, 0);
    status(statusEl, `${done.length}장 · ${bytes(a)} → ${bytes(b)}`);
  }
}
