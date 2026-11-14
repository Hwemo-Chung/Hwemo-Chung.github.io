import { $, fileInput, status, progress, download, baseName, bytes } from '../common/tool.js';

const MB = 'https://esm.sh/mediabunny@1.61.5';
const AAC = 'https://esm.sh/@mediabunny/aac-encoder@1.61.5?deps=mediabunny@1.61.5';
const VISION = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1';
const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';
const FACE_FPS = 5;

const video = $('#video');
const box = $('#box');
const out = $('#out');
const octx = out.getContext('2d');
const statusEl = $('#status');
const S = { file: null, url: '', input: null, dur: 0, W: 0, H: 0, cw: 0, ch: 0, ow: 0, oh: 0, start: 0, end: 0, mode: 'manual', manual: { x: 0, y: 0 }, path: null, busy: false };

const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

fileInput($('#drop'), $('#file'), (files, err) => {
  if (err) return status(statusEl, err.message, true);
  open(files[0]);
});
$('#other').onclick = () => $('#file').click();

async function open(file) {
  if (S.busy) return status(statusEl, '지금 작업이 끝난 뒤 다시 고르세요.', true);
  status(statusEl, '영상을 여는 중입니다.');
  video.pause();
  if (S.url) URL.revokeObjectURL(S.url);
  try {
    const mb = await import(MB);
    const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('영상 트랙이 없는 파일입니다. 다른 파일을 고르세요.');
    if (!(await track.canDecode())) throw new Error('이 브라우저가 이 영상 코덱을 읽지 못합니다. 최신 Chrome이나 Edge에서 여세요.');
    const dur = await input.computeDuration();
    Object.assign(S, { file, input, dur, W: track.displayWidth, H: track.displayHeight, path: null, start: 0, end: dur });
  } catch (e) {
    return status(statusEl, e.message.includes('브라우저') || e.message.includes('트랙') ? e.message : '영상을 읽지 못했습니다. MP4나 WebM 파일인지 확인하세요.', true);
  }
  if (S.W / S.H > 9 / 16) { S.ch = S.H; S.cw = S.H * 9 / 16; } else { S.cw = S.W; S.ch = S.W * 16 / 9; }
  S.oh = Math.min(1920, Math.floor(S.ch / 2) * 2);
  S.ow = Math.round(S.oh * 9 / 32) * 2;
  S.manual = { x: S.W / 2, y: S.H / 2 };
  S.url = URL.createObjectURL(file);
  video.src = S.url;
  for (const id of ['start', 'end']) Object.assign($('#' + id), { max: S.dur.toFixed(1), disabled: false });
  $('#start').value = 0; $('#end').value = S.dur.toFixed(1);
  $('#seek').max = S.dur;
  $('#drop').hidden = true;
  $('#editor').hidden = false;
  $('#save').disabled = false;
  $('#dims').textContent = `${S.ow}×${S.oh}`;
  setMode('manual');
  trimChanged();
  status(statusEl, `${S.W}×${S.H} · ${fmt(S.dur)}`);
  video.addEventListener('loadeddata', draw, { once: true });
}

function trimChanged(which) {
  let a = +$('#start').value, b = +$('#end').value;
  if (b - a < 0.5) { if (which === 'start') a = Math.max(0, b - 0.5); else b = Math.min(S.dur, a + 0.5); }
  S.start = a; S.end = Math.min(b, S.dur);
  $('#start').value = a; $('#end').value = b;
  $('#startOut').value = fmt(S.start);
  $('#endOut').value = fmt(S.end);
  $('#lenOut').textContent = `길이 ${(S.end - S.start).toFixed(1)}초`;
  if (which) video.currentTime = which === 'start' ? S.start : S.end;
}
$('#start').addEventListener('input', () => trimChanged('start'));
$('#end').addEventListener('input', () => trimChanged('end'));

$('#play').onclick = () => {
  if (video.paused) {
    if (video.currentTime < S.start || video.currentTime >= S.end - 0.05) video.currentTime = S.start;
    video.play();
  } else video.pause();
};
video.addEventListener('play', () => { $('#play').textContent = '멈춤'; loop(); });
video.addEventListener('pause', () => { $('#play').textContent = '재생'; });
video.addEventListener('seeked', draw);
$('#seek').addEventListener('input', (e) => { video.currentTime = +e.target.value; });

function loop() {
  if (!video.paused && video.currentTime >= S.end) { video.pause(); video.currentTime = S.start; }
  draw();
  if (!video.paused) requestAnimationFrame(loop);
}

// crop centre in source pixels at source time t
function centerAt(t) {
  let c = S.manual;
  if (S.mode === 'face' && S.path) {
    const p = S.path;
    let i = p.findIndex((q) => q.t >= t);
    if (i <= 0) c = p[i === 0 ? 0 : p.length - 1];
    else { const a = p[i - 1], b = p[i], k = (t - a.t) / (b.t - a.t); c = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }; }
  }
  return { x: clamp(c.x, S.cw / 2, S.W - S.cw / 2), y: clamp(c.y, S.ch / 2, S.H - S.ch / 2) };
}

function draw() {
  if (!S.W) return;
  const t = video.currentTime;
  const c = centerAt(t);
  const l = c.x - S.cw / 2, tp = c.y - S.ch / 2;
  Object.assign(box.style, { left: `${l / S.W * 100}%`, top: `${tp / S.H * 100}%`, width: `${S.cw / S.W * 100}%`, height: `${S.ch / S.H * 100}%` });
  if (video.readyState >= 2) octx.drawImage(video, l * video.videoWidth / S.W, tp * video.videoHeight / S.H, S.cw * video.videoWidth / S.W, S.ch * video.videoHeight / S.H, 0, 0, out.width, out.height);
  $('#seek').value = t;
  $('#time').textContent = fmt(t);
}

box.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  box.setPointerCapture(e.pointerId);
  const c0 = centerAt(video.currentTime), x0 = e.clientX, y0 = e.clientY;
  const k = S.W / $('#frame').clientWidth;
  if (S.mode === 'face') setMode('manual');
  const move = (ev) => {
    S.manual = { x: clamp(c0.x + (ev.clientX - x0) * k, S.cw / 2, S.W - S.cw / 2), y: clamp(c0.y + (ev.clientY - y0) * k, S.ch / 2, S.H - S.ch / 2) };
    draw();
  };
  box.addEventListener('pointermove', move);
  box.addEventListener('pointerup', () => box.removeEventListener('pointermove', move), { once: true });
});

$('#mode').addEventListener('click', (e) => { if (e.target.dataset.v) setMode(e.target.dataset.v); });

function setMode(m) {
  S.mode = m;
  for (const b of $('#mode').children) b.setAttribute('aria-pressed', String(b.dataset.v === m));
  $('#modeHint').textContent = m === 'face' ? '상자가 가장 큰 얼굴을 부드럽게 따라갑니다. 상자를 끌면 직접 옮기기로 바뀝니다.' : '영상 위의 밝은 상자를 끌어 위치를 정하세요.';
  if (m === 'face' && !S.path) findFaces();
  draw();
}

let detector = null;
async function getDetector() {
  if (detector) return detector;
  const vision = await import(`${VISION}/+esm`);
  const fileset = await vision.FilesetResolver.forVisionTasks(`${VISION}/wasm`);
  const opts = (delegate) => ({ baseOptions: { modelAssetPath: FACE_MODEL, delegate }, runningMode: 'IMAGE', minDetectionConfidence: 0.5 });
  try { detector = await vision.FaceDetector.createFromOptions(fileset, opts('GPU')); }
  catch { detector = await vision.FaceDetector.createFromOptions(fileset, opts('CPU')); }
  return detector;
}

async function findFaces() {
  if (S.busy) return;
  S.busy = true;
  const file = S.file;
  $('#save').disabled = true;
  status(statusEl, '얼굴 찾기 모델을 받는 중입니다.');
  progress($('#faceBar'), 0);
  try {
    const det = await getDetector();
    const mb = await import(MB);
    const track = await S.input.getPrimaryVideoTrack();
    const scale = Math.min(1, 640 / S.W);
    const sink = new mb.CanvasSink(track, { width: Math.round(S.W * scale), poolSize: 1 });
    const first = await track.getFirstTimestamp();
    const times = [];
    for (let t = first; t < first + S.dur; t += 1 / FACE_FPS) times.push(t);
    const raw = [];
    let n = 0;
    status(statusEl, '얼굴을 찾는 중입니다.');
    for await (const w of sink.canvasesAtTimestamps(times)) {
      if (S.file !== file) return;
      const t = times[n++] - first;
      if (w) {
        const faces = det.detect(w.canvas).detections;
        const f = faces.map((d) => d.boundingBox).sort((a, b) => b.width * b.height - a.width * a.height)[0];
        if (f) raw.push({ t, x: (f.originX + f.width / 2) / scale, y: (f.originY + f.height / 2) / scale });
      }
      if (n % 10 === 0) progress($('#faceBar'), n / times.length);
    }
    if (!raw.length) {
      setMode('manual');
      return status(statusEl, '얼굴을 찾지 못했습니다. 상자를 직접 옮기세요.', true);
    }
    S.path = smooth(raw, times.map((t) => t - first));
    status(statusEl, `얼굴을 ${Math.round(raw.length / times.length * 100)}% 구간에서 찾았습니다.`);
    draw();
  } catch (e) {
    console.error(e);
    setMode('manual');
    status(statusEl, '얼굴 찾기 모델을 불러오지 못했습니다. 네트워크를 확인하고 다시 누르세요.', true);
  } finally {
    S.busy = false;
    progress($('#faceBar'), null);
    $('#save').disabled = false;
  }
}

// fill gaps by holding/interpolating, then a centred moving average (~1.6 s) so the frame glides instead of jittering
function smooth(raw, times) {
  const filled = times.map((t) => {
    const j = raw.findIndex((r) => r.t >= t);
    if (j <= 0) { const r = raw[j === 0 ? 0 : raw.length - 1]; return { t, x: r.x, y: r.y }; }
    const a = raw[j - 1], b = raw[j], k = (t - a.t) / (b.t - a.t);
    return { t, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
  });
  const r = Math.round(0.8 * FACE_FPS);
  return filled.map((p, i) => {
    let sx = 0, sy = 0, n = 0;
    for (let j = Math.max(0, i - r); j <= Math.min(filled.length - 1, i + r); j++) { sx += filled[j].x; sy += filled[j].y; n++; }
    return { t: p.t, x: sx / n, y: sy / n };
  });
}

$('#save').onclick = async () => {
  if (S.busy) return;
  S.busy = true;
  video.pause();
  $('#save').disabled = true;
  progress($('#bar'), 0);
  status(statusEl, '영상을 만드는 중입니다.');
  try {
    const mb = await import(MB);
    const input = new mb.Input({ source: new mb.BlobSource(S.file), formats: mb.ALL_FORMATS });
    const hasAudio = !!(await input.getPrimaryAudioTrack());
    if (hasAudio && !(await mb.canEncodeAudio('aac'))) (await import(AAC)).registerAacEncoder();
    const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new mb.BufferTarget() });
    const canvas = new OffscreenCanvas(S.ow, S.oh);
    const ctx = canvas.getContext('2d');
    const conv = await mb.Conversion.init({
      input, output,
      trim: { start: S.start, end: S.end },
      video: {
        allowTransformationMetadata: false,
        forceTranscode: true,
        processedWidth: S.ow,
        processedHeight: S.oh,
        process: (sample) => {
          const c = centerAt(S.start + sample.timestamp);
          sample.drawWithFit(ctx, { fit: 'fill', crop: { left: Math.round(c.x - S.cw / 2), top: Math.round(c.y - S.ch / 2), width: Math.round(S.cw), height: Math.round(S.ch) } });
          return canvas;
        },
      },
      audio: { codec: 'aac' },
    });
    if (!conv.isValid) throw new Error('이 브라우저에서 MP4를 만들 수 없습니다. 최신 Chrome이나 Edge에서 다시 하세요.');
    conv.onProgress = (p) => progress($('#bar'), p);
    await conv.execute();
    const blob = new Blob([output.target.buffer], { type: 'video/mp4' });
    download(blob, `${baseName(S.file)}-9x16.mp4`);
    status(statusEl, `${S.ow}×${S.oh} · ${(S.end - S.start).toFixed(1)}초 · ${bytes(blob.size)}${hasAudio && conv.discardedTracks.some((d) => d.track.type === 'audio') ? ' · 소리는 담지 못했습니다' : ''}`);
  } catch (e) {
    console.error(e);
    status(statusEl, e.message.includes('브라우저') ? e.message : '영상을 만들지 못했습니다. 구간을 짧게 잡거나 다른 파일로 다시 하세요.', true);
  } finally {
    S.busy = false;
    progress($('#bar'), null);
    $('#save').disabled = false;
  }
};
