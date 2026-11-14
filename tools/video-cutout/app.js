import { $, fileInput, status, progress, download, baseName, bytes, loadImage } from '../common/tool.js';

const MB = 'https://esm.sh/mediabunny@1.61.5';
const AAC = 'https://esm.sh/@mediabunny/aac-encoder@1.61.5?deps=mediabunny@1.61.5';
const VISION = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1';
const SEG_MODEL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite';
const EDGES = [['부드럽게', 0, 1], ['보통', 0.25, 0.75], ['또렷하게', 0.4, 0.6]];

const video = $('#video');
const out = $('#out');
const statusEl = $('#status');
const S = { file: null, url: '', W: 0, H: 0, bg: 'blur', blur: 12, color: '#00b140', img: null, edge: 1, busy: false };

// One Compositor per output size; keeps its own scratch canvases and the previous mask for temporal smoothing.
class Compositor {
  constructor(W, H) {
    this.W = W; this.H = H;
    this.seg = new OffscreenCanvas(256, Math.max(1, Math.round(256 * H / W)));
    this.sctx = this.seg.getContext('2d', { willReadFrequently: true });
    this.mask = new OffscreenCanvas(1, 1);
    this.mctx = this.mask.getContext('2d');
    this.person = new OffscreenCanvas(W, H);
    this.pctx = this.person.getContext('2d');
    this.prev = null;
  }
  reset() { this.prev = null; }
  draw(ctx, src, segmenter) {
    const { W, H } = this;
    this.sctx.drawImage(src, 0, 0, this.seg.width, this.seg.height);
    const res = segmenter.segment(this.seg);
    const m = res.confidenceMasks[0]; // class 0 = background
    const conf = m.getAsFloat32Array();
    if (this.mask.width !== m.width || this.mask.height !== m.height) {
      Object.assign(this.mask, { width: m.width, height: m.height });
      this.img = this.mctx.createImageData(m.width, m.height);
      this.prev = null;
    }
    const [, lo, hi] = EDGES[S.edge];
    const px = this.img.data;
    if (!this.prev) this.prev = new Float32Array(conf.length).map((_, i) => 1 - conf[i]);
    for (let i = 0; i < conf.length; i++) {
      const a = this.prev[i] = this.prev[i] * 0.3 + (1 - conf[i]) * 0.7;
      const t = Math.min(1, Math.max(0, (a - lo) / (hi - lo)));
      px[i * 4 + 3] = t * t * (3 - 2 * t) * 255;
    }
    res.close();
    this.mctx.putImageData(this.img, 0, 0);

    const p = this.pctx;
    p.globalCompositeOperation = 'copy';
    p.drawImage(src, 0, 0, W, H);
    p.globalCompositeOperation = 'destination-in';
    p.imageSmoothingQuality = 'high';
    p.drawImage(this.mask, 0, 0, W, H);

    ctx.globalCompositeOperation = 'source-over';
    if (S.bg === 'color' || (S.bg === 'image' && !S.img)) {
      ctx.fillStyle = S.color;
      ctx.fillRect(0, 0, W, H);
    } else if (S.bg === 'image') {
      const k = Math.max(W / S.img.naturalWidth, H / S.img.naturalHeight);
      const iw = S.img.naturalWidth * k, ih = S.img.naturalHeight * k;
      ctx.drawImage(S.img, (W - iw) / 2, (H - ih) / 2, iw, ih);
    } else {
      const b = S.blur * Math.max(W, H) / 1000;
      ctx.filter = `blur(${b}px)`;
      ctx.drawImage(src, -2 * b, -2 * b, W + 4 * b, H + 4 * b);
      ctx.filter = 'none';
    }
    ctx.drawImage(this.person, 0, 0);
  }
}

let segmenter = null;
async function getSegmenter() {
  if (segmenter) return segmenter;
  const vision = await import(`${VISION}/+esm`);
  const fileset = await vision.FilesetResolver.forVisionTasks(`${VISION}/wasm`);
  const opts = (delegate) => ({ baseOptions: { modelAssetPath: SEG_MODEL, delegate }, runningMode: 'IMAGE', outputConfidenceMasks: true, outputCategoryMask: false });
  try { segmenter = await vision.ImageSegmenter.createFromOptions(fileset, opts('GPU')); }
  catch { segmenter = await vision.ImageSegmenter.createFromOptions(fileset, opts('CPU')); }
  return segmenter;
}

const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
let preview = null;

fileInput($('#drop'), $('#file'), (files, err) => {
  if (err) return status(statusEl, err.message, true);
  open(files[0]);
});
$('#other').onclick = () => $('#file').click();

async function open(file) {
  if (S.busy) return;
  video.pause();
  if (S.url) URL.revokeObjectURL(S.url);
  S.file = file;
  S.url = URL.createObjectURL(file);
  video.src = S.url;
  status(statusEl, '배경 분리 모델을 받는 중입니다.');
  try {
    await Promise.all([getSegmenter(), new Promise((ok, no) => { video.onloadeddata = ok; video.onerror = no; })]);
  } catch (e) {
    console.error(e);
    return status(statusEl, e instanceof Event ? '이 브라우저가 이 영상을 열지 못합니다. MP4나 WebM 파일로 다시 고르세요.' : '배경 분리 모델을 불러오지 못했습니다. 네트워크를 확인하고 다시 고르세요.', true);
  }
  S.W = video.videoWidth; S.H = video.videoHeight;
  const k = Math.min(1, 960 / Math.max(S.W, S.H));
  out.width = Math.round(S.W * k); out.height = Math.round(S.H * k);
  preview = new Compositor(out.width, out.height);
  $('#seek').max = video.duration;
  $('#drop').hidden = true;
  $('#view').hidden = false;
  $('#save').disabled = false;
  status(statusEl, `${S.W}×${S.H} · ${fmt(video.duration)}`);
  redraw();
}

function redraw() {
  if (!preview || video.readyState < 2) return;
  preview.draw(out.getContext('2d'), video, segmenter);
  $('#seek').value = video.currentTime;
  $('#time').textContent = fmt(video.currentTime);
}

$('#play').onclick = () => (video.paused ? video.play() : video.pause());
video.addEventListener('play', () => {
  $('#play').textContent = '멈춤';
  const step = () => { if (video.paused) return; redraw(); video.requestVideoFrameCallback(step); };
  video.requestVideoFrameCallback(step);
});
video.addEventListener('pause', () => { $('#play').textContent = '재생'; });
video.addEventListener('seeked', () => { preview?.reset(); redraw(); });
$('#seek').addEventListener('input', (e) => { video.currentTime = +e.target.value; });

$('#bg').addEventListener('click', (e) => {
  const v = e.target.dataset.v;
  if (!v) return;
  S.bg = v;
  for (const b of $('#bg').children) b.setAttribute('aria-pressed', String(b.dataset.v === v));
  for (const el of document.querySelectorAll('[data-for]')) el.hidden = el.dataset.for !== v;
  if (v === 'image' && !S.img) $('#imgFile').click();
  redraw();
});
$('#blur').addEventListener('input', (e) => { S.blur = +e.target.value; $('#blurOut').value = S.blur; redraw(); });
$('#color').addEventListener('input', (e) => { S.color = e.target.value; redraw(); });
$('#edge').addEventListener('input', (e) => { S.edge = +e.target.value; $('#edgeOut').value = EDGES[S.edge][0]; redraw(); });
$('#pickImg').onclick = () => $('#imgFile').click();
$('#imgFile').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try { S.img = await loadImage(f); $('#imgName').textContent = f.name; redraw(); }
  catch (err) { status(statusEl, err.message, true); }
});

$('#save').onclick = async () => {
  if (S.busy) return;
  S.busy = true;
  video.pause();
  $('#save').disabled = true;
  progress($('#bar'), 0);
  status(statusEl, '배경을 바꾸는 중입니다.');
  try {
    const mb = await import(MB);
    const input = new mb.Input({ source: new mb.BlobSource(S.file), formats: mb.ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) throw new Error('이 브라우저가 이 영상 코덱을 읽지 못합니다. 최신 Chrome이나 Edge에서 다시 하세요.');
    const hasAudio = !!(await input.getPrimaryAudioTrack());
    if (hasAudio && !(await mb.canEncodeAudio('aac'))) (await import(AAC)).registerAacEncoder();
    const k = Math.min(1, 1920 / Math.max(track.displayWidth, track.displayHeight));
    const W = Math.floor(track.displayWidth * k / 2) * 2, H = Math.floor(track.displayHeight * k / 2) * 2;
    const frame = new OffscreenCanvas(W, H);
    const fctx = frame.getContext('2d');
    const canvas = new OffscreenCanvas(W, H);
    const ctx = canvas.getContext('2d');
    const comp = new Compositor(W, H);
    const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new mb.BufferTarget() });
    const conv = await mb.Conversion.init({
      input, output,
      video: {
        allowTransformationMetadata: false,
        forceTranscode: true,
        processedWidth: W,
        processedHeight: H,
        process: (sample) => {
          sample.drawWithFit(fctx, { fit: 'fill' });
          comp.draw(ctx, frame, segmenter);
          return canvas;
        },
      },
      audio: { codec: 'aac' },
    });
    if (!conv.isValid) throw new Error('이 브라우저에서 MP4를 만들 수 없습니다. 최신 Chrome이나 Edge에서 다시 하세요.');
    conv.onProgress = (p) => progress($('#bar'), p);
    await conv.execute();
    const blob = new Blob([output.target.buffer], { type: 'video/mp4' });
    download(blob, `${baseName(S.file)}-배경.mp4`);
    status(statusEl, `${W}×${H} · ${bytes(blob.size)}${hasAudio && conv.discardedTracks.some((d) => d.track.type === 'audio') ? ' · 소리는 담지 못했습니다' : ''}`);
  } catch (e) {
    console.error(e);
    status(statusEl, e.message.includes('브라우저') ? e.message : '영상을 만들지 못했습니다. 다른 파일로 다시 하세요.', true);
  } finally {
    S.busy = false;
    progress($('#bar'), null);
    $('#save').disabled = false;
  }
};
