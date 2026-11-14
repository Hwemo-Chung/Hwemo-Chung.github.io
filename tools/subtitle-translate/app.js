import { $, fileInput, status, progress, download, baseName } from '../common/tool.js';
import { parseSubs, toSrt, toVtt, fmtTime } from './subs.js';

const TF = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1/dist/transformers.min.js';
const NLLB = 'Xenova/nllb-200-distilled-600M';
const LANGS = [
  ['ko', '한국어', 'kor_Hang'], ['en', 'English', 'eng_Latn'], ['ja', '日本語', 'jpn_Jpan'],
  ['zh', '中文 (简体)', 'zho_Hans'], ['zh-Hant', '中文 (繁體)', 'zho_Hant'], ['es', 'Español', 'spa_Latn'],
  ['fr', 'Français', 'fra_Latn'], ['de', 'Deutsch', 'deu_Latn'], ['pt', 'Português', 'por_Latn'],
  ['vi', 'Tiếng Việt', 'vie_Latn'], ['th', 'ไทย', 'tha_Thai'], ['id', 'Bahasa Indonesia', 'ind_Latn'], ['ru', 'Русский', 'rus_Cyrl'],
];
const nllbCode = Object.fromEntries(LANGS.map((l) => [l[0], l[2]]));

const S = { file: null, cues: [], busy: false };
const statusEl = $('#status');
const tbody = $('#cues tbody');

for (const id of ['from', 'to']) $('#' + id).append(...LANGS.map(([v, label]) => new Option(label, v)));
$('#from').value = 'en';
$('#to').value = 'ko';
$('#engine').textContent = 'Translator' in self
  ? 'Chrome에 들어 있는 번역기를 씁니다.'
  : '처음 한 번 번역 모델(약 900 MB)을 받습니다. Chrome 138 이상에서는 내장 번역기로 더 빨리 번역합니다.';

fileInput($('#drop'), $('#file'), async (files, err) => {
  if (err) return status(statusEl, err.message, true);
  const f = files[0];
  const cues = parseSubs(await f.text());
  if (!cues.length) return status(statusEl, '자막 줄을 찾지 못했습니다. SRT나 VTT 파일인지 확인하세요.', true);
  S.file = f;
  S.cues = cues.map((c) => ({ ...c, out: '' }));
  $('#from').value = guess(cues.map((c) => c.text).join(' '));
  if ($('#from').value === $('#to').value) $('#to').value = $('#from').value === 'ko' ? 'en' : 'ko';
  $('#fileName').textContent = `${f.name} · ${cues.length}줄`;
  $('#drop').hidden = true;
  $('#info').hidden = false;
  $('#run').disabled = false;
  status(statusEl, '');
  render();
});
$('#other').onclick = () => $('#file').click();

function guess(text) {
  const n = (re) => (text.match(re) || []).length;
  const ko = n(/[\uac00-\ud7af]/g), ja = n(/[\u3040-\u30ff]/g), han = n(/[\u4e00-\u9fff]/g), latin = n(/[a-z]/gi);
  if (ko > latin / 4 && ko >= ja) return 'ko';
  if (ja > 10) return 'ja';
  if (han > latin / 4) return 'zh';
  return 'en';
}

async function chromeEngine(from, to) {
  if (!('Translator' in self)) return null;
  try {
    if ((await Translator.availability({ sourceLanguage: from, targetLanguage: to })) === 'unavailable') return null;
    const t = await Translator.create({
      sourceLanguage: from, targetLanguage: to,
      monitor(m) { m.addEventListener('downloadprogress', (e) => { status(statusEl, 'Chrome 번역 언어팩을 받는 중입니다.'); progress($('#bar'), e.loaded); }); },
    });
    return { name: 'Chrome 내장 번역기', run: (s) => t.translate(s) };
  } catch (e) {
    console.warn(e);
    return null;
  }
}

let nllb = null;
async function nllbEngine(from, to) {
  if (!nllb) {
    status(statusEl, '번역 모델을 받는 중입니다.');
    progress($('#bar'), 0);
    const tf = await import(TF);
    nllb = await tf.pipeline('translation', NLLB, {
      dtype: 'q8',
      progress_callback: (p) => {
        if (p.status === 'progress_total' && p.total > 1e6) {
          status(statusEl, `번역 모델을 받는 중입니다. ${(p.loaded / 1e6).toFixed(0)} / ${(p.total / 1e6).toFixed(0)} MB`);
          progress($('#bar'), p.loaded / p.total);
        }
      },
    });
  }
  return { name: 'NLLB-200 번역 모델', run: async (s) => (await nllb(s, { src_lang: nllbCode[from], tgt_lang: nllbCode[to] }))[0].translation_text };
}

$('#run').onclick = async () => {
  const from = $('#from').value, to = $('#to').value;
  if (from === to) return status(statusEl, '원래 언어와 다른 언어를 고르세요.', true);
  if (S.busy) return;
  S.busy = true;
  $('#run').disabled = true;
  try {
    const engine = (await chromeEngine(from, to)) || (await nllbEngine(from, to));
    for (let i = 0; i < S.cues.length; i++) {
      const c = S.cues[i];
      c.out = (await engine.run(c.text.replace(/\s*\n\s*/g, ' '))).trim();
      const ta = tbody.rows[i]?.querySelector('textarea');
      if (ta) ta.value = c.out;
      status(statusEl, `번역하는 중입니다. ${i + 1} / ${S.cues.length}`);
      progress($('#bar'), (i + 1) / S.cues.length);
    }
    status(statusEl, `${S.cues.length}줄을 ${engine.name}로 옮겼습니다. 어색한 줄은 표에서 고치세요.`);
  } catch (e) {
    console.error(e);
    status(statusEl, '번역하지 못했습니다. 네트워크를 확인하고 최신 Chrome이나 Edge에서 다시 하세요.', true);
  } finally {
    S.busy = false;
    $('#run').disabled = false;
    progress($('#bar'), null);
    render();
  }
};

function render() {
  $('#cues').hidden = !S.cues.length;
  $('#srt').disabled = $('#vtt').disabled = !S.cues.some((c) => c.out);
  tbody.replaceChildren(...S.cues.map((c, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td class="tm meta"></td><td class="tm meta"></td><td class="src"></td><td><textarea rows="1"></textarea></td>';
    tr.cells[0].textContent = i + 1;
    tr.cells[1].textContent = fmtTime(c.start).slice(0, 8);
    tr.cells[2].textContent = c.text;
    const ta = tr.querySelector('textarea');
    ta.value = c.out;
    ta.oninput = () => { c.out = ta.value; $('#srt').disabled = $('#vtt').disabled = false; };
    return tr;
  }));
}

const outCues = () => S.cues.map((c) => ({ start: c.start, end: c.end, text: c.out || c.text }));
const name = (ext) => `${baseName(S.file)}.${$('#to').value}.${ext}`;
$('#srt').onclick = () => download(new Blob([toSrt(outCues())], { type: 'application/x-subrip' }), name('srt'));
$('#vtt').onclick = () => download(new Blob([toVtt(outCues())], { type: 'text/vtt' }), name('vtt'));
