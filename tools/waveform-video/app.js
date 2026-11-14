import { $, fileInput, status, progress, download, baseName, loadImage } from '../common/tool.js';

const MB = 'https://cdn.jsdelivr.net/npm/mediabunny@1.61.5/+esm';
const RATE = 48000;
const FPS = 30;
const BANDS = 48;
const FONT = '"Pretendard Variable", Pretendard, "Geist", system-ui, sans-serif';
const statusEl = $('#status');
const bar = $('#bar');
const cv = $('#cv');
const player = $('#player');
const state = { file: null, audio: null, spec: null, frames: 0, cover: null, size: [1080, 1920], busy: false };

fileInput($('#drop'), $('#file'), (files, err) => {
  if (err) return status(statusEl, err.message, true);
  open(files[0]);
});
$('#pick').addEventListener('click', () => $('#file').click());
$('#ratio').addEventListener('click', (e) => {
  if (!e.target.dataset.v || state.busy) return;
  for (const b of $('#ratio').children) b.setAttribute('aria-pressed', String(b === e.target));
  state.size = e.target.dataset.v.split('x').map(Number);
  [cv.width, cv.height] = state.size;
  preview();
});
for (const id of ['#title', '#bg', '#fg']) $(id).addEventListener('input', preview);
$('#coverPick').addEventListener('click', () => $('#coverFile').click());
$('#coverFile').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    state.cover = await loadImage(f);
    $('#coverName').textContent = f.name;
    $('#coverClear').hidden = false;
    preview();
  } catch (err) { status(statusEl, err.message, true); }
});
$('#coverClear').addEventListener('click', () => {
  state.cover = null;
  $('#coverName').textContent = '없음';
  $('#coverClear').hidden = true;
  preview();
});
$('#export').addEventListener('click', exportMp4);
player.addEventListener('play', loop);
player.addEventListener('seeked', preview);

async function open(file) {
  if (state.busy) return;
  status(statusEl, '오디오를 읽는 중입니다.');
  let audio;
  try {
    audio = await new OfflineAudioContext(2, 1, RATE).decodeAudioData(await file.arrayBuffer());
  } catch {
    return status(statusEl, '이 파일을 소리로 읽지 못했습니다. MP3나 WAV로 바꿔서 다시 올려 주세요.', true);
  }
  if (audio.duration > 900) return status(statusEl, '15분이 넘는 오디오는 잘라서 올려 주세요.', true);
  state.file = file;
  state.audio = audio;
  state.frames = Math.ceil(audio.duration * FPS);
  state.spec = analyse(audio, state.frames);
  if (player.src) URL.revokeObjectURL(player.src);
  player.src = URL.createObjectURL(file);
  $('#drop').hidden = true;
  $('#view').hidden = false;
  $('#export').disabled = false;
  $('#info').textContent = `${clock(audio.duration)} · ${audio.numberOfChannels === 1 ? '모노' : '스테레오'}`;
  await document.fonts.load(`600 64px ${FONT}`, $('#title').value || '가');
  status(statusEl, '');
  preview();
}

// Per-frame band levels (0..1) from a 2048-point FFT, log-spaced 60 Hz to 12 kHz, fast attack / slow decay.
function analyse(audio, frames) {
  const N = 2048;
  const chs = [...Array(audio.numberOfChannels)].map((_, c) => audio.getChannelData(c));
  const win = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  const edges = Array.from({ length: BANDS + 1 }, (_, b) => Math.round((60 * (12000 / 60) ** (b / BANDS)) / (RATE / N)));
  const out = new Float32Array(frames * BANDS);
  const re = new Float32Array(N), im = new Float32Array(N);
  for (let f = 0; f < frames; f++) {
    const c0 = Math.round((f / FPS) * RATE) - N / 2;
    for (let i = 0; i < N; i++) {
      const j = c0 + i;
      let v = 0;
      if (j >= 0 && j < chs[0].length) for (const ch of chs) v += ch[j];
      re[i] = (v / chs.length) * win[i];
      im[i] = 0;
    }
    fft(re, im);
    for (let b = 0; b < BANDS; b++) {
      let m = 0;
      for (let k = edges[b]; k <= Math.max(edges[b], edges[b + 1] - 1); k++) m = Math.max(m, Math.hypot(re[k], im[k]));
      out[f * BANDS + b] = 20 * Math.log10(m + 1e-9);
    }
  }
  // Normalise each band on its own so quiet high bands still move.
  const col = new Float32Array(frames);
  for (let b = 0; b < BANDS; b++) {
    for (let f = 0; f < frames; f++) col[f] = out[f * BANDS + b];
    col.sort();
    const lo = col[Math.floor(frames * 0.2)], hi = Math.max(col[Math.floor(frames * 0.995)], lo + 24);
    for (let f = 0; f < frames; f++) out[f * BANDS + b] = Math.max(0, Math.min(1, (out[f * BANDS + b] - lo) / (hi - lo)));
  }
  for (let f = 1; f < frames; f++) for (let b = 0; b < BANDS; b++) {
    const i = f * BANDS + b;
    out[i] = Math.max(out[i], out[i - BANDS] * 0.88);
  }
  return out;
}

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const p = i + k, q = p + len / 2;
        const tr = re[q] * cr - im[q] * ci, ti = re[q] * ci + im[q] * cr;
        re[q] = re[p] - tr; im[q] = im[p] - ti; re[p] += tr; im[p] += ti;
        [cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
      }
    }
  }
}

function draw(ctx, t) {
  const [W, H] = [ctx.canvas.width, ctx.canvas.height];
  const fg = $('#fg').value;
  const wide = W > H;
  const unit = Math.min(W, H);
  const m = unit * 0.08;
  ctx.fillStyle = $('#bg').value;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = fg;
  ctx.strokeStyle = fg;

  const title = $('#title').value.trim();
  const fs = Math.round(unit * (wide ? 0.06 : 0.058));
  ctx.font = `600 ${fs}px ${FONT}`;
  const textW = wide && state.cover ? W - unit * 0.62 - m * 2.5 : W - m * 2;
  const lines = title ? wrap(ctx, title, textW).slice(0, 3) : [];
  const waveH = unit * (wide ? 0.26 : 0.22);
  const coverS = state.cover ? (wide ? H - m * 2 : Math.min(W - m * 2, unit * 0.62)) : 0;

  let x0 = m, y = m, w = W - m * 2;
  if (wide && state.cover) {
    cover(ctx, m, m, coverS);
    x0 = m * 1.5 + coverS; w = W - x0 - m;
    y = (H - (lines.length * fs * 1.25 + (lines.length ? fs : 0) + waveH + fs * 1.6)) / 2;
  } else {
    const total = (coverS ? coverS + fs * 1.2 : 0) + lines.length * fs * 1.25 + (lines.length ? fs : 0) + waveH + fs * 1.6;
    y = Math.max(m, (H - total) / 2);
    if (coverS) { cover(ctx, (W - coverS) / 2, y, coverS); y += coverS + fs * 1.2; }
  }
  ctx.textBaseline = 'top';
  ctx.textAlign = wide && state.cover ? 'left' : 'center';
  const tx = wide && state.cover ? x0 : W / 2;
  for (const line of lines) { ctx.fillText(line, tx, y); y += fs * 1.25; }
  if (lines.length) y += fs;

  // bars, mirrored around the middle line
  const f = Math.min(state.frames - 1, Math.max(0, Math.round(t * FPS)));
  const gap = w / BANDS;
  const bw = Math.max(2, gap * 0.56);
  const mid = y + waveH / 2;
  for (let b = 0; b < BANDS; b++) {
    const v = state.spec ? state.spec[f * BANDS + b] : 0;
    const h = Math.max(bw, v * waveH);
    ctx.beginPath();
    ctx.roundRect(x0 + b * gap + (gap - bw) / 2, mid - h / 2, bw, h, bw / 2);
    ctx.fill();
  }
  y += waveH + fs * 0.6;

  // progress and time
  const dur = state.audio ? state.audio.duration : 0;
  const lw = Math.max(3, unit * 0.005);
  ctx.globalAlpha = 0.3;
  ctx.fillRect(x0, y, w, lw);
  ctx.globalAlpha = 1;
  ctx.fillRect(x0, y, dur ? (w * Math.min(t, dur)) / dur : 0, lw);
  ctx.font = `400 ${Math.round(fs * 0.5)}px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText(clock(t), x0, y + lw * 3);
  ctx.textAlign = 'right';
  ctx.fillText(clock(dur), x0 + w, y + lw * 3);
}

function cover(ctx, x, y, s) {
  const img = state.cover;
  const k = Math.max(s / img.naturalWidth, s / img.naturalHeight);
  const sw = s / k, sh = s / k;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, s, s, s * 0.03);
  ctx.clip();
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, s, s);
  ctx.restore();
}

function wrap(ctx, text, max) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= max || !line) line = next;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function preview() {
  if (state.audio) draw(cv.getContext('2d'), player.currentTime);
}

function loop() {
  preview();
  if (!player.paused) requestAnimationFrame(loop);
}

async function exportMp4() {
  if (!state.audio || state.busy) return;
  if (!('VideoEncoder' in window) || !('AudioEncoder' in window)) {
    return status(statusEl, '이 브라우저는 영상 인코딩을 지원하지 않습니다. Chrome이나 Edge 최신 버전에서 열어 주세요.', true);
  }
  state.busy = true;
  player.pause();
  $('#export').disabled = true;
  progress(bar, 0);
  status(statusEl, '영상을 만드는 중입니다.');
  try {
    const mb = await import(MB);
    const [W, H] = state.size;
    const vcodec = await mb.getFirstEncodableVideoCodec(['avc', 'vp9', 'av1'], { width: W, height: H });
    const acodec = await mb.getFirstEncodableAudioCodec(['aac', 'opus'], { numberOfChannels: state.audio.numberOfChannels, sampleRate: RATE });
    if (!vcodec || !acodec) throw new Error('codec');
    const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
    const ctx = canvas.getContext('2d');
    const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new mb.BufferTarget() });
    const video = new mb.CanvasSource(canvas, { codec: vcodec, quality: new mb.Quality('high') });
    const audio = new mb.AudioBufferSource({ codec: acodec, quality: new mb.Quality('high') });
    output.addVideoTrack(video, { frameRate: FPS });
    output.addAudioTrack(audio);
    await output.start();
    await audio.add(state.audio);
    audio.close();
    const t0 = performance.now();
    for (let f = 0; f < state.frames; f++) {
      draw(ctx, f / FPS);
      await video.add(f / FPS, 1 / FPS);
      if (f % 30 === 0) {
        progress(bar, f / state.frames);
        const left = ((performance.now() - t0) / (f + 1)) * (state.frames - f) / 1000;
        status(statusEl, `영상을 만드는 중 ${Math.round((f / state.frames) * 100)}% · 남은 시간 약 ${Math.ceil(left)}초`);
      }
    }
    video.close();
    await output.finalize();
    const blob = new Blob([output.target.buffer], { type: 'video/mp4' });
    download(blob, `${baseName(state.file)}-파형.mp4`);
    status(statusEl, `받았습니다 · ${(blob.size / 1048576).toFixed(1)} MB · ${vcodec === 'avc' ? 'H.264' : vcodec.toUpperCase()} + ${acodec === 'aac' ? 'AAC' : 'Opus'}`);
  } catch (e) {
    status(statusEl, e.message === 'codec'
      ? '이 브라우저에서 쓸 수 있는 영상 코덱이 없습니다. Chrome이나 Edge 최신 버전에서 열어 주세요.'
      : `영상을 만들지 못했습니다: ${e.message}`, true);
  } finally {
    state.busy = false;
    $('#export').disabled = false;
    progress(bar, null);
  }
}
