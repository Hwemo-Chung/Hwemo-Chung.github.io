import { $, fileInput, status, progress } from '../common/tool.js';

const API = 'https://api.github.com';
const KEY_TOKEN = 'copilot-usage-token';
const KEY_BUDGET = 'copilot-usage-budget';
const statusEl = $('#status');
const bar = $('#bar');
const state = { kind: 'user', rows: [], source: '' };

const now = new Date();
$('#month').value = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
try {
  const saved = JSON.parse(localStorage.getItem(KEY_TOKEN) || 'null');
  if (saved) { $('#token').value = saved.token; $('#remember').checked = true; setKind(saved.kind || 'user'); $('#org').value = saved.org || ''; }
  $('#budget').value = localStorage.getItem(KEY_BUDGET) || '';
} catch { /* storage blocked */ }

$('#kind').addEventListener('click', (e) => { if (e.target.dataset.v) setKind(e.target.dataset.v); });
$('#load').addEventListener('click', loadApi);
$('#token').addEventListener('keydown', (e) => { if (e.key === 'Enter') loadApi(); });
$('#remember').addEventListener('change', () => { if (!$('#remember').checked) localStorage.removeItem(KEY_TOKEN); });
$('#csvPick').addEventListener('click', () => $('#csvFile').click());
fileInput($('#empty'), $('#csvFile'), async (files, err) => {
  if (err) return status(statusEl, 'CSV 파일만 올릴 수 있습니다.', true);
  loadCsv(files[0]);
});
$('#budget').addEventListener('input', () => { localStorage.setItem(KEY_BUDGET, $('#budget').value); render(); });
$('#monthSel').addEventListener('change', render);

function setKind(k) {
  state.kind = k;
  for (const b of $('#kind').children) b.setAttribute('aria-pressed', String(b.dataset.v === k));
  $('#orgField').hidden = k !== 'org';
}

class ApiError extends Error {}

async function gh(path, token) {
  let res;
  try {
    res = await fetch(API + path, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10' } });
  } catch {
    throw new ApiError('GitHub에 연결하지 못했습니다. 인터넷 연결을 확인하고 다시 해 보세요.');
  }
  if (res.ok) return res.json();
  const msg = (await res.json().catch(() => ({}))).message || '';
  const err = new ApiError(
    res.status === 401 ? '토큰이 맞지 않거나 만료됐습니다. 토큰을 다시 만들어 붙여 넣으세요.'
      : res.status === 403 ? `이 토큰에는 결제 정보를 읽을 권한이 없습니다. ${state.kind === 'org' ? '조직 Administration 읽기' : 'Plan 읽기'} 권한을 주세요.`
      : res.status === 404 ? (state.kind === 'org' ? '조직을 찾지 못했거나 조직 소유자·결제 관리자가 아닙니다.' : '이 계정으로 직접 결제한 Copilot 사용량이 없습니다. 회사에서 받은 Copilot이면 조직으로 바꿔 조회하세요.')
      : `GitHub가 오류를 돌려줬습니다 (HTTP ${res.status}${msg ? `: ${msg}` : ''}). 잠시 뒤 다시 해 보세요.`);
  err.status = res.status;
  throw err;
}

async function loadApi() {
  const token = $('#token').value.trim();
  const [y, m] = ($('#month').value || '').split('-').map(Number);
  if (!token) return status(statusEl, '토큰을 넣으세요.', true);
  if (!y || !m) return status(statusEl, '달을 2026-10처럼 넣으세요.', true);
  if (state.kind === 'org' && !$('#org').value.trim()) return status(statusEl, '조직 이름을 넣으세요.', true);
  if ($('#remember').checked) localStorage.setItem(KEY_TOKEN, JSON.stringify({ token, kind: state.kind, org: $('#org').value.trim() }));
  $('#load').disabled = true;
  status(statusEl, 'GitHub에서 불러오는 중입니다.');
  progress(bar, 0);
  try {
    let base, who;
    if (state.kind === 'user') {
      who = (await gh('/user', token)).login;
      base = `/users/${encodeURIComponent(who)}/settings/billing`;
    } else {
      who = $('#org').value.trim();
      base = `/organizations/${encodeURIComponent(who)}/settings/billing`;
    }
    const q = `year=${y}&month=${m}`;
    // Accounts on usage-based billing report AI credits; legacy plans still report premium requests.
    let report = 'ai_credit';
    let month = await gh(`${base}/ai_credit/usage?${q}`, token).catch((e) => { if (e.status === 404) return null; throw e; });
    if (!month?.usageItems?.length) {
      const legacy = await gh(`${base}/premium_request/usage?${q}`, token).catch((e) => { if (e.status === 404 && month) return null; throw e; });
      if (legacy?.usageItems?.length || !month) { month = legacy; report = 'premium_request'; }
    }
    const today = new Date();
    const thisMonth = today.getUTCFullYear() === y && today.getUTCMonth() + 1 === m;
    const days = thisMonth ? today.getUTCDate() : new Date(Date.UTC(y, m, 0)).getUTCDate();
    const rows = [];
    let done = 0;
    const day = async (d) => {
      const r = await gh(`${base}/${report}/usage?${q}&day=${d}`, token);
      const date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      for (const it of r.usageItems || []) rows.push(fromApi(it, date));
      progress(bar, ++done / days);
    };
    const queue = Array.from({ length: days }, (_, i) => i + 1);
    await Promise.all(Array.from({ length: 6 }, async () => { while (queue.length) await day(queue.shift()); }));
    // Daily totals should add up to the month; if the API ignored `day`, fall back to the monthly report.
    const sum = (items, k) => items.reduce((s, it) => s + (it[k] || 0), 0);
    const monthQty = sum(month?.usageItems || [], 'grossQuantity');
    const dayQty = sum(rows, 'qty');
    if (monthQty && Math.abs(dayQty - monthQty) > Math.max(1, monthQty * 0.02)) {
      rows.length = 0;
      for (const it of month.usageItems) rows.push(fromApi(it, null, `${y}-${String(m).padStart(2, '0')}`));
    }
    state.rows = rows;
    state.source = `${who} · GitHub API (${report === 'ai_credit' ? 'AI 크레딧' : '프리미엄 요청'})`;
    show(`${y}-${String(m).padStart(2, '0')}`);
    status(statusEl, rows.length ? `${days}일치를 불러왔습니다.` : '이 달에는 사용 기록이 없습니다.');
  } catch (e) {
    status(statusEl, e instanceof ApiError ? e.message : `불러오지 못했습니다: ${e.message}`, true);
  } finally {
    $('#load').disabled = false;
    progress(bar, null);
  }
}

function fromApi(it, date, month) {
  return {
    date, month: month || date.slice(0, 7), model: it.model || it.sku || '-', product: it.product || '', unit: it.unitType || '',
    qty: +it.grossQuantity || 0, gross: +it.grossAmount || 0, disc: +it.discountAmount || 0, net: +it.netAmount || 0,
  };
}

async function loadCsv(file) {
  status(statusEl, '');
  const table = parseCsv((await file.text()).replace(/^\ufeff/, ''));
  const head = (table.shift() || []).map((h) => h.trim().toLowerCase());
  const col = (...names) => names.map((n) => head.indexOf(n)).find((i) => i >= 0) ?? -1;
  const c = {
    date: col('date', 'usage_at'), product: col('product'), sku: col('sku'), model: col('model'), qty: col('quantity'),
    unit: col('unit_type'), gross: col('gross_amount'), disc: col('discount_amount'), net: col('net_amount'),
  };
  if (c.date < 0 || c.qty < 0) {
    return status(statusEl, '이 CSV에는 date, quantity 열이 없습니다. GitHub 결제 화면의 Get usage report로 받은 파일을 올려 주세요.', true);
  }
  const num = (r, i) => (i < 0 ? 0 : parseFloat(String(r[i]).replace(/[$,]/g, '')) || 0);
  const rows = [];
  for (const r of table) {
    if (r.length < head.length / 2) continue;
    const product = c.product >= 0 ? r[c.product] : '';
    const sku = c.sku >= 0 ? r[c.sku] : '';
    const model = c.model >= 0 ? r[c.model] : '';
    if (!model && !/copilot|ai.?credit|premium/i.test(`${product} ${sku}`)) continue;
    const date = String(r[c.date]).trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    rows.push({
      date, month: date.slice(0, 7), model: model || sku || '-', product, unit: c.unit >= 0 ? r[c.unit] : '',
      qty: num(r, c.qty), gross: num(r, c.gross), disc: num(r, c.disc), net: num(r, c.net),
    });
  }
  if (!rows.length) return status(statusEl, '이 CSV에서 Copilot 사용 기록을 찾지 못했습니다. AI usage 또는 Copilot 사용량 보고서를 올려 주세요.', true);
  state.rows = rows;
  state.source = `${file.name} · ${rows.length}줄`;
  show(rows.map((r) => r.month).sort().at(-1));
}

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim()));
}

function show(month) {
  const months = [...new Set(state.rows.map((r) => r.month))].sort().reverse();
  if (!months.includes(month)) months.unshift(month);
  $('#monthSel').replaceChildren(...months.map((v) => new Option(v.replace('-', '년 ') + '월', v)));
  $('#monthSel').value = month;
  $('#monthSel').hidden = months.length < 2;
  $('#source').textContent = state.source;
  $('#empty').hidden = true;
  $('#view').hidden = false;
  render();
}

const usd = (n) => `$${n.toFixed(2)}`;
const qty = (n) => (Number.isInteger(n) ? n.toLocaleString('ko-KR') : n.toLocaleString('ko-KR', { maximumFractionDigits: 2 }));
const unitName = (u) => ({ requests: '요청', request: '요청', 'ai-credits': '크레딧', ai_credits: '크레딧', credits: '크레딧' }[String(u).toLowerCase()] || u);

function render() {
  if ($('#view').hidden) return;
  const month = $('#monthSel').value;
  const rows = state.rows.filter((r) => r.month === month);
  const tot = rows.reduce((t, r) => ({ qty: t.qty + r.qty, gross: t.gross + r.gross, disc: t.disc + r.disc, net: t.net + r.net }), { qty: 0, gross: 0, disc: 0, net: 0 });
  const units = [...new Set(rows.map((r) => r.unit).filter(Boolean))];
  $('#qtyLabel').textContent = units.length === 1 ? `사용량 (${unitName(units[0])})` : '사용량';
  $('#sQty').textContent = qty(tot.qty);
  $('#sGross').textContent = usd(tot.gross);
  $('#sDisc').textContent = usd(tot.disc);
  $('#sNet').textContent = usd(tot.net);

  const [y, m] = month.split('-').map(Number);
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const today = new Date();
  const current = today.getUTCFullYear() === y && today.getUTCMonth() + 1 === m;
  const elapsed = current ? today.getUTCDate() : dim;

  const budget = parseFloat($('#budget').value);
  $('#budgetBox').hidden = !(budget > 0);
  if (budget > 0) {
    const ratio = tot.net / budget;
    $('#spent').style.width = `${Math.min(100, ratio * 100)}%`;
    $('#track').classList.toggle('over', ratio > 1);
    const proj = (tot.net / elapsed) * dim;
    $('#pace').hidden = !current;
    $('#pace').style.left = `${Math.min(100, (proj / budget) * 100)}%`;
    $('#budgetText').textContent = `청구액 ${usd(tot.net)} / 예산 ${usd(budget)} (${Math.round(ratio * 100)}%)`
      + (current ? ` · 이 속도면 월말 ${usd(proj)}${proj > budget ? ', 예산을 넘습니다' : ''}` : '');
  }

  const byDay = new Map();
  for (const r of rows) if (r.date) {
    const d = byDay.get(r.date) || { qty: 0, net: 0, gross: 0 };
    d.qty += r.qty; d.net += r.net; d.gross += r.gross;
    byDay.set(r.date, d);
  }
  const hasDays = byDay.size > 0;
  $('#days').parentElement.hidden = !hasDays;
  if (hasDays) {
    const max = Math.max(...[...byDay.values()].map((d) => d.qty), 1e-9);
    $('#days').replaceChildren(...Array.from({ length: dim }, (_, i) => {
      const date = `${month}-${String(i + 1).padStart(2, '0')}`;
      const d = byDay.get(date);
      const s = document.createElement('span');
      s.style.height = `${d ? Math.max(1, (d.qty / max) * 100) : 1}%`;
      if (!d || !d.qty) s.className = 'zero';
      s.title = `${m}월 ${i + 1}일 · ${d ? `${qty(d.qty)} · ${usd(d.gross)} (청구 ${usd(d.net)})` : '0'}`;
      return s;
    }));
    $('#axis0').textContent = `${m}/1`;
    $('#axis1').textContent = `${m}/${dim}`;
  }

  const byModel = new Map();
  for (const r of rows) {
    const d = byModel.get(r.model) || { qty: 0, gross: 0, net: 0 };
    d.qty += r.qty; d.gross += r.gross; d.net += r.net;
    byModel.set(r.model, d);
  }
  const list = [...byModel].sort((a, b) => b[1].qty - a[1].qty);
  $('#models tbody').replaceChildren(...list.map(([name, d]) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td></td><td class="num meta">${qty(d.qty)}</td><td class="num meta">${usd(d.gross)}</td><td class="num meta">${usd(d.net)}</td><td><div class="share"><i style="width:${tot.qty ? (d.qty / tot.qty) * 100 : 0}%"></i></div></td>`;
    tr.cells[0].textContent = name;
    return tr;
  }));
}
