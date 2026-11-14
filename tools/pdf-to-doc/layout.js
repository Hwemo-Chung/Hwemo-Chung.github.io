// Rebuilds reading order and structure (headings, paragraphs, lists, tables, images) from positioned PDF text.
// Item: { str, x, y (top-down baseline), w, size, bold, italic }   Image: { x0, y0, x1, y1, png, pxW, pxH }

const BULLET = /^([•●○■□◦▪▫∙·‣⁃➢➤►▶◆◇※]\s*|[–\-*]\s+)/;
const NUMBERED = /^(\(?\d{1,3}[.)]|\(\d{1,3}\)|[①-⑳]|[가-하][.)]|\(?[a-zA-Z][.)]|[ivxIVX]{1,4}[.)])\s+/;
const END = /[.!?。:;」”"')]\s*$|다\.?\s*$/;

function styleKey(it) {
  return `${it.bold ? 1 : 0}${it.italic ? 1 : 0}${Math.round(it.size * 2)}`;
}

function toLines(items) {
  const lines = [];
  for (const it of [...items].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const l = lines.at(-1);
    if (l && Math.abs(it.y - l.y) < Math.max(2, 0.45 * Math.min(it.size, l.size))) { l.items.push(it); l.size = Math.max(l.size, it.size); }
    else lines.push({ y: it.y, size: it.size, items: [it] });
  }
  return lines.map(finishLine);
}

function finishLine(l) {
  const items = l.items.sort((a, b) => a.x - b.x);
  const runs = [];
  const cells = [];
  let prev = null;
  for (const it of items) {
    const gap = prev ? it.x - (prev.x + prev.w) : 0;
    if (!prev || gap > 1.5 * it.size || /\.{3,}\s*$/.test(prev.str)) cells.push({ x0: it.x, x1: it.x + it.w, text: '', parts: [] });
    const cell = cells.at(-1);
    const space = prev && gap > 0.2 * it.size && !/\s$/.test(cell.text) && !/^\s/.test(it.str) && cell.text ? ' ' : '';
    cell.text += space + it.str;
    cell.x1 = it.x + it.w;
    cell.parts.push({ x0: it.x, x1: it.x + it.w, text: it.str });
    const r = runs.at(-1);
    const sep = prev && !space && gap > 1.5 * it.size ? ' ' : space;
    if (r && r.key === styleKey(it)) r.text += sep + it.str;
    else {
      if (r && sep) r.text += sep;
      runs.push({ key: styleKey(it), text: it.str, bold: it.bold, italic: it.italic, size: it.size });
    }
    prev = it;
  }
  const chars = (k) => runs.filter((r) => r[k]).reduce((s, r) => s + r.text.trim().length, 0);
  const total = runs.reduce((s, r) => s + r.text.trim().length, 0) || 1;
  // dominant size by characters, so a stray big bullet does not make the line a heading
  const bySize = {};
  for (const r of runs) bySize[r.size.toFixed(1)] = (bySize[r.size.toFixed(1)] || 0) + r.text.trim().length;
  const size = +Object.entries(bySize).sort((a, b) => b[1] - a[1])[0][0];
  for (const c of cells) c.text = c.text.replace(/\s+/g, ' ').trim();
  // pdf.js merges a row of figures into one item ("24.9 24.8 18.8"); give each figure its own cell
  for (let k = cells.length - 1; k >= 0; k--) {
    const c = cells[k];
    const toks = c.text.split(' ');
    if (toks.length >= 3 && toks.every((t) => /^[-+$€£₩(]?[\d.,]+[%)]?$/.test(t))) {
      const step = (c.x1 - c.x0) / toks.length;
      cells.splice(k, 1, ...toks.map((t, n) => ({ x0: c.x0 + n * step, x1: c.x0 + (n + 1) * step, text: t, parts: [] })));
    }
  }
  return {
    y: l.y, size, runs, cells,
    x0: items[0].x, x1: Math.max(...items.map((i) => i.x + i.w)),
    text: cells.map((c) => c.text).join(' '),
    bold: chars('bold') / total > 0.8, italic: chars('italic') / total > 0.8,
  };
}

// Two-column pages: an x near the middle where almost no line has text, and lines with text on
// both sides leave a wide gap there (word gaps in justified text are much narrower).
function gutter(items, W) {
  const rows = [];
  for (const it of [...items].sort((a, b) => a.y - b.y)) {
    const r = rows.at(-1);
    if (r && Math.abs(it.y - r.y) < 0.45 * Math.min(it.size, r.size)) r.items.push(it);
    else rows.push({ y: it.y, size: it.size, items: [it] });
  }
  if (rows.length < 8) return null;
  let best = null;
  for (let x = W * 0.3; x <= W * 0.7; x += 2) {
    let cross = 0, both = 0, wide = 0;
    for (const r of rows) {
      let end = -Infinity, start = Infinity, hit = false;
      for (const it of r.items) {
        if (it.x < x && it.x + it.w > x) { hit = true; break; }
        if (it.x + it.w <= x) end = Math.max(end, it.x + it.w);
        else start = Math.min(start, it.x);
      }
      if (hit) cross++;
      else if (end > -Infinity && start < Infinity) { both++; if (start - end >= 1.2 * r.size) wide++; }
    }
    if (cross <= rows.length * 0.06 && both >= Math.max(5, rows.length * 0.2) && wide >= both * 0.9 && (!best || both > best.both)) best = { x, both };
  }
  return best ? best.x : null;
}

function regions(items, images, W) {
  const gx = gutter(items, W);
  if (gx == null) return [{ items, images }];
  // page-wide lines and images cut the page into bands; inside a band, left column is read before right
  const crossing = items.filter((i) => i.x < gx - 1 && i.x + i.w > gx + 1);
  const cuts = [
    ...toLines(crossing).filter((l) => l.x1 - l.x0 > W * 0.3)
      .map((l) => ({ y: l.y, items: items.filter((i) => Math.abs(i.y - l.y) < 0.45 * Math.max(i.size, 4)), images: [] })),
    ...images.filter((im) => im.x1 - im.x0 > W * 0.5).map((im) => ({ y: im.y0, items: [], images: [im] })),
  ].sort((a, b) => a.y - b.y);
  const inCut = new Set(cuts.flatMap((c) => [...c.items, ...c.images]));
  const sideOf = (x0, x1) => ((x0 + x1) / 2 < gx ? 'L' : 'R');
  const bounds = [-Infinity, ...cuts.map((c) => c.y), Infinity];
  const out = [];
  for (let b = 0; b < bounds.length - 1; b++) {
    const inBand = (y) => y >= bounds[b] && y < bounds[b + 1];
    for (const s of ['L', 'R']) {
      const its = items.filter((i) => !inCut.has(i) && inBand(i.y) && sideOf(i.x, i.x + i.w) === s);
      const ims = images.filter((im) => !inCut.has(im) && inBand(im.y0) && sideOf(im.x0, im.x1) === s);
      if (its.length || ims.length) out.push({ items: its, images: ims });
    }
    if (b < cuts.length) out.push(cuts[b]);
  }
  return out;
}

function isPageNumber(l, H) {
  return (l.y < H * 0.08 || l.y > H * 0.92) && /^[-–—\s]*(page\s*)?\d{1,4}(\s*(\/|of)\s*\d{1,4})?[-–—\s]*$/i.test(l.text);
}

function tableFrom(rows) {
  // columns from the row with the most cells; wider cells are split word by word into the columns they cover
  const base = rows.reduce((b, r) => (r.cells.length > b.cells.length ? r : b));
  const cols = base.cells.map((c) => ({ x0: c.x0, x1: c.x1 }));
  for (const r of rows) for (const c of r.cells) {
    if (cols.filter((k) => Math.min(c.x1, k.x1) - Math.max(c.x0, k.x0) > 0).length > 1) continue;
    const k = nearestCol(cols, c);
    cols[k].x0 = Math.min(cols[k].x0, c.x0);
    cols[k].x1 = Math.max(cols[k].x1, c.x1);
  }
  const put = (out, k, text) => { out[k] = out[k] ? `${out[k]} ${text}` : text; };
  const clean = (s) => s.replace(/\s*\.{4,}\s*/g, ' ').trim();
  return rows.map((r) => {
    const out = cols.map(() => '');
    for (const c of r.cells) {
      const hit = cols.filter((k) => Math.min(c.x1, k.x1) - Math.max(c.x0, k.x0) > 0);
      if (hit.length > 1 && c.parts.length > 1) {
        // one cell over several columns: place each original text piece by its own position
        for (const p of c.parts) if (p.text.trim()) put(out, nearestCol(cols, p), p.text.trim());
      } else if (hit.length > 1 && /\s/.test(c.text)) {
        const words = c.text.split(/\s+/);
        const unit = (c.x1 - c.x0) / c.text.length;
        let pos = c.x0;
        for (const w of words) {
          put(out, nearestCol(cols, { x0: pos, x1: pos + w.length * unit }), w);
          pos += (w.length + 1) * unit;
        }
      } else put(out, nearestCol(cols, c), c.text);
    }
    return out.map(clean);
  });
}

function nearestCol(cols, c) {
  let best = 0, bestScore = -Infinity;
  cols.forEach((k, i) => {
    const ov = Math.min(c.x1, k.x1) - Math.max(c.x0, k.x0);
    const score = ov > 0 ? ov : -Math.abs((c.x0 + c.x1) / 2 - (k.x0 + k.x1) / 2);
    if (score > bestScore) { bestScore = score; best = i; }
  });
  return best;
}

function leadings(lines) {
  const by = {};
  for (let i = 1; i < lines.length; i++) {
    const a = lines[i - 1], b = lines[i], g = b.y - a.y;
    if (Math.abs(a.size - b.size) < 0.6 && g > 0 && g < 2.2 * b.size) (by[b.size.toFixed(1)] ??= []).push(g);
  }
  return (size) => {
    const list = (by[size.toFixed(1)] || []).sort((x, y) => x - y);
    return list.length ? list[list.length >> 1] : size * 1.3;
  };
}

function regionBlocks(lines, images) {
  const blocks = [];
  if (!lines.length) return images.map((im) => ({ type: 'image', y: im.y0, image: im }));
  const right = Math.max(...lines.map((l) => l.x1));
  const lead = leadings(lines);
  let i = 0;
  let cur = null;
  const push = (b) => { blocks.push(b); return b; };
  while (i < lines.length) {
    const l = lines[i];
    // table: two or more nearby lines that break into 2+ short cells; a one-cell line under a column is a wrapped cell
    if (l.cells.length >= 2) {
      const clone = (ln) => ({ ...ln, cells: ln.cells.map((c) => ({ ...c, parts: [...c.parts] })) });
      const rows = [clone(l)];
      let j = i;
      while (j + 1 < lines.length) {
        const n = lines[j + 1], gap = n.y - lines[j].y;
        if (gap > 3.2 * lines[j].size) break;
        if (n.cells.length >= 2) { rows.push(clone(n)); j++; continue; }
        const c = n.cells[0];
        const target = rows.at(-1).cells.find((k) => Math.abs(k.x0 - c.x0) < n.size);
        if (!target || gap > 2 * n.size) break;
        target.text += ` ${c.text}`;
        target.parts.push(...c.parts);
        target.x1 = Math.max(target.x1, c.x1);
        j++;
      }
      const cellCount = rows.reduce((s, r) => s + r.cells.length, 0);
      const avgLen = rows.reduce((s, r) => s + r.cells.reduce((t, c) => t + c.text.length, 0), 0) / cellCount;
      if (rows.length >= 2 && avgLen <= 40) {
        push({ type: 'table', y: l.y, rows: tableFrom(rows), size: l.size });
        cur = null;
        i = j + 1;
        continue;
      }
    }
    const prev = i > 0 ? lines[i - 1] : null;
    const marker = (l.text.match(BULLET) || l.text.match(NUMBERED) || [])[0];
    let cont = !!(cur && prev && blocks.at(-1) === cur);
    if (cont) {
      const gap = l.y - prev.y;
      const prevFull = prev.x1 >= right - 2.5 * prev.size;
      if (Math.abs(l.size - prev.size) >= 0.6 || l.bold !== prev.bold || gap > lead(l.size) * 1.35 + 0.5 || gap <= 0) cont = false;
      else if (cur.list && !(l.x0 > cur.x0 + 0.5 * l.size && !marker)) cont = false;
      else if (marker && !prevFull) cont = false;
      else if (!prevFull && END.test(prev.text) && prev.x1 < right - 4 * prev.size) cont = false;
    }
    if (cont) {
      cur.lines.push(l);
    } else {
      cur = push({ type: 'para', y: l.y, x0: l.x0, lines: [l], list: marker ? (BULLET.test(l.text) ? 'bullet' : 'number') : null });
    }
    i++;
  }
  for (const im of images) blocks.push({ type: 'image', y: im.y0, image: im });
  return blocks.sort((a, b) => a.y - b.y);
}

export function pageBlocks({ items, images, W, H }) {
  const blocks = [];
  for (const r of regions(items, images, W)) {
    const lines = toLines(r.items).filter((l) => l.text.trim() && !isPageNumber(l, H));
    blocks.push(...regionBlocks(lines, r.images));
  }
  for (const b of blocks) b.edge = b.y < H * 0.12 || b.y > H * 0.9;
  return blocks;
}

function paraRuns(p) {
  const runs = [];
  p.lines.forEach((l, n) => {
    l.runs.forEach((r, k) => {
      let text = r.text;
      if (k === 0 && n > 0) {
        const last = runs.at(-1);
        // re-join "exam-" + "ple"; otherwise a line break becomes a space
        if (last && /[A-Za-z]-$/.test(last.text) && /^[a-z]/.test(text)) last.text = last.text.slice(0, -1);
        else if (last && !/\s$/.test(last.text)) text = ` ${text}`;
      }
      const last = runs.at(-1);
      if (last && last.bold === r.bold && last.italic === r.italic && Math.abs(last.size - r.size) < 0.6) last.text += text;
      else runs.push({ text, bold: r.bold, italic: r.italic, size: r.size });
    });
  });
  if (p.list) {
    const first = runs[0];
    const m = first.text.match(p.list === 'bullet' ? BULLET : NUMBERED);
    if (m && p.list === 'bullet') first.text = first.text.slice(m[0].length);
    if (!first.text.trim()) runs.shift();
  }
  for (const r of runs) r.text = r.text.replace(/\s+/g, ' ');
  if (runs.length) { runs[0].text = runs[0].text.trimStart(); runs.at(-1).text = runs.at(-1).text.trimEnd(); }
  return runs.filter((r) => r.text);
}

// Turns per-page blocks into document blocks with heading levels and cross-page paragraph joins.
export function finishDoc(pages) {
  const chars = {};
  for (const b of pages.flat()) if (b.type === 'para') for (const l of b.lines) chars[l.size.toFixed(1)] = (chars[l.size.toFixed(1)] || 0) + l.text.length;
  const body = +(Object.entries(chars).sort((a, b) => b[1] - a[1])[0] || [11])[0];
  const isHeadingSize = (s) => s >= body * 1.1 && s - body >= 1;
  const textOf = (b) => b.lines.map((l) => l.text).join(' ');
  const sizes = [...new Set(pages.flat().filter((b) => b.type === 'para' && isHeadingSize(b.lines[0].size) && textOf(b).length < 160 && /[\p{L}\p{N}]{2}/u.test(textOf(b))).map((b) => +b.lines[0].size.toFixed(1)))].sort((a, b) => b - a);
  // sizes within 10% of each other share a level
  const levelOf = {};
  let lv = 0, top = Infinity;
  for (const s of sizes) { if (s < top * 0.9) { lv++; top = s; } levelOf[s] = Math.min(3, lv); }
  const seenEdge = new Set();
  const out = [];
  pages.forEach((blocks, pi) => {
    blocks.forEach((b, bi) => {
      if (b.type !== 'para') { out.push(b); return; }
      const text = textOf(b);
      // running headers/footers repeat on every page
      if (b.edge) { if (seenEdge.has(text)) return; seenEdge.add(text); }
      const size = +b.lines[0].size.toFixed(1);
      let level = 0;
      if (levelOf[size] && text.length < 160) level = levelOf[size];
      else if (b.lines.every((l) => l.bold) && !b.list && text.length < 90 && !END.test(text) && size >= body - 0.5) level = Math.min(3, lv + 1);
      const runs = paraRuns(level ? { ...b, list: null } : b);
      if (!runs.length) return;
      const prev = out.at(-1);
      if (bi === 0 && pi > 0 && !level && prev?.type === 'para' && !prev.level && !b.list && !prev.list
        && Math.abs(prev.size - size) < 0.6 && !END.test(prev.runs.at(-1).text)) {
        prev.runs.push(...runs.map((r, k) => (k === 0 ? { ...r, text: ` ${r.text}` } : r)));
        return;
      }
      out.push({ type: 'para', level, list: level ? null : b.list, runs, size, body });
    });
  });
  return { blocks: out, body };
}
