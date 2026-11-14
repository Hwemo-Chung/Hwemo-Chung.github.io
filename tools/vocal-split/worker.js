// Runs HTDemucs off the main thread. In: {left, right} at 44.1 kHz. Out: vocals per channel.
import * as ort from 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/dist/ort.webgpu.min.mjs';
import { CONSTANTS, prepareModelInput, standaloneMask, standaloneIspec } from 'https://cdn.jsdelivr.net/npm/demucs-web@1.0.2/+esm';

const MODEL_URL = 'https://huggingface.co/timcsy/demucs-web-onnx/resolve/92e33df61cfc9eb820272aaa62d2ef6dcf4d950d/htdemucs_embedded.onnx';
const { TRAINING_SAMPLES: SEG, MODEL_SPEC_BINS: BINS, MODEL_SPEC_FRAMES: FRAMES, SEGMENT_OVERLAP } = CONSTANTS;
const VOCALS = 3;

ort.env.wasm.numThreads = 1;
let session = null;
let backend = '';

async function fetchModel() {
  const cache = await caches.open('vocal-split-model').catch(() => null);
  const hit = cache && await cache.match(MODEL_URL);
  if (hit) return hit.arrayBuffer();
  const res = await fetch(MODEL_URL);
  if (!res.ok) throw new Error(`모델을 받지 못했습니다 (HTTP ${res.status}). 잠시 뒤 다시 해 보세요.`);
  const total = +res.headers.get('Content-Length') || 180534758;
  const reader = res.body.getReader();
  const buf = new Uint8Array(total);
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf.set(value, got);
    got += value.length;
    postMessage({ type: 'download', got, total });
  }
  const out = got === total ? buf : buf.slice(0, got);
  if (cache) await cache.put(MODEL_URL, new Response(out)).catch(() => {});
  return out;
}

async function load() {
  if (session) return;
  const model = await fetchModel();
  postMessage({ type: 'phase', phase: 'init' });
  const gpu = navigator.gpu && await navigator.gpu.requestAdapter().catch(() => null);
  if (gpu) {
    try {
      session = await ort.InferenceSession.create(model, { executionProviders: ['webgpu'], graphOptimizationLevel: 'basic' });
      backend = 'webgpu';
      return;
    } catch { /* fall back to CPU */ }
  }
  session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'], graphOptimizationLevel: 'basic' });
  backend = 'wasm';
}

async function separate(left, right) {
  const n = left.length;
  const stride = Math.floor(SEG * (1 - SEGMENT_OVERLAP));
  const segments = Math.max(1, Math.ceil(n / stride));
  const outL = new Float32Array(n);
  const outR = new Float32Array(n);
  const weight = new Float32Array(n);
  const half = stride * 0.5;
  const t0 = performance.now();

  for (let s = 0; s < segments; s++) {
    const start = s * stride;
    const len = Math.min(SEG, n - start);
    const segL = new Float32Array(SEG); segL.set(left.subarray(start, start + len));
    const segR = new Float32Array(SEG); segR.set(right.subarray(start, start + len));
    const input = prepareModelInput(segL, segR);
    const feeds = { [session.inputNames[0]]: new ort.Tensor('float32', input.waveform, [1, 2, SEG]) };
    if (session.inputNames.length > 1) feeds[session.inputNames[1]] = new ort.Tensor('float32', input.magSpec, [1, 4, BINS, FRAMES]);
    const result = await session.run(feeds);

    let time = null, freq = null;
    for (const name of session.outputNames) {
      const t = result[name];
      if (t.dims.length === 4) time = t;
      else if (t.dims.length === 5) freq = t;
    }
    const samples = time.dims[3];
    const tv = time.data.subarray(VOCALS * 2 * samples, (VOCALS + 1) * 2 * samples);
    const fv = freq ? standaloneIspec(standaloneMask(freq.data)[VOCALS], SEG) : null;
    for (let i = 0; i < len; i++) {
      const w = Math.min(1, (i + 1) / half, (len - i) / half);
      outL[start + i] += (tv[i] + (fv ? fv.left[i] : 0)) * w;
      outR[start + i] += (tv[samples + i] + (fv ? fv.right[i] : 0)) * w;
      weight[start + i] += w;
    }
    for (const t of Object.values(result)) t.dispose?.();
    postMessage({ type: 'progress', done: s + 1, total: segments, elapsed: performance.now() - t0, backend });
  }
  for (let i = 0; i < n; i++) if (weight[i] > 0) { outL[i] /= weight[i]; outR[i] /= weight[i]; }
  return [outL, outR];
}

onmessage = async ({ data }) => {
  try {
    await load();
    postMessage({ type: 'phase', phase: 'run', backend });
    const [l, r] = await separate(data.left, data.right);
    postMessage({ type: 'done', left: l, right: r, backend }, [l.buffer, r.buffer]);
  } catch (e) {
    postMessage({ type: 'error', message: e.message || String(e) });
  }
};
