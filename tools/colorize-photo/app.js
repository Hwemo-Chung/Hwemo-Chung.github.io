import { $, fileInput, status, progress, download, baseName, loadImage, toBlob } from '../common/tool.js';

const ORT_URL = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/ort.wasm.min.mjs';
// DDColor-tiny (ICCV 2023), fp16 weights, fixed 512×512 grey RGB in, Lab ab out. WebGPU output is wrong for this graph, so wasm.
const MODEL_URL = 'https://huggingface.co/edgetools/ddcolor/resolve/main/ddcolor-tiny-fp16.onnx';
const MODEL_BYTES = 135444402;
const N = 512;

const statusEl = $('#status');
const bar = $('#bar');
const pane = $('#pane');
const before = $('#before');
const after = $('#after');
const state = { file: null, img: null, L: null, ab: null, busy: false };
let model;

// sRGB <-> CIE Lab (D65), same convention as OpenCV float Lab, which DDColor was trained on.
const LIN = Float32Array.from({ length: 256 }, (_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
const GAM = Uint8ClampedArray.from({ length: 4097 }, (_, i) => { const c = i / 4096; return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055); });
const gam = (c) => GAM[c <= 0 ? 0 : c >= 1 ? 4096 : Math.round(c * 4096)];
const luma = (d, i) => 0.212671 * LIN[d[i]] + 0.71516 * LIN[d[i + 1]] + 0.072169 * LIN[d[i + 2]];
const finv = (t) => (t > 0.206893 ? t * t * t : (t - 16 / 116) / 7.787);

async function fetchModel() {
  const cache = await caches.open('lumos-models').catch(() => null);
  const hit = await cache?.match(MODEL_URL);
  if (hit) return hit.arrayBuffer();
  const res = await fetch(MODEL_URL);
  if (!res.ok) throw new Error(res.statusText);
  const total = +res.headers.get('content-length') || MODEL_BYTES;
  const out = new Uint8Array(total);
  const reader = res.body.getReader();
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out.set(value, n);
    n += value.length;
    progress(bar, n / total);
    status(statusEl, `모델을 받는 중… ${Math.round(n / 1048576)} / ${Math.round(total / 1048576)}MB`);
  }
  cache?.put(MODEL_URL, new Response(out)).catch(() => {});
  return out.buffer;
}

function getModel() {
  model ||= (async () => {
    status(statusEl, '모델을 받는 중…');
    const ort = await import(ORT_URL);
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = true;
    const buf = await fetchModel();
    progress(bar, null);
    status(statusEl, '모델을 여는 중…');
    const session = await ort.InferenceSession.create(buf, { executionProviders: ['wasm'], logSeverityLevel: 3 });
    return { ort, session };
  })().catch((e) => {
    model = null;
    throw e;
  });
  return model;
}

fileInput($('#drop'), $('#file'), (files, err) => {
  if (err) return status(statusEl, err.message, true);
  if (!state.busy) open(files[0]);
});

$('#sample').addEventListener('click', async (e) => {
  e.stopPropagation();
  const res = await fetch('sample.jpg');
  open(new File([await res.blob()], 'migrant-mother-1936.jpg', { type: 'image/jpeg' }));
});

async function open(file) {
  try {
    state.img = await loadImage(file);
  } catch (e) {
    return status(statusEl, e.message, true);
  }
  state.file = file;
  state.ab = null;
  before.src = state.img.src;
  $('#drop').hidden = true;
  $('#view').hidden = false;
  after.hidden = true;
  fit();
  refresh();
  status(statusEl, '');
}

function fit() {
  const { img } = state;
  if (!img) return;
  const W = img.naturalWidth, H = img.naturalHeight;
  const k = Math.min(1, ($('#view').clientWidth - 24) / W, (innerHeight * 0.7) / H);
  pane.style.width = `${Math.round(W * k)}px`;
  pane.style.height = `${Math.round(H * k)}px`;
}
addEventListener('resize', fit);

function refresh() {
  $('#run').disabled = !state.img || state.busy;
  $('#save').disabled = !state.ab || state.busy;
  $('#amount').disabled = !state.ab || state.busy;
  $('#cmp').disabled = !state.ab;
  $('#line').hidden = !state.ab;
  after.hidden = !state.ab;
  split();
}

function split() {
  const v = $('#cmp').value;
  after.style.clipPath = `inset(0 0 0 ${v}%)`;
  $('#line').style.left = `${v}%`;
}
$('#cmp').addEventListener('input', split);

$('#amount').addEventListener('input', (e) => { $('#amountOut').value = `${e.target.value}%`; });
$('#amount').addEventListener('change', () => compose());

$('#run').addEventListener('click', async () => {
  state.busy = true;
  refresh();
  const t0 = performance.now();
  try {
    const { ort, session } = await getModel();
    status(statusEl, '색을 입히는 중…');
    const { img } = state;
    const W = img.naturalWidth, H = img.naturalHeight;

    // full-resolution lightness, kept as-is in the result
    const c = new OffscreenCanvas(W, H);
    const cctx = c.getContext('2d', { willReadFrequently: true });
    cctx.drawImage(img, 0, 0);
    const d = cctx.getImageData(0, 0, W, H).data;
    const L = new Float32Array(W * H);
    for (let i = 0; i < L.length; i++) {
      const y = luma(d, i * 4);
      L[i] = y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y;
    }

    // model input: the photo at 512×512 as neutral grey of the same lightness
    const s = new OffscreenCanvas(N, N);
    const sctx = s.getContext('2d', { willReadFrequently: true });
    sctx.drawImage(img, 0, 0, N, N);
    const sd = sctx.getImageData(0, 0, N, N).data;
    const P = N * N;
    const x = new Float32Array(3 * P);
    for (let i = 0; i < P; i++) x[i] = x[P + i] = x[2 * P + i] = gam(luma(sd, i * 4)) / 255;

    const res = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', x, [1, 3, N, N]) });
    state.L = L;
    state.ab = res[session.outputNames[0]].data;
    compose();
    status(statusEl, `${((performance.now() - t0) / 1000).toFixed(1)}초 걸렸습니다.`);
  } catch (e) {
    console.error(e);
    progress(bar, null);
    status(statusEl, model ? '색을 입히지 못했습니다. 페이지를 새로 고친 뒤 다시 해 보세요.' : '모델을 받지 못했습니다. 네트워크를 확인하고 다시 누르세요.', true);
  } finally {
    state.busy = false;
    refresh();
  }
});

// Upsample ab (bilinear, half-pixel centres) onto the full-size L and convert Lab -> sRGB.
function compose() {
  const { img, L, ab } = state;
  const W = img.naturalWidth, H = img.naturalHeight, P = N * N;
  const k = $('#amount').value / 100;
  const out = new ImageData(W, H);
  const o = out.data;
  for (let y = 0; y < H; y++) {
    const sy = Math.min(N - 1, Math.max(0, ((y + 0.5) * N) / H - 0.5));
    const y0 = Math.floor(sy), y1 = Math.min(N - 1, y0 + 1), fy = sy - y0;
    for (let x = 0; x < W; x++) {
      const sx = Math.min(N - 1, Math.max(0, ((x + 0.5) * N) / W - 0.5));
      const x0 = Math.floor(sx), x1 = Math.min(N - 1, x0 + 1), fx = sx - x0;
      const i00 = y0 * N + x0, i01 = y0 * N + x1, i10 = y1 * N + x0, i11 = y1 * N + x1;
      const w00 = (1 - fx) * (1 - fy), w01 = fx * (1 - fy), w10 = (1 - fx) * fy, w11 = fx * fy;
      const a = k * (ab[i00] * w00 + ab[i01] * w01 + ab[i10] * w10 + ab[i11] * w11);
      const b = k * (ab[P + i00] * w00 + ab[P + i01] * w01 + ab[P + i10] * w10 + ab[P + i11] * w11);
      const l = L[y * W + x];
      const fyv = (l + 16) / 116;
      const Y = l > 8 ? fyv * fyv * fyv : l / 903.3;
      const X = 0.950456 * finv(fyv + a / 500);
      const Z = 1.088754 * finv(fyv - b / 200);
      const j = (y * W + x) * 4;
      o[j] = gam(3.240479 * X - 1.53715 * Y - 0.498535 * Z);
      o[j + 1] = gam(-0.969256 * X + 1.875991 * Y + 0.041556 * Z);
      o[j + 2] = gam(0.055648 * X - 0.204043 * Y + 1.057311 * Z);
      o[j + 3] = 255;
    }
  }
  after.width = W;
  after.height = H;
  after.getContext('2d').putImageData(out, 0, 0);
}

$('#save').addEventListener('click', async () => {
  const jpg = state.file.type === 'image/jpeg';
  const blob = await toBlob(after, jpg ? 'image/jpeg' : 'image/png', 0.95);
  download(blob, `${baseName(state.file)}-color.${jpg ? 'jpg' : 'png'}`);
});
