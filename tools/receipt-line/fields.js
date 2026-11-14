// Pulls date, store, total and payment method out of OCR text from one receipt.

const YEAR_MAX = new Date().getFullYear() + 1;
const pad = (n) => String(n).padStart(2, '0');

function validDate(y, m, d) {
  if (y < 100) y += 2000;
  return y >= 2000 && y <= YEAR_MAX && m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${pad(m)}-${pad(d)}` : null;
}

// OCR often reads 0 as O/o, 1 as l/I/|, 5 as S, 8 as B inside numbers.
function digits(s) {
  return s.replace(/(?<=[\d,.:\-/])[Oo]|[Oo](?=[\d,.:\-/])/g, '0').replace(/(?<=[\d,.])[lI|]|[lI|](?=[\d,.]\d)/g, '1');
}

function findDate(line) {
  const t = digits(line);
  let m;
  if ((m = t.match(/(20\d{2}|\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/))) {
    const r = validDate(+m[1], +m[2], +m[3]);
    if (r) return r;
  }
  if ((m = t.match(/\b(\d{1,2})[.,\-/](\d{1,2})[.,\-/](20\d{2})\b/))) {
    const r = +m[1] > 12 ? validDate(+m[3], +m[2], +m[1]) : validDate(+m[3], +m[1], +m[2]) || validDate(+m[3], +m[2], +m[1]);
    if (r) return r;
  }
  if ((m = t.match(/(?:^|\D)(20\d{2})(\d{2})(\d{2})(?!\d)/))) {
    const r = validDate(+m[1], +m[2], +m[3]);
    if (r) return r;
  }
  if ((m = t.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2})\b/))) return validDate(+m[3], +m[1], +m[2]); // US 06/21/06
  return null;
}

function findTime(line) {
  const m = digits(line).match(/\b([01]?\d|2[0-3])\s*[:시]\s*([0-5]\d)(?:\s*[:분]\s*([0-5]\d))?\s*(AM|PM)?/i);
  if (!m) return '';
  let h = +m[1];
  if (/pm/i.test(m[4] || '') && h < 12) h += 12;
  if (/am/i.test(m[4] || '') && h === 12) h = 0;
  return `${pad(h)}:${m[2]}`;
}

export function money(s) {
  const t = s.replace(/\s/g, '');
  if (/,\d{3}(?!\d)/.test(t) && !/\.\d{3}/.test(t)) return +t.replace(/,/g, ''); // 11,400 / 1,234.50
  if (/\.\d{3}(?!\d)/.test(t) && /,\d{2}$/.test(t)) return +t.replace(/\./g, '').replace(',', '.'); // 1.234,50
  if (/,\d{2}$/.test(t)) return +t.replace(',', '.');
  return +t.replace(/,/g, '');
}

function amounts(line) {
  return [...digits(line).matchAll(/(?<![\d.,:/-])-?\d{1,3}(?:[,.]\s?\d{3})+(?:[.,]\d{2})?(?![\d:/])|(?<![\d.,:/-])\d+[.,]\d{2}(?![\d:/])|(?<![\d.,:/-])\d{3,7}(?![\d.,:/-])/g)]
    .map((m) => money(m[0])).filter((v) => v > 0);
}

const TOTAL = [
  /(받을|결제|청구|승인|판매|총\s*결제)\s*금\s*액/, /합\s*계\s*금\s*액/, /총\s*(금\s*액|액|합\s*계)/, /합\s*계/, /내실\s*금액|결제\s*할?\s*금액/,
  /(^|[\s\-])합\s*\S?\s+(?=.*\d)/, // big double-width "합 계" often comes back as "합 A"
  /\b(grand\s*total|amount\s*due|balance\s*due|total\s*due)\b/i, /\btotal\b/i, /\b(summe|gesamt|betrag|montant|totale?)\b/i,
];
const NOT_TOTAL = /과세|부가|면세|공급|봉사료|할인|포인트|받은|거스|잔돈|에누리|sub\s*-?total|tax|vat|mwst|change|tip|saved|savings|tendered/i;

function findTotal(lines) {
  for (const re of TOTAL) {
    for (let i = 0; i < lines.length; i++) {
      if (!re.test(lines[i]) || NOT_TOTAL.test(lines[i].replace(re, ''))) continue;
      const here = amounts(lines[i]);
      if (here.length) return here.at(-1);
      const split = digits(lines[i]).match(/(\d+)\s(\d{2})\s*$/); // "54 50" where the decimal point was lost
      if (split) return +`${split[1]}.${split[2]}`;
      const next = lines[i + 1] && amounts(lines[i + 1]);
      if (next && next.length && !NOT_TOTAL.test(lines[i + 1])) return next.at(-1);
    }
  }
  // Korean receipts: 과세(공급가) + 부가세 + 면세 = total
  const pick = (re) => { const l = lines.find((x) => re.test(x)); return l ? amounts(l).at(-1) || 0 : null; };
  const net = pick(/과세\s*(물품|액|금액)|공급\s*가/), vat = pick(/부\s*가\s*세/);
  if (net && vat) return net + vat + (pick(/면세/) || 0);
  const s = arithmetic(lines);
  if (s.total) return s.total;
  const all = lines.filter((l) => !NOT_TOTAL.test(l) && !/현\s*금|cash|card|카드|전화|tel|fax|사업자|\bno\b|\bnr\b|#|번호/i.test(l)).flatMap(amounts);
  return all.length ? Math.max(...all) : null;
}

// When labels are unreadable, the numbers still add up: net + tax = total, or paid - change = total.
function arithmetic(lines) {
  const list = lines.flatMap((l, i) => amounts(l).map((v) => ({ v, i })));
  const near = (a, b) => Math.abs(a - b) < 0.005;
  for (const t of [...list].sort((a, b) => b.v - a.v)) {
    const after = list.filter((x) => x.i > t.i);
    if (after.some((x) => x.v > t.v && after.some((c) => c !== x && near(x.v - t.v, c.v)))) return { total: t.v, cash: true };
  }
  for (const t of [...list].sort((a, b) => b.v - a.v)) {
    const before = list.filter((x) => x.i < t.i && x.v < t.v);
    if (before.some((a) => before.some((b) => b !== a && b.i !== a.i && near(a.v + b.v, t.v)))) return { total: t.v, cash: false };
  }
  return {};
}

const APPS = [
  [/카카오\s*페이|kakao\s*pay/i, '카카오페이'], [/네이버\s*페이|naver\s*pay/i, '네이버페이'], [/삼성\s*페이|samsung\s*pay/i, '삼성페이'],
  [/토스\s*페이|toss\s*pay/i, '토스페이'], [/페이코|payco/i, '페이코'], [/애플\s*페이|apple\s*pay/i, 'Apple Pay'], [/제로\s*페이/, '제로페이'],
  [/google\s*pay/i, 'Google Pay'], [/계좌\s*이체/, '계좌이체'],
];
const ISSUERS = /(신한|국민|KB|삼성|현대|롯데|하나|우리|농협|NH|BC|비씨|씨티|IBK|기업|카카오뱅크|케이뱅크|토스뱅크)\s*(카드|체크)/i;

function findPayment(text, lines) {
  for (const [re, name] of APPS) if (re.test(text)) return name;
  const issuer = text.match(ISSUERS);
  if (issuer) return `${issuer[1]}${issuer[2]}`.replace(/\s/g, '');
  const brand = text.match(/\b(VISA|MASTER\s*CARD|MASTERCARD|AMEX|AMERICAN\s*EXPRESS|DISCOVER|JCB|UNION\s*PAY|MAESTRO)\b/i);
  if (brand) return `카드 (${brand[1].toUpperCase().replace(/\s/g, '')})`;
  if (/신용\s*카드|체크\s*카드|카드\s*번호|승인\s*번호|할부|일시불|credit\s*card|debit\s*card|card\s*no/i.test(text)) return '카드';
  if (lines.some((l) => /현\s*금|cash|\bbar\b|(^|[\s\-])현\s*\S?\s/i.test(l) && !/현금\s*영수증/.test(l) && amounts(l).length)) return '현금';
  if (arithmetic(lines).cash) return '현금';
  return '';
}

const NOT_STORE = /영수증|receipt|매출\s*전표|고객용|가맹점용|카드\s*사용|welcome|thank|감사|연중무휴|24\s*시간|주차|^[^가-힣A-Za-z]+$|^\d|\btel\b|전화|사업자|주소|대표|www|http|@/i;

function findStore(lines) {
  for (const l of lines) {
    const m = l.match(/(?:상\s*호|[앙삼싱]\s*호(?=\s*[:;：])|가맹점\s*명?|매장\s*명?|점\s*포\s*명?|상\s*점\s*명?|store|merchant)\s*(?:[:;：]|\s{2,})\s*(.+)/i);
    if (m) {
      const v = m[1].replace(/(대표|사업자|tel|전화|\d{2,3}-\d{3,4}-\d{4}).*$/i, '').replace(/\s+/g, (s) => (s.length > 1 ? ' ' : '')).trim();
      if (v.replace(/[^가-힣A-Za-z0-9]/g, '').length >= 2) return tidy(v);
    }
  }
  const first = lines.slice(0, 8).find((l) => !NOT_STORE.test(l) && (l.match(/[가-힣A-Za-z]/g) || []).length >= 2);
  return first ? tidy(first) : '';
}

function tidy(s) {
  // spaced-out print ("동 대 문 마 트") back to one word
  const cleaned = s.replace(/[◆◇■□●○★☆▶◀※*#"'`|_=~<>]+/g, ' ').trim();
  const parts = cleaned.split(/\s+/);
  const singles = parts.filter((p) => p.length === 1).length;
  return (parts.length > 2 && singles >= parts.length * 0.7 ? parts.join('') : cleaned.replace(/\s{2,}/g, ' ')).slice(0, 40);
}

export function extract(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const keyed = lines.filter((l) => /일시|일자|날짜|거래|판매|승인|date|datum/i.test(l));
  let date = '', time = '';
  for (const l of [...keyed, ...lines]) {
    const d = findDate(l);
    if (d) { date = d; time = findTime(l); break; }
  }
  if (!time) for (const l of lines) if ((time = findTime(l))) break;
  return { date, time, store: findStore(lines), total: findTotal(lines), payment: findPayment(text, lines) };
}
