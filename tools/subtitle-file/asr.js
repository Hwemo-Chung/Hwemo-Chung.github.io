// Whisper speech-to-text in the browser (transformers.js). Returns cues [{ start, end, text }] in seconds,
// built from word timestamps so each cue is short and starts when the words start.
const TF = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1/dist/transformers.min.js';
const MODELS = { base: 'onnx-community/whisper-base_timestamped', small: 'onnx-community/whisper-small_timestamped' };
const CHUNK = 30, STRIDE = 5;
const loaded = {};

async function gpu() {
  try {
    const a = navigator.gpu && (await navigator.gpu.requestAdapter());
    if (a) return { f16: a.features.has('shader-f16') };
  } catch {}
  return null;
}

async function load(key, onStatus) {
  if (loaded[key]) return loaded[key];
  const tf = await import(TF);
  const g = await gpu();
  const dtype = !g ? { encoder_model: 'q8', decoder_model_merged: 'q8' }
    : g.f16 ? { encoder_model: 'fp16', decoder_model_merged: 'q4f16' }
    : { encoder_model: key === 'base' ? 'fp32' : 'q4', decoder_model_merged: 'q4' };
  const asr = await tf.pipeline('automatic-speech-recognition', MODELS[key], {
    device: g ? 'webgpu' : 'wasm',
    dtype,
    progress_callback: (p) => {
      if (p.status === 'progress_total' && p.total > 1e6) onStatus(`음성 인식 모델을 받는 중입니다. ${(p.loaded / 1e6).toFixed(0)} / ${(p.total / 1e6).toFixed(0)} MB`, p.loaded / p.total);
    },
  });
  loaded[key] = { asr, tf };
  return loaded[key];
}

// 16 kHz mono PCM, which is what Whisper expects
export async function decodeAudio(file) {
  const ctx = new OfflineAudioContext(1, 1, 16000);
  let buf;
  try { buf = await ctx.decodeAudioData(await file.arrayBuffer()); }
  catch { throw new Error('소리를 읽지 못했습니다. 소리가 들어 있는 MP4, WebM, MP3, WAV 파일인지 확인하세요.'); }
  if (buf.numberOfChannels === 1) return buf.getChannelData(0);
  const out = new Float32Array(buf.length);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < out.length; i++) out[i] += ch[i] / buf.numberOfChannels;
  }
  return out;
}

export async function transcribe(file, { model = 'base', language = '', onStatus = () => {} } = {}) {
  onStatus('소리를 읽는 중입니다.', null);
  const audio = await decodeAudio(file);
  const dur = audio.length / 16000;
  if (dur < 0.5) throw new Error('소리가 너무 짧습니다. 1초 넘는 파일을 고르세요.');
  onStatus('음성 인식 모델을 받는 중입니다.', 0);
  const { asr, tf } = await load(model, onStatus);
  const windows = dur <= CHUNK ? 1 : Math.ceil((dur - CHUNK) / (CHUNK - 2 * STRIDE)) + 1;
  let done = 0;
  onStatus(`받아 적는 중입니다. 0 / ${windows}`, 0);
  const streamer = new tf.WhisperTextStreamer(asr.tokenizer, {
    skip_prompt: true,
    on_finalize: () => { done++; onStatus(`받아 적는 중입니다. ${Math.min(done, windows)} / ${windows}`, done / windows); },
  });
  const out = await asr(audio, {
    language: language || null,
    task: 'transcribe',
    return_timestamps: 'word',
    chunk_length_s: CHUNK,
    stride_length_s: STRIDE,
    streamer,
  });
  const words = (out.chunks || []).map((w) => ({ start: w.timestamp[0] ?? 0, end: Math.min(w.timestamp[1] ?? dur, dur), text: w.text }));
  return toCues(words);
}

// Group words into cues: break on sentence ends, pauses, and length.
export function toCues(words) {
  const cues = [];
  let cur = null;
  for (const w of words) {
    if (!w.text.trim()) continue;
    if (cur) {
      const text = cur.text.trim();
      const cjk = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(text);
      const full = text.length >= (cjk ? 24 : 42) || w.end - cur.start > 6;
      if (w.start - cur.end > 0.6 || /[.?!。？！]$/.test(text) || full) { cues.push(cur); cur = null; }
    }
    if (!cur) cur = { start: w.start, end: w.end, text: '' };
    cur.text += w.text;
    cur.end = w.end;
  }
  if (cur) cues.push(cur);
  // fold a short tail ("time.") back into the cue it was cut from
  for (let i = cues.length - 1; i > 0; i--) {
    const a = cues[i - 1], b = cues[i];
    if (b.text.trim().length < 10 && !/[.?!。？！]$/.test(a.text.trim()) && b.start - a.end < 0.3) {
      a.text += b.text; a.end = b.end; cues.splice(i, 1);
    }
  }
  return cues
    .map((c) => ({ ...c, text: clean(c.text) }))
    .filter((c) => c.text && c.end > c.start && c.text.length / Math.max(c.end - c.start, 0.3) < 40);
}

// Whisper sometimes loops on noise ("one, two, three! one, two, three! ..."); keep a single copy of the phrase
const clean = (s) => s.trim().replace(/(.{4,}?)(?:\s*\1){2,}/g, '$1');
