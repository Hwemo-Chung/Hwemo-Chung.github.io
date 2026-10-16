import { $, status, progress, download, bytes } from '../common/tool.js';

const API = 'https://api.microlink.io/';
const statusEl = $('#status');
const prog = $('#prog');
const state = { device: 'Macbook Pro 13', full: true, blob: null, name: '' };

for (const id of ['#device', '#range']) {
  $(id).addEventListener('click', (e) => {
    const v = e.target.dataset.v;
    if (!v) return;
    for (const b of $(id).children) b.setAttribute('aria-pressed', String(b.dataset.v === v));
    if (id === '#device') state.device = v; else state.full = v === 'full';
  });
}

$('#empty').addEventListener('click', () => $('#url').focus());
$('#save').addEventListener('click', () => state.blob && download(state.blob, state.name));

function target(raw) {
  const s = raw.trim();
  try {
    const u = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(s) ? s : `https://${s}`);
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) return null;
    return u;
  } catch { return null; }
}

function resetTime(res) {
  const t = +res.headers.get('x-rate-limit-reset');
  if (!t) return '';
  const d = new Date(t > 1e12 ? t : t * 1000);
  return ` ${d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })}에 다시 쓸 수 있습니다.`;
}

$('#form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = target($('#url').value);
  if (!url) return status(statusEl, '주소를 확인하세요. 예: https://example.com', true);
  $('#url').value = decodeURI(url.href);
  $('#go').disabled = true;
  status(statusEl, '페이지를 열고 찍는 중…');
  // the service gives no progress, so the bar only shows that work is going on
  let t = 0;
  const tick = setInterval(() => progress(prog, Math.min(0.9, (t += 0.5) / 40)), 500);
  try {
    const q = new URLSearchParams({ url: url.href, screenshot: 'true', meta: 'false', device: state.device, 'screenshot.type': 'png' });
    if (state.full) q.set('fullPage', 'true');
    let res;
    try { res = await fetch(`${API}?${q}`); } catch { throw new Error('캡처 서버에 연결하지 못했습니다. 인터넷 연결을 확인하고 다시 누르세요.'); }
    const body = await res.json().catch(() => ({}));
    const left = res.headers.get('x-rate-limit-remaining');
    if (res.status === 429 || body.code === 'ERATE') throw new Error(`오늘 무료 캡처 횟수를 다 썼습니다.${resetTime(res)}`);
    if (body.status !== 'success' || !body.data?.screenshot?.url) {
      const why = /timeout/i.test(`${body.code} ${body.message}`) ? '페이지가 너무 늦게 열립니다' : '이 주소의 페이지를 열지 못했습니다';
      throw new Error(`${why}. 주소가 맞는지, 로그인 없이 열리는 페이지인지 확인하세요.`);
    }
    const shot = body.data.screenshot;
    status(statusEl, '이미지를 받는 중…');
    const img = await fetch(shot.url);
    if (!img.ok) throw new Error('찍은 이미지를 받지 못했습니다. 다시 누르세요.');
    state.blob = await img.blob();
    const path = decodeURIComponent(url.pathname).replace(/\/+$/, '').replace(/[^\w가-힣-]+/g, '-').slice(0, 60);
    state.name = `${url.hostname.replace(/^www\./, '')}${path}-${state.device.split(' ')[0].toLowerCase()}.png`;
    const el = $('#shot');
    if (el.dataset.blob) URL.revokeObjectURL(el.dataset.blob);
    el.src = el.dataset.blob = URL.createObjectURL(state.blob);
    $('#info').textContent = `${url.host} · ${shot.width}×${shot.height} · ${bytes(state.blob.size)}`;
    $('#empty').hidden = true;
    $('#result').hidden = false;
    $('#save').disabled = false;
    status(statusEl, left != null ? `다 찍었습니다. 오늘 남은 무료 캡처 ${left}번.` : '다 찍었습니다.');
  } catch (err) {
    status(statusEl, err.message, true);
  }
  clearInterval(tick);
  progress(prog, null);
  $('#go').disabled = false;
});
