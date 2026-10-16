import { $, fileInput, status, progress, download, baseName } from '../common/tool.js';

const RATE = 48000; // RNNoise only works at 48 kHz
const DELAY = 960; // measured: this RNNoise build outputs two frames late
const statusEl = $('#status');
const bar = $('#bar');
const state = { file: null, src: null, clean: null, out: null, hum: 0, view: 'b', urls: {}, rnnoise: null, job: 0 };

fileInput($('#drop'), $('#file'), (files, err) => {
  if (err) return status(statusEl, err.message, true);
  open(files[0]);
});
$('#pick').addEventListener('click', () => $('#file').click());
$('#mix').addEventListener('input', (e) => { $('#mixOut').value = `${e.target.value}%`; });
$('#hp').addEventListener('input', (e) => { $('#hpOut').value = +e.target.value ? `${e.target.value} Hz` : '끔'; });
$('#mix').addEventListener('change', finish);
$('#lufs').addEventListener('change', finish);
$('#hp').addEventListener('change', processAll);
$('#hum').addEventListener('click', (e) => {
  if (!e.target.dataset.v) return;
  state.hum = +e.target.dataset.v;
  for (const b of $('#hum').children) b.setAttribute('aria-pressed', String(b === e.target));
  processAll();
});
$('#ab').addEventListener('click', (e) => { if (e.target.dataset.v) show(e.target.dataset.v); });
$('#save').addEventListener('click', () => download(state.out, `${baseName(state.file)}-정리.wav`));

async function open(file) {
  status(statusEl, '파일을 읽는 중입니다.');
  let buf;
  try {
    buf = await new OfflineAudioContext(1, 1, RATE).decodeAudioData(await file.arrayBuffer());
  } catch {
    return status(statusEl, '이 파일에서 소리를 읽지 못했습니다. WAV나 MP3로 바꿔서 다시 올려 주세요.', true);
  }
  if (buf.duration > 1200) return status(statusEl, '20분이 넘는 파일은 나눠서 올려 주세요.', true);
  state.file = file;
  state.src = buf;
  $('#drop').hidden = true;
  $('#result').hidden = false;
  $('#pick').disabled = false;
  drawWave($('#wA'), [...Array(buf.numberOfChannels)].map((_, c) => buf.getChannelData(c)));
  setUrl('a', file);
  processAll();
}

async function processAll() {
  if (!state.src) return;
  const job = ++state.job;
  $('#save').disabled = true;
  progress(bar, 0);
  status(statusEl, '잡음을 줄이는 중입니다.');
  try {
    if (!state.rnnoise) {
      const { Rnnoise } = await import('https://cdn.jsdelivr.net/npm/@shiguredo/rnnoise-wasm@2025.1.5/dist/rnnoise.js');
      state.rnnoise = await Rnnoise.load();
    }
    const dry = await filter(state.src, +$('#hp').value, state.hum);
    const wet = [];
    for (let c = 0; c < dry.length; c++) {
      wet.push(await denoise(dry[c], (r) => progress(bar, (c + r) / dry.length), job));
      if (job !== state.job) return;
    }
    state.clean = { dry, wet };
    finish();
  } catch (e) {
    if (job !== state.job) return;
    progress(bar, null);
    status(statusEl, e.message?.includes('fetch') || e.message?.includes('import')
      ? '잡음 제거 모듈을 받지 못했습니다. 인터넷 연결을 확인하고 다시 해 보세요.'
      : `처리하지 못했습니다: ${e.message}`, true);
  }
}

// High-pass and hum notches (fundamental + 3 harmonics), rendered natively.
async function filter(buf, hp, hum) {
  const ctx = new OfflineAudioContext(1, buf.length, RATE); // speech: mix down to mono
  const src = new AudioBufferSourceNode(ctx, { buffer: buf });
  let node = src;
  const chain = (n) => { node.connect(n); node = n; };
  if (hp) {
    chain(new BiquadFilterNode(ctx, { type: 'highpass', frequency: hp, Q: 0.707 }));
    chain(new BiquadFilterNode(ctx, { type: 'highpass', frequency: hp, Q: 0.707 }));
  }
  if (hum) for (let k = 1; k <= 4; k++) chain(new BiquadFilterNode(ctx, { type: 'notch', frequency: hum * k, Q: 25 }));
  node.connect(ctx.destination);
  src.start();
  const out = await ctx.startRendering();
  return [...Array(out.numberOfChannels)].map((_, c) => out.getChannelData(c));
}

async function denoise(x, onProgress, job) {
  const st = state.rnnoise.createDenoiseState();
  const N = state.rnnoise.frameSize;
  const out = new Float32Array(x.length);
  const frame = new Float32Array(N);
  const frames = Math.ceil((x.length + DELAY) / N);
  try {
    for (let f = 0; f < frames; f++) {
      const s = f * N;
      frame.fill(0);
      for (let i = 0; i < N && s + i < x.length; i++) frame[i] = x[s + i] * 32768;
      st.processFrame(frame);
      for (let i = 0; i < N; i++) {
        const j = s + i - DELAY;
        if (j >= 0 && j < out.length) out[j] = frame[i] / 32768;
      }
      if (f % 2000 === 0) {
        onProgress(f / frames);
        await new Promise((r) => setTimeout(r));
        if (job !== state.job) return out;
      }
    }
  } finally {
    st.destroy();
  }
  return out;
}

function finish() {
  if (!state.clean) return;
  const m = +$('#mix').value / 100;
  const { dry, wet } = state.clean;
  const ch = wet.map((w, c) => {
    const d = dry[c];
    const o = new Float32Array(w.length);
    for (let i = 0; i < o.length; i++) o[i] = w[i] * m + d[i] * (1 - m);
    return o;
  });
  const target = $('#lufs').value;
  if (target) {
    const before = loudness(ch);
    if (Number.isFinite(before)) {
      const gain = Math.min(10 ** ((+target - before) / 20), 30);
      for (const o of ch) { for (let i = 0; i < o.length; i++) o[i] *= gain; limit(o, 0.891); } // peaks under -1 dBFS
    }
  }
  const after = loudness(ch);
  state.out = wav(ch);
  setUrl('b', state.out);
  drawWave($('#wB'), ch);
  progress(bar, null);
  $('#save').disabled = false;
  $('#info').textContent = `${fmt(state.src.duration)} · ${Number.isFinite(after) ? `${after.toFixed(1)} LUFS` : '무음'}`;
  status(statusEl, '다 됐습니다. 원본과 바꿔 들어 보세요.');
}

// Peak limiter: per-sample gain with a 5 ms attack ramp ahead of each peak and 100 ms release.
function limit(x, ceil) {
  const g = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) g[i] = Math.min(1, ceil / (Math.abs(x[i]) || 1e-9));
  const att = 1 / (0.005 * RATE), rel = 1 / (0.1 * RATE);
  for (let i = x.length - 2; i >= 0; i--) g[i] = Math.min(g[i], g[i + 1] + att);
  for (let i = 1; i < x.length; i++) g[i] = Math.min(g[i], g[i - 1] + rel);
  for (let i = 0; i < x.length; i++) x[i] *= g[i];
}

// Integrated loudness, ITU-R BS.1770-4 (K-weighting coefficients for 48 kHz).
function loudness(chs) {
  const block = RATE * 0.4, hop = RATE * 0.1;
  const n = chs[0].length;
  if (n < block) return -Infinity;
  const sq = chs.map((x) => {
    const y = biquad(biquad(x, [1.53512485958697, -2.69169618940638, 1.19839281085285], [-1.69065929318241, 0.73248077421585]),
      [1, -2, 1], [-1.99004745483398, 0.99007225036621]);
    const c = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) c[i + 1] = c[i] + y[i] * y[i];
    return c;
  });
  const z = [];
  for (let s = 0; s + block <= n; s += hop) z.push(sq.reduce((t, c) => t + (c[s + block] - c[s]) / block, 0));
  const lk = (p) => -0.691 + 10 * Math.log10(p);
  const mean = (a) => a.reduce((t, v) => t + v, 0) / a.length;
  const abs = z.filter((p) => lk(p) > -70);
  if (!abs.length) return -Infinity;
  const rel = lk(mean(abs)) - 10;
  const gated = abs.filter((p) => lk(p) > rel);
  return lk(mean(gated));
}

function biquad(x, [b0, b1, b2], [a1, a2]) {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

function setUrl(k, blob) {
  if (state.urls[k]) URL.revokeObjectURL(state.urls[k]);
  state.urls[k] = URL.createObjectURL(blob);
  if (state.view === k) swap(k);
}

function show(k) {
  state.view = k;
  for (const b of $('#ab').children) b.setAttribute('aria-pressed', String(b.dataset.v === k));
  swap(k);
}

function swap(k) {
  const p = $('#player');
  const t = p.currentTime, playing = !p.paused;
  p.src = state.urls[k] || '';
  p.addEventListener('loadedmetadata', () => { p.currentTime = Math.min(t, p.duration || t); if (playing) p.play(); }, { once: true });
}

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function drawWave(canvas, chs) {
  const g = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height, n = chs[0].length, step = Math.max(1, Math.floor(n / w));
  g.clearRect(0, 0, w, h);
  g.fillStyle = getComputedStyle(document.body).getPropertyValue('--ink');
  for (let x = 0; x < w; x++) {
    let peak = 0;
    for (const c of chs) for (let i = x * step, e = Math.min(n, i + step); i < e; i += 4) peak = Math.max(peak, Math.abs(c[i]));
    const y = Math.max(1, Math.min(1, peak) * h);
    g.fillRect(x, (h - y) / 2, 1, y);
  }
}

function wav(chs) {
  const n = chs[0].length, k = chs.length;
  const buf = new ArrayBuffer(44 + n * k * 2);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * k * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, k, true);
  v.setUint32(24, RATE, true); v.setUint32(28, RATE * k * 2, true); v.setUint16(32, k * 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * k * 2, true);
  const out = new Int16Array(buf, 44);
  for (let i = 0; i < n; i++) for (let c = 0; c < k; c++) out[i * k + c] = Math.max(-1, Math.min(1, chs[c][i])) * 32767;
  return new Blob([buf], { type: 'audio/wav' });
}
