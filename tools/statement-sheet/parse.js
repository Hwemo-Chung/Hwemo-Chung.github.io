// Turns positioned PDF text or spreadsheet rows into bank transactions.
// Rows: { date: 'YYYY-MM-DD', time: 'HH:MM:SS' | '', desc, out, in, bal, memo }

const NUM_ROLES = new Set(['out', 'in', 'amt', 'bal']);
const PARTY = /입금자|보낸분|받는분|의뢰인|상대|payee/i;
const ROLES = [
  ['bal', /잔액|잔고|balance/i],
  ['out', /출금|찾으신|지급|인출|withdraw|debit/i],
  ['in', /입금|맡기신|deposit|credit/i],
  ['amt', /금액|amount/i],
  ['kind', /구분|유형|입출|type/i],
  ['date', /일시|일자|날짜|거래일|date/i],
  ['time', /시간|시각|time/i],
  ['memo', /메모|비고|memo|remark|note/i],
  ['desc', /적요|내용|기록|거래처|가맹점|사용처|description|detail|particular|narration|transaction/i],
];
const MONTHS = 'jan feb mar apr may jun jul aug sep oct nov dec'.split(' ');

export function roleOf(text) {
  const t = String(text).replace(/\s|\(.*?\)|\[.*?\]/g, '');
  if (!t || t.length > 20 || /\d{3}/.test(t)) return null;
  if (PARTY.test(t)) return 'desc';
  for (const [role, re] of ROLES) if (re.test(t)) return role;
  return 'other';
}

function isHeader(roles) {
  return roles.filter(Boolean).length >= 3 && roles.includes('date') && roles.some((r) => NUM_ROLES.has(r));
}

export function num(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let t = String(v ?? '').replace(/\u2212/g, '-').replace(/[,\s원₩$€£]|KRW|USD/g, '');
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  if (/^[+-]/.test(t)) { neg = t[0] === '-'; t = t.slice(1); }
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  return neg ? -t : +t;
}

const pad = (n) => String(n).padStart(2, '0');

export function parseDate(v, year) {
  if (v instanceof Date) {
    if (isNaN(v)) return null;
    const time = v.getHours() || v.getMinutes() || v.getSeconds() ? `${pad(v.getHours())}:${pad(v.getMinutes())}:${pad(v.getSeconds())}` : '';
    return { date: `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`, time };
  }
  const t = String(v ?? '');
  let y, mo, d, m;
  if ((m = t.match(/(\d{4}|\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/)) && m[1].length === 4 || (m && +m[1] > 12)) {
    [y, mo, d] = [+m[1], +m[2], +m[3]];
  } else if ((m = t.match(/\b(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})\b/))) {
    [y, mo, d] = +m[1] > 12 ? [+m[3], +m[2], +m[1]] : [+m[3], +m[1], +m[2]];
  } else if ((m = t.match(/\b(20\d{2})(\d{2})(\d{2})\b/))) {
    [y, mo, d] = [+m[1], +m[2], +m[3]];
  } else if ((m = t.match(/\b(\d{1,2})[\s-]*([A-Za-z]{3})[a-z]*\.?[\s,-]*(\d{4})?/)) && MONTHS.includes(m[2].toLowerCase())) {
    [y, mo, d] = [+(m[3] || year), MONTHS.indexOf(m[2].toLowerCase()) + 1, +m[1]];
  } else if ((m = t.match(/\b([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s*(\d{4})?/)) && MONTHS.includes(m[1].toLowerCase())) {
    [y, mo, d] = [+(m[3] || year), MONTHS.indexOf(m[1].toLowerCase()) + 1, +m[2]];
  } else if (year && (m = t.match(/^\s*(\d{1,2})[.\-/](\d{1,2})(?!\d|[.,])/))) {
    [y, mo, d] = [year, +m[1], +m[2]];
  } else return null;
  if (y < 100) y += 2000;
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const tm = t.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  return { date: `${y}-${pad(mo)}-${pad(d)}`, time: tm ? `${pad(tm[1])}:${tm[2]}:${tm[3] || '00'}` : '' };
}

const isNumCell = (s) => num(s) !== null && !parseDate(s);

// ---------- PDF ----------

function toCells(items) {
  const parts = [];
  for (const it of [...items].sort((a, b) => a.x - b.x)) {
    const cw = it.w / Math.max(1, it.str.length);
    const re = /\S+(?:\s\S+)*/g; // runs of 2+ spaces split one text item into separate cells
    let m;
    while ((m = re.exec(it.str))) parts.push({ str: m[0], x: it.x + m.index * cw, w: m[0].length * cw, h: it.h });
  }
  parts.sort((a, b) => a.x - b.x);
  const cells = [];
  for (const p of parts) {
    const c = cells.at(-1);
    const gap = c ? p.x - (c.x + c.w) : Infinity;
    if (gap < 0.5 * p.h) {
      c.str += (gap > 0.15 * p.h ? ' ' : '') + p.str;
      c.w = Math.max(c.w, p.x + p.w - c.x);
    } else cells.push({ ...p });
  }
  return cells;
}

function toLines(items) {
  const lines = [];
  for (const it of items.filter((i) => i.str.trim()).sort((a, b) => a.y - b.y || a.x - b.x)) {
    const l = lines.at(-1);
    if (l && Math.abs(it.y - l.y) < Math.max(2, 0.4 * Math.min(it.h, l.h))) l.items.push(it);
    else lines.push({ y: it.y, h: it.h, items: [it] });
  }
  for (const l of lines) l.cells = toCells(l.items);
  return lines;
}

function overlap(cell, col) {
  return Math.min(cell.x + cell.w, col.x1) - Math.max(cell.x, col.x0);
}

function assign(cell, cols, strict) {
  const numeric = isNumCell(cell.str);
  const pool = cols.filter((k) => NUM_ROLES.has(k.role) === numeric);
  const byOverlap = (list) => list.reduce((b, k) => (overlap(cell, k) > (b ? overlap(cell, b) : 0) ? k : b), null);
  const hit = byOverlap(pool) || (!strict && byOverlap(cols));
  if (hit) return hit;
  const c = cell.x + cell.w / 2;
  return (pool.length ? pool : cols).reduce((b, k) => (Math.abs((k.x0 + k.x1) / 2 - c) < Math.abs((b.x0 + b.x1) / 2 - c) ? k : b));
}

// pdf.js joins runs that sit close on one line ("2025.08.13 14:44:42 김민수"), so a cell
// that reaches across columns is cut into words placed by estimated glyph width.
function place(cell, cols) {
  if (!/\s/.test(cell.str) || cols.filter((k) => overlap(cell, k) > 0).length < 2) return [{ col: assign(cell, cols), s: cell.str }];
  const wide = (ch) => (/[\u1100-\u11ff\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]/.test(ch) ? 1 : ch === ' ' ? 0.3 : 0.55);
  const unit = cell.w / [...cell.str].reduce((s, ch) => s + wide(ch), 0);
  const out = [];
  let x = cell.x;
  for (const word of cell.str.split(/(\s+)/)) {
    const w = [...word].reduce((s, ch) => s + wide(ch), 0) * unit;
    if (word.trim()) {
      const isWhen = /^\d{1,2}:\d{2}(:\d{2})?$/.test(word) || parseDate(word);
      const col = (isWhen && (cols.find((k) => k.role === 'date') || cols.find((k) => k.role === 'time'))) || assign({ str: word, x, w }, cols, true);
      const last = out.at(-1);
      if (last && last.col === col) last.s += ` ${word}`;
      else out.push({ col, s: word });
    }
    x += w;
  }
  return out;
}

// Header-less PDFs: columns come from cells that line up under each other on date rows.
function inferCols(pages, year) {
  const kindOf = (s) => (parseDate(s, year) ? 'date' : /^\d{1,2}:\d{2}(:\d{2})?$/.test(s) ? 'time' : isNumCell(s) ? 'num' : 'text');
  const rows = pages.flatMap((p) => toLines(p.items)).filter((l) => l.cells.slice(0, 3).some((c) => kindOf(c.str) === 'date') && l.cells.filter((c) => kindOf(c.str) === 'num').length >= 2);
  if (rows.length < 2) return null;
  const groups = [];
  for (const l of rows) {
    for (const c of l.cells) {
      const kind = kindOf(c.str);
      const edge = kind === 'num' ? c.x + c.w : kind === 'text' ? c.x : c.x + c.w / 2;
      let g = groups.find((k) => k.kind === kind && Math.abs(k.edge - edge) < 4);
      if (!g) groups.push(g = { kind, edge, x0: c.x, x1: c.x + c.w, n: 0 });
      g.x0 = Math.min(g.x0, c.x); g.x1 = Math.max(g.x1, c.x + c.w); g.n++;
    }
  }
  const cols = groups.filter((g) => g.n >= rows.length * 0.1).sort((a, b) => a.x0 - b.x0);
  const nums = cols.filter((g) => g.kind === 'num');
  if (!nums.length) return null;
  nums.at(-1).role = 'bal';
  const rest = nums.slice(0, -1).slice(-2);
  if (rest.length === 2) [rest[0].role, rest[1].role] = ['out', 'in'];
  else if (rest.length === 1) rest[0].role = 'amt';
  for (const g of cols) {
    if (g.kind === 'date' || g.kind === 'time') g.role = g.kind;
    else if (g.kind === 'text') g.role = 'desc';
  }
  return cols.map((g, i) => ({ key: i, role: g.role || 'other', x0: g.x0, x1: g.x1 }));
}

export function fromPdf(pages) {
  const year = +(pages.flatMap((p) => p.items.map((i) => i.str)).join(' ').match(/\b20\d{2}\b/) || [])[0] || undefined;
  let fixed = null;
  let rows = extract(pages, null, year);
  if (!rows.length && (fixed = inferCols(pages, year))) rows = extract(pages, fixed, year);
  return finalize(rows);
}

function extract(pages, fixed, year) {
  let cols = fixed;
  const rows = [];
  for (const page of pages) {
    const lines = toLines(page.items);
    let start = 0;
    if (!fixed) {
      const hi = lines.findIndex((l) => isHeader(l.cells.map((c) => roleOf(c.str))));
      if (hi >= 0) {
        cols = lines[hi].cells.map((c, i) => ({ key: i, role: roleOf(c.str), x0: c.x, x1: c.x + c.w }));
        start = hi + 1;
      }
    }
    if (!cols) continue;
    const recs = [];
    const orphans = [];
    for (const l of lines.slice(start)) {
      const parts = l.cells.flatMap((c) => place(c, cols).map((p) => ({ ...p, y: l.y })));
      const dateText = parts.filter((p) => p.col.role === 'date' || p.col.role === 'time').map((p) => p.s).join(' ');
      const nums = parts.filter((p) => NUM_ROLES.has(p.col.role) && num(p.s) !== null);
      const item = { y: l.y, h: l.h, parts };
      if (nums.length && parseDate(dateText, year)) recs.push(item);
      else if (recs.length && nums.some((p) => p.col.role === 'bal') && nums.length >= 2 && !dateText) {
        // statements that print the date once per day
        item.parts.push(...recs.at(-1).parts.filter((p) => p.col.role === 'date' || p.col.role === 'time').map((p) => ({ ...p, y: l.y })));
        recs.push(item);
      } else if (!nums.length) orphans.push(item);
    }
    const gaps = recs.slice(1).map((r, i) => r.y - recs[i].y).filter((g) => g > 0).sort((a, b) => a - b);
    const spacing = gaps.length ? gaps[gaps.length >> 1] : 2.5 * (recs[0]?.h || 10);
    for (const o of orphans) {
      let best = null;
      for (const r of recs) if (!best || Math.abs(r.y - o.y) < Math.abs(best.y - o.y)) best = r;
      if (best && Math.abs(best.y - o.y) < 0.75 * spacing) best.parts.push(...o.parts);
    }
    for (const r of recs) rows.push(build(r.parts.sort((a, b) => a.y - b.y).map((p) => [p.col.role, p.s]), year));
  }
  return rows.filter(Boolean);
}

// ---------- spreadsheets ----------

export function fromGrid(grid) {
  const year = +(grid.slice(0, 60).flat().join(' ').match(/\b20\d{2}\b/) || [])[0] || undefined;
  const hi = grid.slice(0, 60).findIndex((r) => isHeader(r.map(roleOf)));
  if (hi < 0) return finalize([]);
  const roles = grid[hi].map(roleOf);
  const rows = [];
  for (const r of grid.slice(hi + 1)) {
    const row = build(r.map((v, i) => [roles[i], v]), year);
    if (row) rows.push(row);
  }
  return finalize(rows);
}

// ---------- shared ----------

function build(pairs, year) {
  const by = {};
  for (const [role, v] of pairs) if (role && v !== '' && v != null) (by[role] ??= []).push(v);
  const d0 = by.date?.[0];
  let when;
  if (d0 instanceof Date) {
    when = parseDate(d0);
    const tm = by.time && (by.time[0] instanceof Date ? by.time[0].toTimeString() : String(by.time[0])).match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (when && tm) when.time = `${pad(tm[1])}:${tm[2]}:${tm[3] || '00'}`;
  } else if (typeof d0 === 'number' && d0 > 20000 && d0 < 80000) {
    const dt = new Date(Math.round((d0 - 25569) * 864e5));
    when = { date: dt.toISOString().slice(0, 10), time: d0 % 1 ? dt.toISOString().slice(11, 19) : '' };
  } else {
    when = parseDate([...(by.date || []), ...(by.time || [])].join(' '), year);
  }
  if (!when) return null;
  const first = (list) => (list || []).map(num).find((v) => v !== null) ?? null;
  const row = {
    ...when,
    desc: (by.desc || []).join(' ').trim(),
    memo: (by.memo || []).join(' ').trim(),
    kind: (by.kind || []).join(' '),
    out: first(by.out), in: first(by.in), amt: first(by.amt), bal: first(by.bal),
  };
  if (row.out == null && row.in == null && row.amt == null) return null;
  return row;
}

function check(rows, order) {
  let ok = 0, n = 0;
  for (let i = 1; i < rows.length; i++) {
    const [prev, cur] = order > 0 ? [rows[i - 1], rows[i]] : [rows[i], rows[i - 1]];
    if (prev.bal == null || cur.bal == null) continue;
    n++;
    if (Math.abs(prev.bal - (cur.out || 0) + (cur.in || 0) - cur.bal) < 0.005) ok++;
  }
  return { ok, n };
}

export function finalize(rows) {
  const OUT = /출금|지급|결제|인출|찾으신|출고|debit|withdraw/i;
  const IN = /입금|맡기신|이자|credit|deposit/i;
  for (const r of rows) {
    if (r.out == null && r.in == null && r.amt != null) {
      const a = Math.abs(r.amt);
      if (OUT.test(r.kind)) r.out = a;
      else if (IN.test(r.kind)) r.in = a;
      else if (r.amt < 0) r.out = a;
      else r.in = a;
    }
    r.out = r.out ? Math.abs(r.out) : null;
    r.in = r.in ? Math.abs(r.in) : null;
    delete r.amt; delete r.kind;
  }
  const swap = (list) => list.map((r) => ({ ...r, out: r.in, in: r.out }));
  const tries = [[rows, 1], [rows, -1], [swap(rows), 1], [swap(rows), -1]].map(([list, order]) => ({ list, order, ...check(list, order) }));
  const best = tries.reduce((b, t) => (t.ok > b.ok ? t : b));
  return { rows: best.list, check: { ok: best.ok, n: best.n }, order: best.order };
}
