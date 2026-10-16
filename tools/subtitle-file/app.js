import { $, fileInput, status, progress, download, baseName } from '../common/tool.js';
import { transcribe } from './asr.js';
import { toSrt, toVtt, fmtTime, parseTime } from './subs.js';

const S = { file: null, url: '', cues: [], lang: 'korean', model: 'base', busy: false };
const statusEl = $('#status');
const tbody = $('#cues tbody');
let media = null;

for (const id of ['lang', 'model']) {
  $('#' + id).addEventListener('click', (e) => {
    const v = e.target.dataset.v;
    if (v === undefined) return;
    S[id] = v;
    for (const b of $('#' + id).children) b.setAttribute('aria-pressed', String(b.dataset.v === v));
  });
}

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
  S.cues = [];
  const isAudio = file.type.startsWith('audio/') || /\.(mp3|m4a|wav|ogg|flac)$/i.test(file.name);
  media = document.createElement(isAudio ? 'audio' : 'video');
  Object.assign(media, { src: S.url, controls: true, preload: 'metadata', playsInline: true });
  media.addEventListener('timeupdate', sync);
  media.addEventListener('error', () => status(statusEl, '이 브라우저가 이 파일을 재생하지 못합니다. 자막은 그대로 만들 수 있습니다.', true), { once: true });
  $('#media').replaceChildren(media);
  $('#fileName').textContent = file.name;
  $('#drop').hidden = true;
  $('#player').hidden = false;
  $('#run').disabled = false;
  status(statusEl, '');
  render();
}

$('#run').onclick = async () => {
  if (S.busy || !S.file) return;
  S.busy = true;
  $('#run').disabled = true;
  try {
    S.cues = await transcribe(S.file, {
      model: S.model,
      language: S.lang,
      onStatus: (text, ratio) => { status(statusEl, text); progress($('#bar'), ratio); },
    });
    render();
    status(statusEl, S.cues.length ? `자막 ${S.cues.length}줄을 만들었습니다. 고칠 곳은 표에서 바로 고치세요.` : '말소리를 찾지 못했습니다. 언어 설정을 확인하세요.', !S.cues.length);
  } catch (e) {
    console.error(e);
    status(statusEl, e.message.startsWith('소리') ? e.message : '받아 적지 못했습니다. 네트워크를 확인하고 최신 Chrome이나 Edge에서 다시 하세요.', true);
  } finally {
    S.busy = false;
    $('#run').disabled = false;
    progress($('#bar'), null);
  }
};

function render() {
  $('#cues').hidden = !S.cues.length;
  $('#srt').disabled = $('#vtt').disabled = !S.cues.length;
  tbody.replaceChildren(...S.cues.map((c, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td class="n"></td><td><input type="text" data-k="start"></td><td><input type="text" data-k="end"></td><td><textarea rows="1" data-k="text"></textarea></td><td><button class="btn x" type="button">지우기</button></td>';
    tr.cells[0].textContent = i + 1;
    tr.cells[0].title = '이 줄부터 재생';
    tr.querySelector('[data-k=start]').value = fmtTime(c.start);
    tr.querySelector('[data-k=end]').value = fmtTime(c.end);
    const ta = tr.querySelector('textarea');
    ta.value = c.text;
    tr.cells[0].onclick = () => { if (media) { media.currentTime = c.start; media.play(); } };
    tr.oninput = (e) => {
      const k = e.target.dataset.k;
      if (k === 'text') c.text = e.target.value;
      else { const t = parseTime(e.target.value); e.target.classList.toggle('bad', !Number.isFinite(t)); if (Number.isFinite(t)) c[k] = t; }
      sync();
    };
    tr.querySelector('.x').onclick = () => { S.cues.splice(S.cues.indexOf(c), 1); render(); };
    return tr;
  }));
  sync();
}

function sync() {
  const t = media ? media.currentTime : 0;
  const i = S.cues.findIndex((c) => t >= c.start && t < c.end);
  $('#now').textContent = i >= 0 ? S.cues[i].text : '';
  [...tbody.rows].forEach((r, j) => r.classList.toggle('on', j === i));
}

const save = (text, ext, type) => download(new Blob([text], { type }), `${baseName(S.file)}.${ext}`);
$('#srt').onclick = () => save(toSrt(S.cues), 'srt', 'application/x-subrip');
$('#vtt').onclick = () => save(toVtt(S.cues), 'vtt', 'text/vtt');
