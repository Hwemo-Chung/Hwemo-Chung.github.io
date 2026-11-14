import { $, fileInput, status, progress, download, baseName } from '../common/tool.js';

const RATE = 44100;
// Measured seconds of processing per second of audio (see report); refined live after the first segment.
const SPEED = { webgpu: 0.25, wasm: 2 };
const statusEl = $('#status');
const bar = $('#bar');
const state = { file: null, left: null, right: null, vocals: null, inst: null, gpu: null, busy: false };

if (navigator.gpu) navigator.gpu.requestAdapter().then((a) => { state.gpu = !!a; showEta(); }).catch(() => { state.gpu = false; showEta(); });
else state.gpu = false;

fileInput($('#drop'), $('#file'), (files, err) => {
  if (err) return status(statusEl, err.message, true);
  open(files[0]);
});
$('#pick').addEventListener('click', () => $('#file').click());
$('#run').addEventListener('click', run);
$('#dVoc').addEventListener('click', () => download(wav(state.vocals), `${baseName(state.file)}-보컬.wav`));
$('#dInst').addEventListener('click', () => download(wav(state.inst), `${baseName(state.file)}-반주.wav`));

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const mins = (s) => (s < 60 ? '1분 안쪽' : `약 ${Math.round(s / 60)}분`);

async function open(file) {
  if (state.busy) return;
  status(statusEl, '파일을 읽는 중입니다.');
  let buf;
  try {
    const ctx = new OfflineAudioContext(2, 1, RATE);
    buf = await ctx.decodeAudioData(await file.arrayBuffer());
  } catch {
    return status(statusEl, '이 파일을 소리로 읽지 못했습니다. MP3나 WAV로 바꿔서 다시 올려 주세요.', true);
  }
  state.file = file;
  state.left = buf.getChannelData(0);
  state.right = buf.numberOfChannels > 1 ? buf.getChannelData(1) : buf.getChannelData(0);
  state.vocals = state.inst = null;
  $('#fName').textContent = file.name;
  $('#fDur').textContent = fmt(buf.duration);
  showEta();
  $('#drop').hidden = true;
  $('#result').hidden = false;
  $('#tVoc').hidden = $('#tInst').hidden = true;
  setAudio('#aMix', file);
  draw($('#wMix'), state.left, state.right);
  $('#run').disabled = false;
  progress(bar, null);
  status(statusEl, buf.duration > 600 ? '10분이 넘는 곡은 메모리가 모자랄 수 있습니다.' : '');
}

function showEta() {
  if (!state.left) return;
  const sec = state.left.length / RATE;
  $('#fEta').textContent = state.gpu === null ? '-' : `${mins(sec * SPEED[state.gpu ? 'webgpu' : 'wasm'])} (${state.gpu ? 'GPU' : 'CPU'})`;
}

function run() {
  if (!state.left || state.busy) return;
  state.busy = true;
  $('#run').disabled = true;
  progress(bar, 0);
  status(statusEl, '모델을 준비하는 중입니다.');
  const worker = new Worker('worker.js', { type: 'module' });
  const left = state.left.slice();
  const right = state.right.slice();
  const done = () => { state.busy = false; $('#run').disabled = false; worker.terminate(); };
  worker.onerror = () => { done(); status(statusEl, '분리 모듈을 불러오지 못했습니다. 최신 Chrome, Edge, Safari에서 다시 열어 주세요.', true); };
  worker.onmessage = ({ data: m }) => {
    if (m.type === 'download') {
      progress(bar, m.got / m.total);
      status(statusEl, `모델 받는 중 ${Math.round(m.got / 1048576)} / ${Math.round(m.total / 1048576)} MB`);
    } else if (m.type === 'phase') {
      progress(bar, 0);
      status(statusEl, m.phase === 'init' ? '모델을 여는 중입니다.' : `나누는 중입니다 (${m.backend === 'webgpu' ? 'GPU' : 'CPU'}).`);
    } else if (m.type === 'progress') {
      progress(bar, m.done / m.total);
      const left = (m.elapsed / m.done) * (m.total - m.done) / 1000;
      status(statusEl, `나누는 중 ${m.done}/${m.total} 구간 · 남은 시간 ${m.done === m.total ? '곧 끝남' : mins(left)}`);
    } else if (m.type === 'done') {
      finish(m.left, m.right);
      done();
    } else if (m.type === 'error') {
      done();
      progress(bar, null);
      status(statusEl, m.message.includes('memory') || m.message.includes('Array buffer')
        ? '메모리가 모자랍니다. 다른 탭을 닫거나 더 짧은 곡으로 해 보세요.'
        : `분리하지 못했습니다: ${m.message}`, true);
    }
  };
  worker.postMessage({ left, right }, [left.buffer, right.buffer]);
}

function finish(vl, vr) {
  const n = state.left.length;
  const il = new Float32Array(n);
  const ir = new Float32Array(n);
  for (let i = 0; i < n; i++) { il[i] = state.left[i] - vl[i]; ir[i] = state.right[i] - vr[i]; }
  state.vocals = [vl, vr];
  state.inst = [il, ir];
  $('#tVoc').hidden = $('#tInst').hidden = false;
  draw($('#wVoc'), vl, vr);
  draw($('#wInst'), il, ir);
  setAudio('#aVoc', wav(state.vocals));
  setAudio('#aInst', wav(state.inst));
  progress(bar, null);
  status(statusEl, '끝났습니다. 들어 보고 받으세요.');
}

function setAudio(sel, blob) {
  const a = $(sel);
  if (a.src) URL.revokeObjectURL(a.src);
  a.src = URL.createObjectURL(blob);
}

function draw(canvas, l, r) {
  const g = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height, step = Math.max(1, Math.floor(l.length / w));
  g.clearRect(0, 0, w, h);
  g.fillStyle = getComputedStyle(document.body).getPropertyValue('--ink');
  for (let x = 0; x < w; x++) {
    let peak = 0;
    for (let i = x * step, e = Math.min(l.length, i + step); i < e; i += 8) peak = Math.max(peak, Math.abs(l[i]), Math.abs(r[i]));
    const y = Math.max(1, Math.min(1, peak) * h);
    g.fillRect(x, (h - y) / 2, 1, y);
  }
}

function wav([l, r]) {
  const n = l.length;
  const buf = new ArrayBuffer(44 + n * 4);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 4, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
  v.setUint32(24, RATE, true); v.setUint32(28, RATE * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * 4, true);
  const out = new Int16Array(buf, 44);
  for (let i = 0; i < n; i++) {
    out[i * 2] = Math.max(-1, Math.min(1, l[i])) * 32767;
    out[i * 2 + 1] = Math.max(-1, Math.min(1, r[i])) * 32767;
  }
  return new Blob([buf], { type: 'audio/wav' });
}
