import ImageTracer from 'https://cdn.jsdelivr.net/npm/imagetracerjs@1.2.6/+esm';

const DETAIL = {
  low: { ltres: 2, qtres: 2, pathomit: 16 },
  mid: { ltres: 1, qtres: 1, pathomit: 8 },
  high: { ltres: 0.5, qtres: 0.5, pathomit: 2 },
};

onmessage = ({ data: { imgd, colors, detail, dropBg, outW, outH } }) => {
  try {
    const opts = {
      ...DETAIL[detail], pal: palette(imgd, colors), colorquantcycles: 1,
      blurradius: 0, rightangleenhance: true, strokewidth: 1, roundcoords: 1, viewbox: true,
    };
    const td = ImageTracer.imagedataToTracedata(imgd, opts);
    const bg = dropBg ? borderColor(imgd, td.palette) : -1;
    td.layers = td.layers.map((layer, i) => (td.palette[i].a < 128 ? [] : layer));
    // Only background shapes that touch the image edge go; the same color inside the logo (letters, gaps) stays.
    // Marking them as holes makes getsvgstring skip them while keeping hole indexes intact.
    if (bg >= 0) {
      for (const p of td.layers[bg]) {
        const [x0, y0, x1, y1] = p.boundingbox;
        if (x0 <= 1 || y0 <= 1 || x1 >= td.width - 1 || y1 >= td.height - 1) p.isholepath = true;
      }
    }
    const used = td.palette.filter((c, i) => td.layers[i].some((p) => !p.isholepath));
    const paths = td.layers.reduce((n, l) => n + l.filter((p) => !p.isholepath).length, 0);
    const svg = ImageTracer.getsvgstring(td, opts)
      .replace(/^<svg [^>]*>/, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${td.width} ${td.height}" width="${outW}" height="${outH}">`)
      .replaceAll(' opacity="1" ', ' ');
    postMessage({ svg, used, paths });
  } catch (e) {
    postMessage({ error: e.message });
  }
};

// Alpha is made binary, then the opaque colors are clustered with weighted k-means on a 5-bit histogram.
// Farthest-point seeding weighted by pixel count picks real logo colors before anti-aliasing blends.
function palette(imgd, k) {
  const d = imgd.data;
  const hist = new Map();
  let clear = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) { d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0; clear++; continue; }
    d[i + 3] = 255;
    const key = ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3);
    const h = hist.get(key);
    if (h) { h[0] += d[i]; h[1] += d[i + 1]; h[2] += d[i + 2]; h[3]++; } else hist.set(key, [d[i], d[i + 1], d[i + 2], 1]);
  }
  const bins = [...hist.values()].map(([r, g, b, n]) => [r / n, g / n, b / n, n]);
  const dist = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  const cents = [];
  if (bins.length) {
    seed(bins, cents, k, dist);
    lloyd(bins, cents, dist);
    // Drop anti-aliasing blends: a small cluster lying on the line between two bigger ones.
    const n = counts(bins, cents, dist);
    const keep = cents.filter((c, i) => !cents.some((a, j) => cents.some((b, l) => {
      if (j === l || j === i || l === i || n[j] * 0.25 < n[i] || n[l] * 0.25 < n[i]) return false;
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const t = ((c[0] - a[0]) * ab[0] + (c[1] - a[1]) * ab[1] + (c[2] - a[2]) * ab[2]) / (dist(a, b) || 1);
      return t > 0.1 && t < 0.9 && dist(c, [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t]) < 24 ** 2;
    })));
    if (keep.length < cents.length) { cents.splice(0, cents.length, ...keep); lloyd(bins, cents, dist); }
  }
  const pal = cents.map(([r, g, b]) => ({ r: Math.round(r), g: Math.round(g), b: Math.round(b), a: 255 }));
  if (clear) pal.unshift({ r: 0, g: 0, b: 0, a: 0 });
  return pal;
}

function seed(bins, cents, k, dist) {
  cents.push(bins.reduce((a, b) => (b[3] > a[3] ? b : a)).slice(0, 3));
  const near = bins.map((b) => dist(b, cents[0]));
  while (cents.length < Math.min(k, bins.length)) {
    let best = 0, score = -1;
    bins.forEach((b, i) => { const s = b[3] * near[i]; if (s > score) { score = s; best = i; } });
    if (score <= 0) break;
    cents.push(bins[best].slice(0, 3));
    bins.forEach((b, i) => { near[i] = Math.min(near[i], dist(b, cents.at(-1))); });
  }
}

function nearest(b, cents, dist) {
  let j = 0, bd = Infinity;
  cents.forEach((c, ci) => { const x = dist(b, c); if (x < bd) { bd = x; j = ci; } });
  return j;
}

function counts(bins, cents, dist) {
  const n = cents.map(() => 0);
  for (const b of bins) n[nearest(b, cents, dist)] += b[3];
  return n;
}

function lloyd(bins, cents, dist) {
  for (let it = 0; it < 12; it++) {
    const acc = cents.map(() => [0, 0, 0, 0]);
    for (const b of bins) {
      const a = acc[nearest(b, cents, dist)];
      a[0] += b[0] * b[3]; a[1] += b[1] * b[3]; a[2] += b[2] * b[3]; a[3] += b[3];
    }
    acc.forEach((a, j) => { if (a[3]) cents[j] = [a[0] / a[3], a[1] / a[3], a[2] / a[3]]; });
  }
}

// Palette index covering most of the image border, if it clearly dominates (a solid background).
function borderColor({ data, width: w, height: h }, pal) {
  const count = new Array(pal.length).fill(0);
  let total = 0;
  const take = (x, y) => {
    const i = (y * w + x) * 4;
    let best = 0, bd = Infinity;
    pal.forEach((c, k) => {
      const d = Math.abs(c.r - data[i]) + Math.abs(c.g - data[i + 1]) + Math.abs(c.b - data[i + 2]) + Math.abs(c.a - data[i + 3]);
      if (d < bd) { bd = d; best = k; }
    });
    count[best]++; total++;
  };
  for (let x = 0; x < w; x += 2) { take(x, 0); take(x, h - 1); }
  for (let y = 0; y < h; y += 2) { take(0, y); take(w - 1, y); }
  const top = count.indexOf(Math.max(...count));
  return count[top] / total > 0.6 ? top : -1;
}
