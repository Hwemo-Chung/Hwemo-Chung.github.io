#!/usr/bin/env node
/*
 * /en/·/ja/ 정적 페이지 생성기.
 *
 * 원본(한국어) 페이지와 i18n-content.json·i18n.js 의 번역으로 /en/<경로>, /ja/<경로> 를 만든다.
 * 번역 규칙은 i18n.js 의 setSiteLanguage + translateSitePage 와 같다(같은 알고리즘을 빌드 때 한 번 적용).
 * 원본 페이지의 head 에는 ko·en·ja·x-default hreflang 을 넣고, sitemap.xml 에 새 URL 만 덧붙인다.
 *
 * 실행 (Playwright 와 시스템 Chrome 필요):
 *   NODE_PATH=~/.insane-search/node/node_modules node scripts/build-i18n-pages.cjs          # 생성 + 검사
 *   NODE_PATH=~/.insane-search/node/node_modules node scripts/build-i18n-pages.cjs --check  # 검사만
 *
 * 원본 페이지나 번역을 고친 뒤에는 다시 실행한다. /en/·/ja/ 파일은 직접 고치지 않는다.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const http = require('http');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const ORIGIN = 'https://hwemo-chung.github.io';
const LANGS = ['en', 'ja'];
const LOCALE = { ko: 'ko_KR', en: 'en_US', ja: 'ja_JP' };
const SKIP = new Set(['/404.html']);
const CHECK_ONLY = process.argv.includes('--check');

const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const content = JSON.parse(read('i18n-content.json'));
const i18nSrc = read('i18n.js');
const siteTranslations = vm.runInNewContext(
  i18nSrc.slice(i18nSrc.indexOf('const siteTranslations'), i18nSrc.indexOf('\n};\n', i18nSrc.indexOf('const siteTranslations')) + 3) + '\nsiteTranslations', {});

// 대상: 번역이 있고 색인되는 페이지. noindex 는 만들지 않는다.
const pages = Object.keys(content).filter(key => {
  const file = key.slice(1);
  if (SKIP.has(key) || !fs.existsSync(path.join(ROOT, file))) return false;
  const src = ((read(file).match(/<html[^>]*\blang="([a-z]{2})/i) || [])[1] || 'ko').toLowerCase();
  if (!LANGS.filter(l => l !== src).every(l => content[key][l])) return false;
  return !/<meta[^>]+name="robots"[^>]+noindex/i.test(read(file));
});

/** 원본 canonical 의 경로 형태(/offers/ 또는 /offers/iosgate.html)를 쓴다. */
function canonicalPath(key) {
  const m = read(key.slice(1)).match(/<link rel="canonical" href="([^"]+)"/);
  return m && m[1].startsWith(ORIGIN) ? m[1].slice(ORIGIN.length) : key.replace(/index\.html$/, '');
}

function serve() {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.cjs': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
    '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain' };
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

/** 브라우저 안에서 실행: 번역 적용, URL 절대화, head 교체, 남은 한글 수집. */
function transform({ lang, map, st, variantPaths, origin, canonRoot, variantUrl, locale, otherLocales, alternates }) {
  const norm = s => s.trim().replace(/\s+/g, ' ');
  const missing = new Set();
  const pick =(obj, dotted) => dotted.split('.').reduce((t, k) => t?.[k], obj);
  for (const el of document.querySelectorAll('[data-i18n]')) { const t = pick(st, el.getAttribute('data-i18n')); if (t) el.textContent = t; }
  for (const el of document.querySelectorAll('[data-i18n-aria-label]')) { const t = pick(st, el.getAttribute('data-i18n-aria-label')); if (t) el.setAttribute('aria-label', t); }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const parent = n.parentElement, original = n.textContent, source = norm(original);
    if (!source || !parent || parent.closest('script, style, code, pre, [data-i18n], [data-no-i18n], .ls-nav, .language-toolbar')) continue;
    if (map[source]) n.textContent = original.match(/^\s*/)[0] + map[source] + original.match(/\s*$/)[0];
    else if (/[가-힣]/.test(source)) missing.add(source);
  }
  for (const el of document.querySelectorAll('[placeholder], [title], [aria-label]'))
    for (const a of ['placeholder', 'title', 'aria-label']) { const v = el.getAttribute(a); if (v && map[v]) el.setAttribute(a, map[v]); }
  for (const m of document.querySelectorAll('meta[name="description"], meta[property="og:title"], meta[property="og:description"], meta[name="twitter:title"], meta[name="twitter:description"]')) {
    const v = m.getAttribute('content'); if (v && map[v]) m.setAttribute('content', map[v]);
  }
  if (map[document.title]) document.title = map[document.title];
  for (const v of [document.title, document.querySelector('meta[name="description"]')?.content])
    if (v && /[가-힣]/.test(v) && !Object.values(map).includes(v)) missing.add(v);

  // 한 단계 아래(/en/)로 옮겨도 깨지지 않게 같은 사이트 URL 을 루트 기준으로 바꾸고, 번역본이 있는 페이지 링크는 번역본으로 돌린다.
  const keyOf = p => (p.endsWith('/') ? p + 'index.html' : p);
  const rewrite = (value, isLink) => {
    const v = value.trim();
    if (!v || /^(#|mailto:|tel:|data:|javascript:|blob:)/i.test(v)) return value;
    const absolute = /^https?:|^\/\//i.test(v);
    if (absolute && !v.startsWith(origin)) return value;
    const u = new URL(absolute ? v.slice(origin.length) || '/' : v, location.href);
    let p = u.pathname;
    if (isLink && variantPaths.includes(keyOf(p))) p = '/' + lang + p;
    return (absolute ? origin : '') + p + u.search + u.hash;
  };
  for (const el of document.querySelectorAll('[href], [src], [action], [poster]')) {
    if (el.matches('link[rel="canonical"], link[rel="alternate"][hreflang]')) continue;
    for (const a of ['href', 'src', 'action', 'poster']) {
      const v = el.getAttribute(a);
      if (v != null) el.setAttribute(a, rewrite(v, a === 'href' && el.matches('a, area')));
    }
  }
  for (const el of document.querySelectorAll('[srcset]'))
    el.setAttribute('srcset', el.getAttribute('srcset').split(',').map(part => {
      const [u, ...d] = part.trim().split(/\s+/); return [rewrite(u, false), ...d].join(' ');
    }).join(', '));

  // head: lang, canonical, og, hreflang, JSON-LD 의 자기 URL
  document.documentElement.lang = lang;
  const head = document.head;
  const canon = head.querySelector('link[rel="canonical"]') || head.appendChild(Object.assign(document.createElement('link'), { rel: 'canonical' }));
  canon.href = variantUrl;
  head.querySelectorAll('link[rel="alternate"][hreflang]').forEach(e => e.remove());
  let anchor = canon;
  for (const [hl, href] of alternates) {
    const l = document.createElement('link'); l.rel = 'alternate'; l.hreflang = hl; l.href = href;
    anchor.after(l); anchor = l;
  }
  const ogUrl = head.querySelector('meta[property="og:url"]'); if (ogUrl) ogUrl.content = variantUrl;
  head.querySelectorAll('meta[property="og:locale"], meta[property="og:locale:alternate"]').forEach(e => e.remove());
  const ogTitle = head.querySelector('meta[property="og:title"]');
  if (ogTitle) {
    let a = ogTitle;
    for (const [prop, val] of [['og:locale', locale], ...otherLocales.map(o => ['og:locale:alternate', o])]) {
      const m = document.createElement('meta'); m.setAttribute('property', prop); m.content = val; a.after(m); a = m;
    }
  }
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const swap = x => typeof x === 'string' ? (x === canonRoot ? variantUrl : x)
        : Array.isArray(x) ? x.map(swap) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, swap(v)])) : x;
      const data = swap(JSON.parse(s.textContent));
      s.textContent = '\n' + JSON.stringify(data, null, 2) + '\n';
    } catch (e) { /* 원본 그대로 둔다 */ }
  }

  // data-no-i18n 은 일부러 원문으로 두는 영역(한국어 화면의 도구 목록 등)이라 검사에서 뺀다. 저장할 HTML 을 먼저 잡고 숨긴다.
  const html = document.documentElement.outerHTML;
  document.querySelectorAll('[data-no-i18n]').forEach(e => { e.style.display = 'none'; });
  const visible = [document.title, head.querySelector('meta[name="description"]')?.content || '', document.body.innerText].join('\n');
  const left = [...new Set(visible.split('\n').map(norm).filter(s => /[가-힣]/.test(s) && !/^(한|EN|日)( (EN|日))*$/.test(s)))];
  return { html, left, missing: [...missing] };
}

function updateSourceHead(key, alternates) {
  const file = key.slice(1);
  let s = read(file);
  const block = '<!-- i18n-alternates -->\n' + alternates.map(([hl, href]) => `    <link rel="alternate" hreflang="${hl}" href="${href}">`).join('\n') + '\n    <!-- /i18n-alternates -->';
  s = s.replace(/[ \t]*<!-- i18n-alternates -->[\s\S]*?<!-- \/i18n-alternates -->\n?/, '');
  s = s.replace(/[ \t]*<link rel="alternate" hreflang="[^"]+" href="[^"]+"\s*\/?>\n/g, '');
  const m = s.match(/([ \t]*)<link rel="canonical"[^>]*>\n/);
  if (!m) throw new Error(`${file}: canonical 없음`);
  s = s.replace(m[0], m[0] + m[1] + block + '\n');
  fs.writeFileSync(path.join(ROOT, file), s);
}

function clearSourceHead(key) {
  const file = key.slice(1), s = read(file);
  const t = s.replace(/[ \t]*<!-- i18n-alternates -->[\s\S]*?<!-- \/i18n-alternates -->\n?/, '');
  if (t !== s) fs.writeFileSync(path.join(ROOT, file), t);
}

function updateSitemap(urls) {
  let s = read('sitemap.xml');
  // 이번에 만들지 않은 /en/·/ja/ 항목은 뺀다
  s = s.replace(new RegExp(`  <url>\\n    <loc>${ORIGIN.replace(/[.]/g, '\\.')}/(${LANGS.join('|')})/[^<]*</loc>[\\s\\S]*?</url>\\n`, 'g'), m => urls.some(u => m.includes(`<loc>${u}</loc>`)) ? m : '');
  const today = new Date().toISOString().slice(0, 10);
  const add = urls.filter(u => !s.includes(`<loc>${u}</loc>`));
  s = s.replace('</urlset>', add.map(u => `  <url>\n    <loc>${u}</loc>\n    <lastmod>${today}</lastmod>\n  </url>\n`).join('') + '</urlset>');
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), s);
  return add.length;
}

/** 원본 언어(<html lang>)를 뺀 나머지 언어로 번역본을 만든다. 영어 원문 페이지는 /ja/ 만 생긴다. */
const srcLangOf = key => ((read(key.slice(1)).match(/<html[^>]*\blang="([a-z]{2})/i) || [])[1] || 'ko').toLowerCase();
const langsOf = key => LANGS.filter(l => l !== srcLangOf(key));

async function build(browser, base, candidates = pages) {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const results = {};
  const has = (key, lang) => candidates.includes(key) && langsOf(key).includes(lang);
  for (const key of candidates) {
    const cp = canonicalPath(key);
    const canonRoot = ORIGIN + cp;
    const src = srcLangOf(key), langs = langsOf(key);
    const alternates = [...['ko', 'en', 'ja'].flatMap(l => l === src ? [[l, canonRoot]] : langs.includes(l) ? [[l, `${ORIGIN}/${l}${cp}`]] : []), ['x-default', canonRoot]];
    const doctype = (read(key.slice(1)).match(/^<!DOCTYPE[^>]*>/i) || ['<!DOCTYPE html>'])[0];
    results[key] = {};
    for (const lang of langs) {
      const page = await ctx.newPage();
      await page.goto(base + key, { waitUntil: 'load' });
      const out = await page.evaluate(transform, {
        lang, map: content[key][lang], st: siteTranslations[lang], variantPaths: candidates.filter(k => has(k, lang)), origin: ORIGIN, canonRoot,
        variantUrl: `${ORIGIN}/${lang}${cp}`, locale: LOCALE[lang], otherLocales: alternates.filter(([l]) => l !== lang && l !== 'x-default').map(([l]) => LOCALE[l]), alternates,
      });
      await page.close();
      results[key][lang] = { ...out, doctype, alternates, cp };
    }
  }
  await ctx.close();
  // 한 언어라도 한글이 남으면 그 페이지는 만들지 않는다(반쪽 번역본이 색인되는 것을 막는다).
  const ok = candidates.filter(key => langsOf(key).every(l => results[key][l].left.length === 0));
  const skipped = candidates.filter(key => !ok.includes(key)).map(key =>
    [key, langsOf(key).flatMap(l => results[key][l].left.map(t => `${l}: ${t}`)), langsOf(key).flatMap(l => results[key][l].missing)]);
  // 링크 대상은 실제로 만드는 페이지만: 빠진 페이지가 있으면 그 집합으로 다시 만든다.
  if (ok.length !== candidates.length) {
    const r = await build(browser, base, ok);
    return { ...r, skipped: [...skipped, ...r.skipped] };
  }
  const made = [];
  for (const key of ok) {
    for (const lang of langsOf(key)) {
      const r = results[key][lang];
      const file = path.join(ROOT, lang, key.slice(1));
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, `${r.doctype}\n<!-- 생성 파일: scripts/build-i18n-pages.cjs 가 ${key} 와 i18n-content.json 으로 만든다. 직접 고치지 말 것. -->\n${r.html}\n`);
      made.push(`/${lang}${key}`);
    }
    updateSourceHead(key, results[key][langsOf(key)[0]].alternates);
  }
  // 이번에 만들지 않은 번역본·hreflang·sitemap 항목은 지운다(대상에서 빠진 페이지가 남지 않게).
  const removed = [];
  for (const lang of LANGS) {
    const dir = path.join(ROOT, lang);
    if (!fs.existsSync(dir)) continue;
    const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
      const f = path.join(d, e.name);
      if (e.isDirectory()) return walk(f);
      const rel = '/' + path.relative(ROOT, f);
      if (e.name.endsWith('.html') && !made.includes(rel)) { fs.unlinkSync(f); removed.push(rel); }
    });
    walk(dir);
  }
  for (const key of Object.keys(content)) if (!ok.includes(key) && fs.existsSync(path.join(ROOT, key.slice(1)))) clearSourceHead(key);
  const urls = ok.flatMap(key => langsOf(key).map(l => `${ORIGIN}/${l}${results[key][l].cp}`));
  const added = updateSitemap(urls);
  return { made, skipped, added, removed };
}

/** JS 를 켠 상태로 번역본을 열어 확인한다. 실패 목록만 출력한다(판정은 사람이). */
async function check(browser, base) {
  const variants = [];
  for (const lang of LANGS) {
    const dir = path.join(ROOT, lang);
    if (!fs.existsSync(dir)) continue;
    const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.html') && variants.push([lang, '/' + path.relative(ROOT, path.join(d, e.name))]));
    walk(dir);
  }
  const problems = [];
  const exists = p => { let f = decodeURIComponent(p); if (f.endsWith('/')) f += 'index.html'; return fs.existsSync(path.join(ROOT, f)); };
  const hreflangOf = f => [...read(f.slice(1)).matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)].map(m => m[1] + '=' + m[2]).sort().join(' ');
  const ctx = await browser.newContext();
  await ctx.route(u => !u.href.startsWith(base), r => r.abort());
  for (const [lang, file] of variants) {
    const page = await ctx.newPage();
    const failed = [];
    page.on('response', r => { if (r.url().startsWith(base) && r.status() >= 400) failed.push(r.status() + ' ' + r.url().slice(base.length)); });
    page.on('pageerror', e => failed.push('pageerror ' + e.message.slice(0, 80)));
    await page.goto(base + file, { waitUntil: 'load' });
    await page.waitForTimeout(400);
    const info = await page.evaluate(() => (document.querySelectorAll('[data-no-i18n]').forEach(e => { e.style.display = 'none'; }), {
      lang: document.documentElement.lang,
      canon: document.querySelector('link[rel="canonical"]')?.href,
      left: [...new Set(document.body.innerText.split('\n').filter(s => /[가-힣]/.test(s) && !/^(한|EN|日)$/.test(s.trim())))].slice(0, 3),
      links: [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')).filter(h => h.startsWith('/') && !h.startsWith('//')),
    }));
    await page.close();
    const src = file.replace(/^\/(en|ja)\//, '/');
    const want = ORIGIN + file.replace(/index\.html$/, '');
    const issues = [...failed];
    if (info.lang !== lang) issues.push(`html lang=${info.lang}`);
    if (!info.canon || (info.canon !== want && info.canon !== ORIGIN + file)) issues.push(`canonical ${info.canon}`);
    if (info.left.length) issues.push('한글 남음: ' + info.left.join(' / '));
    const dead = [...new Set(info.links.map(h => h.split('#')[0].split('?')[0]).filter(h => h && !exists(h)))];
    if (dead.length) issues.push('죽은 링크: ' + dead.join(' '));
    if (hreflangOf(file) !== hreflangOf(src)) issues.push('hreflang 이 원본과 다름');
    const raw = read(file.slice(1));
    const nCanon = (raw.match(/<link rel="canonical"/g) || []).length, nAlt = (raw.match(/<link rel="alternate" hreflang=/g) || []).length;
    const srcAlt = (read(src.slice(1)).match(/<link rel="alternate" hreflang=/g) || []).length;
    if (nCanon !== 1 || nAlt !== srcAlt || nAlt < 3) issues.push(`canonical ${nCanon}개, alternate ${nAlt}개(원본 ${srcAlt}개)`);
    if (issues.length) problems.push([file, issues]);
  }
  // 언어 버튼: 번역본으로 이동하는지 한 페이지에서 확인
  const nav = [];
  if (variants.length) {
    const page = await ctx.newPage();
    const sample = variants.find(([l]) => l === 'en')[1].replace(/^\/en/, '');
    await page.goto(base + sample, { waitUntil: 'load' });
    await page.waitForSelector('.lang-btn[data-lang="en"]');
    await Promise.all([page.waitForNavigation(), page.click('.lang-btn[data-lang="en"]')]);
    nav.push('ko→en ' + new URL(page.url()).pathname);
    await Promise.all([page.waitForNavigation(), page.click('.lang-btn[data-lang="ja"]')]);
    nav.push('en→ja ' + new URL(page.url()).pathname);
    await Promise.all([page.waitForNavigation(), page.click('.lang-btn[data-lang="ko"]')]);
    nav.push('ja→ko ' + new URL(page.url()).pathname);
    await page.close();
  }
  await ctx.close();
  return { checked: variants.length, problems, nav };
}

(async () => {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    if (!CHECK_ONLY) {
      const r = await build(browser, base);
      console.log(`생성 ${r.made.length}개, sitemap 추가 ${r.added}, 지운 옛 번역본 ${r.removed.length}개 ${r.removed.join(' ')}`);
      fs.writeFileSync(path.join(ROOT, '_qa', 'i18n-missing.json'), JSON.stringify(Object.fromEntries(r.skipped.map(([k, , nodes]) => [k, nodes])), null, 1));
      for (const [key, left] of r.skipped) console.log(`건너뜀 ${key}: 한글 ${left.length}줄 — ${left.slice(0, 2).join(' | ')}`);
    }
    const c = await check(browser, base);
    console.log(`검사 ${c.checked}개, 문제 ${c.problems.length}개`);
    for (const [f, issues] of c.problems) console.log(`  ${f}: ${issues.join(' ; ')}`);
    console.log('언어 버튼: ' + c.nav.join(', '));
    process.exitCode = c.problems.length ? 1 : 0;
  } finally {
    await browser.close();
    server.close();
  }
})();
