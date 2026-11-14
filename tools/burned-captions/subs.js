// SRT / WebVTT parsing and writing. Cues are { start, end, text } in seconds.
const TIME = /(?:(\d+):)?(\d{1,2}):(\d{1,2})[,.](\d{1,3})/;

export function parseTime(s) {
  const m = TIME.exec(s);
  if (!m) return NaN;
  return (+(m[1] || 0)) * 3600 + +m[2] * 60 + +m[3] + +m[4].padEnd(3, '0') / 1000;
}

export function parseSubs(text) {
  const cues = [];
  for (const block of text.replace(/^\uFEFF/, '').replace(/\r/g, '').split(/\n{2,}/)) {
    const lines = block.split('\n');
    const i = lines.findIndex((l) => l.includes('-->'));
    if (i === -1) continue;
    const [a, b] = lines[i].split('-->');
    const start = parseTime(a), end = parseTime(b);
    const body = lines.slice(i + 1).join('\n').trim();
    if (Number.isFinite(start) && Number.isFinite(end) && body) cues.push({ start, end, text: body });
  }
  return cues;
}

export function fmtTime(t, sep = ',') {
  const ms = Math.max(0, Math.round(t * 1000));
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)}${sep}${p(ms % 1000, 3)}`;
}

export const toSrt = (cues) => cues.map((c, i) => `${i + 1}\n${fmtTime(c.start)} --> ${fmtTime(c.end)}\n${c.text}\n`).join('\n');
export const toVtt = (cues) => `WEBVTT\n\n${cues.map((c) => `${fmtTime(c.start, '.')} --> ${fmtTime(c.end, '.')}\n${c.text}\n`).join('\n')}`;

