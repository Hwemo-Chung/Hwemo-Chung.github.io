import { $, fileInput, status, progress, download, baseName } from '../common/tool.js';

const MB = 'https://cdn.jsdelivr.net/npm/mediabunny@1.61.5/+esm';
const WIN = 0.01; // envelope resolution, seconds
const statusEl = $('#status');
const bar = $('#bar');
const tl = $('#tl');
const state = { file: null, env: null, dur: 0, hasVideo: false, cuts: [], keeps: [], busy: false, media: null };
let mb = null;

fileInput($('#drop'), $('#file'), (files, err) => {
  if (err) return status(statusEl, err.message, true);
  open(files[0]);
});
$('#pick').addEventListener('click', () => $('#file').click());
for (const [id, out, f] of [['#th', '#thOut', (v) => `${v} dB`], ['#min', '#minOut', (v) => `${v}초`], ['#pad', '#padOut', (v) => `${v}초`]]) {
  $(id).addEventListener('input', (e) => { $(out).value = f(e.target.value); plan(); });
}
$('#export').addEventListener('click', exportCut);
$('#csv').addEventListener('click', () => download(csv(), `${baseName(state.file)}-컷목록.csv`));
tl.addEventListener('click', (e) => {
  if (!state.media) return;
  const r = tl.getBoundingClientRect();
  state.media.currentTime = ((e.clientX - r.left) / r.width) * state.dur;
});

async function open(file) {
  if (state.busy) return;
  state.busy = true;
  $('#export').disabled = $('#csv').disabled = true;
  status(statusEl, '소리를 분석하는 중입니다.');
  progress(bar, 0);
  try {
    mb ||= await import(MB);
    const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
    const at = await input.getPrimaryAudioTrack();
    if (!at) throw new Error('이 파일에는 소리 트랙이 없습니다. 소리가 있는 파일을 올려 주세요.');
    if (!(await at.canDecode())) throw new Error('이 브라우저가 이 파일의 소리 형식을 읽지 못합니다. Chrome이나 Edge에서 열거나 MP4로 바꿔서 올려 주세요.');
    const vt = await input.getPrimaryVideoTrack();
    const dur = await input.computeDuration();
    if (dur > 3600) throw new Error('1시간이 넘는 파일은 나눠서 올려 주세요.');
    const env = new Float32Array(Math.ceil(dur / WIN)).fill(-100);
    for await (const { buffer, timestamp } of new mb.AudioBufferSink(at).buffers()) {
      const sr = buffer.sampleRate, hop = Math.round(sr * WIN);
      const chs = [...Array(buffer.numberOfChannels)].map((_, c) => buffer.getChannelData(c));
      const first = Math.round((timestamp * sr) / hop);
      for (let s = 0; s < buffer.length; s += hop) {
        let sum = 0;
        const e = Math.min(buffer.length, s + hop);
        for (const ch of chs) for (let i = s; i < e; i++) sum += ch[i] * ch[i];
        const k = first + s / hop;
        if (k >= 0 && k < env.length) env[k] = 10 * Math.log10(sum / ((e - s) * chs.length) + 1e-10);
      }
      progress(bar, timestamp / dur);
    }
    Object.assign(state, { file, env, dur, hasVideo: !!vt, top: env.reduce((a, v) => Math.max(a, v), -70) });
    autoThreshold();
    showMedia(file, !!vt);
    $('#drop').hidden = true;
    $('#view').hidden = false;
    $('#info').textContent = `${file.name} · ${vt ? `${vt.displayWidth}×${vt.displayHeight}` : '소리만'}`;
    status(statusEl, '');
    plan();
  } catch (e) {
    status(statusEl, /[요다]\.$/.test(e.message) ? e.message : `파일을 읽지 못했습니다: ${e.message}`, true);
  } finally {
    state.busy = false;
    $('#export').disabled = !state.keeps.length;
    progress(bar, null);
  }
}

// Start the threshold between the background floor and speech level of this file.
function autoThreshold() {
  const s = Float32Array.from(state.env.filter((v) => v > -99)).sort();
  if (!s.length) return;
  const floor = s[Math.floor(s.length * 0.1)], speech = s[Math.floor(s.length * 0.9)];
  const th = Math.round(Math.max(-60, Math.min(-20, floor + (speech - floor) * 0.3)));
  $('#th').value = th;
  $('#thOut').value = `${th} dB`;
  $('#noise').textContent = `이 파일의 배경 소리는 약 ${Math.round(floor)} dB, 말소리는 약 ${Math.round(speech)} dB입니다.`;
}

function showMedia(file, video) {
  const el = video ? $('#video') : $('#audio');
  $('#video').hidden = !video;
  $('#audio').hidden = video;
  if (state.media?.src) URL.revokeObjectURL(state.media.src);
  if (state.media && state.media !== el) state.media.removeAttribute('src');
  el.src = URL.createObjectURL(file);
  state.media = el;
  el.onplay = () => requestAnimationFrame(tick);
  el.ontimeupdate = draw;
}

function tick() {
  const m = state.media;
  if ($('#skip').checked) {
    const c = state.cuts.find(([a, b]) => m.currentTime >= a && m.currentTime < b - 0.01);
    if (c) m.currentTime = c[1];
  }
  draw();
  if (!m.paused) requestAnimationFrame(tick);
}

function plan() {
  if (!state.env) return;
  const th = +$('#th').value, min = +$('#min').value, pad = +$('#pad').value;
  const env = state.env, dur = state.dur;
  const cuts = [];
  for (let i = 0; i < env.length;) {
    if (env[i] >= th) { i++; continue; }
    let j = i;
    while (j < env.length && env[j] < th) j++;
    if ((j - i) * WIN >= min) {
      const a = i === 0 ? 0 : i * WIN + pad;
      const b = j >= env.length ? dur : j * WIN - pad;
      if (b - a > 0.05) cuts.push([a, Math.min(b, dur)]);
    }
    i = j;
  }
  const keeps = [];
  let t = 0;
  for (const [a, b] of cuts) { if (a > t) keeps.push([t, a]); t = b; }
  if (t < dur) keeps.push([t, dur]);
  state.cuts = cuts;
  state.keeps = keeps;
  const kept = keeps.reduce((s, [a, b]) => s + b - a, 0);
  $('#sIn').textContent = clock(dur);
  $('#sOut').textContent = `${clock(kept)} (-${Math.round((1 - kept / dur) * 100)}%)`;
  $('#sCuts').textContent = `${cuts.length}곳`;
  $('#export').disabled = !keeps.length || state.busy;
  $('#csv').disabled = !cuts.length;
  draw();
}

function draw() {
  if (!state.env) return;
  const g = tl.getContext('2d');
  const css = getComputedStyle(document.body);
  const W = tl.width, H = tl.height, env = state.env, dur = state.dur;
  g.clearRect(0, 0, W, H);
  g.fillStyle = css.getPropertyValue('--error-soft');
  for (const [a, b] of state.cuts) g.fillRect((a / dur) * W, 0, Math.max(1, ((b - a) / dur) * W), H);
  const per = env.length / W;
  const y = (db) => ((Math.max(-70, db) + 70) / (state.top + 70 || 1)) * (H - 8);
  let ci = 0;
  for (let x = 0; x < W; x++) {
    let m = -100;
    for (let k = Math.floor(x * per); k < Math.min(env.length, Math.floor((x + 1) * per) + 1); k++) m = Math.max(m, env[k]);
    const t = ((x + 0.5) / W) * dur;
    while (ci < state.cuts.length && state.cuts[ci][1] <= t) ci++;
    const cut = ci < state.cuts.length && state.cuts[ci][0] <= t;
    const h = Math.max(2, y(m));
    g.fillStyle = css.getPropertyValue(cut ? '--line-strong' : '--ink');
    g.fillRect(x, (H - h) / 2, 1, h);
  }
  const th = +$('#th').value;
  const ty = y(th);
  g.fillStyle = css.getPropertyValue('--link');
  g.fillRect(0, (H - ty) / 2, W, 1);
  g.fillRect(0, (H + ty) / 2, W, 1);
  if (state.media) {
    g.fillStyle = css.getPropertyValue('--ink');
    g.fillRect((state.media.currentTime / dur) * W - 1, 0, 2, H);
  }
}

async function exportCut() {
  if (state.busy || !state.keeps.length) return;
  if (!('AudioEncoder' in window) || (state.hasVideo && !('VideoEncoder' in window))) {
    return status(statusEl, '이 브라우저는 영상 인코딩을 지원하지 않습니다. Chrome이나 Edge 최신 버전에서 열어 주세요.', true);
  }
  state.busy = true;
  state.media.pause();
  $('#export').disabled = true;
  progress(bar, 0);
  status(statusEl, '자르는 중입니다.');
  const keeps = state.keeps.slice();
  const total = keeps.reduce((s, [a, b]) => s + b - a, 0);
  try {
    const input = new mb.Input({ source: new mb.BlobSource(state.file), formats: mb.ALL_FORMATS });
    const at = await input.getPrimaryAudioTrack();
    const vt = state.hasVideo ? await input.getPrimaryVideoTrack() : null;
    const sr = at.sampleRate, nch = Math.min(2, at.numberOfChannels);
    const output = new mb.Output({
      format: vt ? new mb.Mp4OutputFormat({ fastStart: 'in-memory' }) : new mb.WavOutputFormat(),
      target: new mb.BufferTarget(),
    });

    let vsrc = null;
    if (vt) {
      const vcodec = await mb.getFirstEncodableVideoCodec(['avc', 'vp9', 'av1'], { width: vt.codedWidth, height: vt.codedHeight });
      if (!vcodec) throw new Error('codec');
      vsrc = new mb.VideoSampleSource({ codec: vcodec, quality: new mb.Quality('high') });
      output.addVideoTrack(vsrc, { rotation: vt.rotation });
    }
    let acfg = { codec: 'pcm-s16' };
    if (vt) {
      const ok = await mb.getFirstEncodableAudioCodec(['aac', 'opus'], { numberOfChannels: nch, sampleRate: sr });
      const alt = ok ? null : await mb.getFirstEncodableAudioCodec(['aac', 'opus'], { numberOfChannels: nch, sampleRate: 48000 });
      if (!ok && !alt) throw new Error('codec');
      acfg = { codec: ok || alt, quality: new mb.Quality('high'), ...(ok ? {} : { transform: { sampleRate: 48000 } }) };
    }
    const asrc = new mb.AudioBufferSource(acfg);
    output.addAudioTrack(asrc);
    await output.start();

    // Audio: each kept range copied sample-exact, with 5 ms fades so cuts do not click.
    const asink = new mb.AudioBufferSink(at);
    const fade = Math.round(sr * 0.005);
    for (const [s, e] of keeps) {
      const n = Math.round((e - s) * sr);
      const out = [...Array(nch)].map(() => new Float32Array(n));
      for await (const { buffer, timestamp } of asink.buffers(s, e)) {
        const off = Math.round((timestamp - s) * sr);
        for (let c = 0; c < nch; c++) {
          const d = buffer.getChannelData(Math.min(c, buffer.numberOfChannels - 1));
          const i0 = Math.max(0, -off), i1 = Math.min(d.length, n - off);
          if (i1 > i0) out[c].set(d.subarray(i0, i1), off + i0);
        }
      }
      for (const ch of out) for (let i = 0; i < Math.min(fade, n / 2); i++) { const k = i / fade; ch[i] *= k; ch[n - 1 - i] *= k; }
      const ab = new AudioBuffer({ numberOfChannels: nch, length: Math.max(1, n), sampleRate: sr });
      out.forEach((ch, c) => ab.copyToChannel(ch, c));
      await asrc.add(ab);
    }
    asrc.close();

    if (vt) {
      const vsink = new mb.VideoSampleSink(vt);
      const fps = (await vt.computePacketStats(120)).averagePacketRate || 30;
      let offset = 0, last = -1;
      for (const [s, e] of keeps) {
        for await (const smp of vsink.samples(s, e)) {
          const a = Math.max(smp.timestamp, s), b = Math.min(smp.timestamp + smp.duration, e);
          const t = Math.round((a - s + offset) * fps) / fps; // keep frames on the source frame grid
          if (b - a >= smp.duration * 0.5 && t > last + 0.5 / fps) { // skip slivers left at cut edges
            smp.setTimestamp(t);
            smp.setDuration(1 / fps);
            await vsrc.add(smp);
            last = t;
          }
          smp.close();
          progress(bar, t / total);
          status(statusEl, `자르는 중 ${Math.round((t / total) * 100)}%`);
        }
        offset += e - s;
      }
      vsrc.close();
    }
    await output.finalize();
    const blob = new Blob([output.target.buffer], { type: vt ? 'video/mp4' : 'audio/wav' });
    download(blob, `${baseName(state.file)}-무음컷.${vt ? 'mp4' : 'wav'}`);
    status(statusEl, `받았습니다 · ${clock(total)} · ${(blob.size / 1048576).toFixed(1)} MB`);
  } catch (e) {
    status(statusEl, e.message === 'codec'
      ? '이 브라우저에서 쓸 수 있는 코덱이 없습니다. Chrome이나 Edge 최신 버전에서 열어 주세요.'
      : `자르지 못했습니다: ${e.message}`, true);
  } finally {
    state.busy = false;
    $('#export').disabled = false;
    progress(bar, null);
  }
}

function csv() {
  const tc = (s) => {
    const ms = Math.round(s * 1000);
    const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
  };
  const rows = [['번호', '시작', '끝', '시작(초)', '끝(초)', '길이(초)']];
  state.cuts.forEach(([a, b], i) => rows.push([i + 1, tc(a), tc(b), a.toFixed(3), b.toFixed(3), (b - a).toFixed(3)]));
  return new Blob(['\ufeff' + rows.map((r) => r.join(',')).join('\r\n') + '\r\n'], { type: 'text/csv' });
}

const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
