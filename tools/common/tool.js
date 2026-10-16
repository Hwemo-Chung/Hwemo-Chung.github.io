// Shared helpers for /tools/*. Plain ES module, no build step.

export const $ = (sel, root = document) => root.querySelector(sel);

// Wires a .drop element (and an optional <input type=file>) to onFiles(File[]).
// Also accepts files dropped anywhere on the page and pasted images.
export function fileInput(drop, input, onFiles) {
  const take = (list) => {
    const files = [...(list || [])].filter((f) => !input.accept || accepts(input.accept, f));
    if (files.length) onFiles(files);
    else if (list && list.length) onFiles([], new Error('이 형식은 열 수 없습니다.'));
  };
  drop.addEventListener('click', () => input.click());
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  input.addEventListener('change', () => { take(input.files); input.value = ''; });
  addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  addEventListener('dragleave', (e) => { if (!e.relatedTarget) drop.classList.remove('over'); });
  addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); take(e.dataTransfer.files); });
  addEventListener('paste', (e) => take([...e.clipboardData.items].map((i) => i.getAsFile()).filter(Boolean)));
}

function accepts(accept, file) {
  return accept.split(',').map((s) => s.trim().toLowerCase()).some((a) =>
    a.startsWith('.') ? file.name.toLowerCase().endsWith(a)
      : a.endsWith('/*') ? file.type.startsWith(a.slice(0, -1))
      : file.type === a);
}

export function status(el, text, isError = false) {
  el.textContent = text || '';
  el.classList.toggle('error', isError);
}

export function progress(el, ratio) {
  if (ratio == null) { el.hidden = true; return; }
  el.hidden = false;
  el.firstElementChild.style.width = `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`;
}

export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function bytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 ** 2).toFixed(2)} MB`;
}

export function baseName(file) {
  return file.name.replace(/\.[^.]+$/, '');
}

export async function loadImage(src) {
  const url = src instanceof Blob ? URL.createObjectURL(src) : src;
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  try { await img.decode(); } catch { throw new Error('이미지를 읽지 못했습니다. 파일이 손상됐거나 지원하지 않는 형식입니다.'); }
  return img;
}

export function toBlob(canvas, type = 'image/png', quality) {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('이미지를 만들지 못했습니다.'))), type, quality));
}
