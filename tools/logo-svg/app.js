import { $, fileInput, status, download, bytes, baseName, loadImage } from '../common/tool.js';

const state = { file: null, img: null, svg: null, detail: 'mid', zoom: 1, busy: false, again: false };
const statusEl = $('#status');
let worker;

fileInput($('#drop'), $('#file'), async (files, err) => {
  if (err) return status(statusEl, err.message, true);
  try {
    const img = await loadImage(files[0]);
    if (state.img) URL.revokeObjectURL(state.img.src);
    Object.assign(state, { file: files[0], img });
    $('#imgA').src = img.src;
    $('#drop').hidden = true;
    $('#result').hidden = false;
    $('#clear').disabled = false;
    trace();
  } catch (e) {
    status(statusEl, e.message, true);
  }
});

$('#colors').addEventListener('input', (e) => { $('#cOut').value = e.target.value; });
$('#colors').addEventListener('change', trace);
$('#dropBg').addEventListener('change', trace);
$('#detail').addEventListener('click', (e) => {
  if (!e.target.dataset.v) return;
  state.detail = e.target.dataset.v;
  press($('#detail'), state.detail);
  trace();
});
$('#zoom').addEventListener('click', (e) => {
  if (!e.target.dataset.v) return;
  state.zoom = +e.target.dataset.v;
  press($('#zoom'), e.target.dataset.v);
  layout();
});
$('#save').addEventListener('click', () => {
  download(new Blob([state.svg], { type: 'image/svg+xml' }), `${baseName(state.file)}.svg`);
});
$('#clear').addEventListener('click', () => $('#file').click());

// Both panes scroll together so the same spot is compared.
let syncing = false;
for (const [a, b] of [[$('#viewA'), $('#viewB')], [$('#viewB'), $('#viewA')]]) {
  a.addEventListener('scroll', () => {
    if (syncing) return;
    syncing = true;
    b.scrollLeft = a.scrollLeft; b.scrollTop = a.scrollTop;
    requestAnimationFrame(() => { syncing = false; });
  });
}
addEventListener('resize', layout);

function press(seg, v) {
  for (const b of seg.children) b.setAttribute('aria-pressed', String(b.dataset.v === v));
}

function layout() {
  if (!state.img) return;
  const view = $('#viewA');
  const { naturalWidth: w, naturalHeight: h } = state.img;
  const fit = Math.min((view.clientWidth - 2) / w, (view.clientHeight - 2) / h);
  for (const img of [$('#imgA'), $('#imgB')]) {
    img.style.width = `${Math.round(w * fit * state.zoom)}px`;
    img.style.height = `${Math.round(h * fit * state.zoom)}px`;
    img.style.maxWidth = 'none';
  }
}

function trace() {
  if (!state.img) return;
  if (state.busy) { state.again = true; return; }
  state.busy = true;
  $('#save').disabled = true;
  status(statusEl, '곡선으로 바꾸는 중…');
  const { naturalWidth: w, naturalHeight: h } = state.img;
  // Small logos trace poorly, large ones slowly: work at 800-1200px on the long side.
  const long = Math.max(w, h);
  const scale = Math.min(Math.max(long, 800), 1200) / long;
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(state.img, 0, 0, c.width, c.height);
  const imgd = ctx.getImageData(0, 0, c.width, c.height);
  worker ??= new Worker(new URL('trace.js', import.meta.url), { type: 'module' });
  const t0 = performance.now();
  worker.onerror = () => done({ error: '변환 모듈을 불러오지 못했습니다. 인터넷 연결을 확인하고 다시 시도하세요.' });
  worker.onmessage = ({ data }) => done(data, performance.now() - t0);
  worker.postMessage({ imgd, colors: +$('#colors').value, detail: state.detail, dropBg: $('#dropBg').checked, outW: w, outH: h });
}

function done(data, ms) {
  state.busy = false;
  if (state.again) { state.again = false; return trace(); }
  if (data.error) return status(statusEl, data.error, true);
  state.svg = data.svg;
  const blob = new Blob([data.svg], { type: 'image/svg+xml' });
  if ($('#imgB').dataset.blob) URL.revokeObjectURL($('#imgB').dataset.blob);
  $('#imgB').src = $('#imgB').dataset.blob = URL.createObjectURL(blob);
  $('#capA').textContent = `원본 · ${state.img.naturalWidth}×${state.img.naturalHeight} · ${bytes(state.file.size)}`;
  $('#capB').textContent = `SVG · ${bytes(blob.size)}`;
  $('#info').textContent = `경로 ${data.paths}개 · ${(ms / 1000).toFixed(1)}초`;
  $('#swatches').replaceChildren(...data.used.map((c) => {
    const i = document.createElement('i');
    i.style.background = `rgb(${c.r},${c.g},${c.b})`;
    i.title = `#${[c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    return i;
  }));
  $('#save').disabled = false;
  status(statusEl, '');
  layout();
}
