import { $, fileInput, status, progress, download, baseName, bytes } from '../common/tool.js';
import { transcribe } from './asr.js';
import { parseSubs, fmtTime, parseTime } from './subs.js';

const MB = 'https://esm.sh/mediabunny@1.61.5';
const AAC = 'https://esm.sh/@mediabunny/aac-encoder@1.61.5?deps=mediabunny@1.61.5';
const FONT_URL = 'https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/static/woff2/Pretendard-SemiBold.woff2';
const FONT = '"CaptionSans", "Hiragino Sans", "Noto Sans JP", sans-serif';

const S = { file: null, url: '', cues: [], lang: 'korean', model: 'base', look: 'box', pos: 'bottom', size: 5.5, busy: false };
const video = $('#video');
const overlay = $('#overlay');
const octx = overlay.getContext('2d');
const tbody = $('#cues tbody');
const statusEl = $('#status');

for (const id of ['lang', 'model', 'look', 'pos']) {
  $('#' + id).addEventListener('click', (e) => {
    const v = e.target.dataset.v;
    if (v === undefined) return;
    S[id] = v;
    for (const b of $('#' + id).children) b.setAttribute('aria-pressed', String(b.dataset.v === v));
    drawOverlay();
  });
}
$('#size').addEventListener('input', (e) => { S.size = +e.target.value; $('#sizeOut').value = `${S.size}%`; drawOverlay(); });

fileInput($('#drop'), $('#file'), (files, err) => {
  if (err) return status(statusEl, err.message, true);
  open(files[0]);
});
$('#other').onclick = () => $('#file').click();

function open(file) {
  if (S.busy) return;
  if (S.url) URL.revokeObjectURL(S.url);
  S.file = file;
  S.url = URL.createObjectURL(file);
  video.src = S.url;
  $('#fileName').textContent = file.name;
  $('#drop').hidden = true;
  $('#player').hidden = false;
  for (const id of ['run', 'srtBtn', 'add', 'save']) $('#' + id).disabled = false;
  status(statusEl, '');
  render();
}

video.addEventListener('loadedmetadata', () => {
  overlay.width = video.videoWidth;
  overlay.height = video.videoHeight;
  $('.screen').style.setProperty('--ar', video.videoWidth / video.videoHeight);
  drawOverlay();
});
video.addEventListener('error', () => status(statusEl, '이 브라우저가 이 영상을 열지 못합니다. MP4나 WebM 파일로 다시 고르세요.', true));
video.addEventListener('timeupdate', drawOverlay);
video.addEventListener('seeked', drawOverlay);
video.addEventListener('play', function tick() { drawOverlay(); if (!video.paused) requestAnimationFrame(tick); });

const cueAt = (t) => S.cues.find((c) => t >= c.start && t < c.end);

function drawOverlay() {
  octx.clearRect(0, 0, overlay.width, overlay.height);
  const c = cueAt(video.currentTime);
  if (c) paint(octx, overlay.width, overlay.height, c.text);
  const i = S.cues.indexOf(c);
  [...tbody.rows].forEach((r, j) => r.classList.toggle('on', j === i));
}

// Same routine draws the preview and the exported frames, so what you see is what you get.
function paint(ctx, W, H, text) {
  if (!text.trim()) return;
  const fs = Math.round(Math.min(W, H) * S.size / 100);
  ctx.font = `600 ${fs}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = wrap(ctx, text.trim(), W * 0.88);
  const lh = Math.round(fs * 1.35);
  const total = lines.length * lh;
  const y0 = S.pos === 'top' ? H * 0.07 : S.pos === 'middle' ? (H - total) / 2 : H * 0.93 - total;
  lines.forEach((line, i) => {
    const y = y0 + lh * (i + 0.5);
    if (S.look === 'box') {
      const w = ctx.measureText(line).width + fs * 0.7;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
      ctx.beginPath();
      ctx.roundRect(W / 2 - w / 2, y - lh / 2, w, lh, fs * 0.12);
      ctx.fill();
    } else {
      ctx.lineJoin = 'round';
      ctx.lineWidth = fs * 0.2;
      ctx.strokeStyle = '#000';
      ctx.strokeText(line, W / 2, y);
    }
    ctx.fillStyle = S.look === 'yellow' ? '#ffd400' : '#fff';
    ctx.fillText(line, W / 2, y);
  });
}

function wrap(ctx, text, max) {
  const out = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.match(/\S+\s*/g) || []) {
      if (ctx.measureText(line + word).width <= max) { line += word; continue; }
      if (line) out.push(line.trim());
      line = '';
      for (const ch of word) {
        if (ctx.measureText(line + ch).width > max && line) { out.push(line.trim()); line = ''; }
        line += ch;
      }
    }
    if (line.trim()) out.push(line.trim());
  }
  return out;
}

$('#run').onclick = async () => {
  if (S.busy || !S.file) return;
  S.busy = true;
  $('#run').disabled = $('#save').disabled = true;
  try {
    S.cues = await transcribe(S.file, {
      model: S.model,
      language: S.lang,
      onStatus: (text, ratio) => { status(statusEl, text); progress($('#asrBar'), ratio); },
    });
    render();
    status(statusEl, S.cues.length ? `자막 ${S.cues.length}줄을 만들었습니다. 고칠 곳은 표에서 바로 고치세요.` : '말소리를 찾지 못했습니다. 언어 설정을 확인하세요.', !S.cues.length);
  } catch (e) {
    console.error(e);
    status(statusEl, e.message.startsWith('소리') ? e.message : '받아 적지 못했습니다. 네트워크를 확인하고 최신 Chrome이나 Edge에서 다시 하세요.', true);
  } finally {
    S.busy = false;
    $('#run').disabled = $('#save').disabled = false;
    progress($('#asrBar'), null);
  }
};

$('#srtBtn').onclick = () => $('#srtFile').click();
$('#srtFile').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const cues = parseSubs(await f.text());
  if (!cues.length) return status(statusEl, '자막 줄을 찾지 못했습니다. SRT나 VTT 파일인지 확인하세요.', true);
  S.cues = cues;
  render();
  status(statusEl, `자막 ${cues.length}줄을 불러왔습니다.`);
});

$('#add').onclick = () => {
  const t = video.currentTime || 0;
  const c = { start: t, end: Math.min(t + 2, video.duration || t + 2), text: '' };
  S.cues.push(c);
  S.cues.sort((a, b) => a.start - b.start);
  render();
  tbody.rows[S.cues.indexOf(c)].querySelector('textarea').focus();
};

function render() {
  $('#cues').hidden = !S.cues.length;
  tbody.replaceChildren(...S.cues.map((c, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td class="n"></td><td><input type="text" data-k="start"></td><td><input type="text" data-k="end"></td><td><textarea rows="1" data-k="text"></textarea></td><td><button class="btn x" type="button">지우기</button></td>';
    tr.cells[0].textContent = i + 1;
    tr.cells[0].title = '이 줄로 이동';
    tr.querySelector('[data-k=start]').value = fmtTime(c.start);
    tr.querySelector('[data-k=end]').value = fmtTime(c.end);
    tr.querySelector('textarea').value = c.text;
    tr.cells[0].onclick = () => { video.currentTime = c.start + 0.01; };
    tr.oninput = (e) => {
      const k = e.target.dataset.k;
      if (k === 'text') c.text = e.target.value;
      else { const t = parseTime(e.target.value); e.target.classList.toggle('bad', !Number.isFinite(t)); if (Number.isFinite(t)) c[k] = t; }
      drawOverlay();
    };
    tr.querySelector('.x').onclick = () => { S.cues.splice(S.cues.indexOf(c), 1); render(); };
    return tr;
  }));
  drawOverlay();
}

$('#save').onclick = async () => {
  if (S.busy) return;
  if (!S.cues.some((c) => c.text.trim())) return status(statusEl, '입힐 자막이 없습니다. 받아쓰기를 하거나 SRT를 불러오세요.', true);
  S.busy = true;
  video.pause();
  $('#save').disabled = $('#run').disabled = true;
  progress($('#bar'), 0);
  status(statusEl, '자막을 입히는 중입니다.');
  try {
    await fontReady;
    const mb = await import(MB);
    const input = new mb.Input({ source: new mb.BlobSource(S.file), formats: mb.ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) throw new Error('이 브라우저가 이 영상 코덱을 읽지 못합니다. 최신 Chrome이나 Edge에서 다시 하세요.');
    const hasAudio = !!(await input.getPrimaryAudioTrack());
    if (hasAudio && !(await mb.canEncodeAudio('aac'))) (await import(AAC)).registerAacEncoder();
    const W = Math.floor(track.displayWidth / 2) * 2, H = Math.floor(track.displayHeight / 2) * 2;
    const canvas = new OffscreenCanvas(W, H);
    const ctx = canvas.getContext('2d');
    const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new mb.BufferTarget() });
    const conv = await mb.Conversion.init({
      input, output,
      video: {
        allowTransformationMetadata: false,
        forceTranscode: true,
        processedWidth: W,
        processedHeight: H,
        process: (sample) => {
          sample.drawWithFit(ctx, { fit: 'fill' });
          const c = cueAt(sample.timestamp);
          if (c) paint(ctx, W, H, c.text);
          return canvas;
        },
      },
      audio: { codec: 'aac' },
    });
    if (!conv.isValid) throw new Error('이 브라우저에서 MP4를 만들 수 없습니다. 최신 Chrome이나 Edge에서 다시 하세요.');
    conv.onProgress = (p) => progress($('#bar'), p);
    await conv.execute();
    const blob = new Blob([output.target.buffer], { type: 'video/mp4' });
    download(blob, `${baseName(S.file)}-자막.mp4`);
    status(statusEl, `${W}×${H} · ${bytes(blob.size)}${hasAudio && conv.discardedTracks.some((d) => d.track.type === 'audio') ? ' · 소리는 담지 못했습니다' : ''}`);
  } catch (e) {
    console.error(e);
    status(statusEl, e.message.includes('브라우저') ? e.message : '영상을 만들지 못했습니다. 다른 파일로 다시 하세요.', true);
  } finally {
    S.busy = false;
    progress($('#bar'), null);
    $('#save').disabled = $('#run').disabled = false;
  }
};

const fontReady = (async () => {
  try { const f = new FontFace('CaptionSans', `url(${FONT_URL})`, { weight: '600' }); await f.load(); document.fonts.add(f); }
  catch { /* falls back to the system sans */ }
  drawOverlay();
})();
