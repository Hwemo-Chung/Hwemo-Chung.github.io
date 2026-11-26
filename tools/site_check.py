#!/usr/bin/env python3
"""Pre-deploy check for the published site: SEO head tags, AdSense tag, internal links.
Usage: python3 tools/site_check.py   (exit 1 when anything is missing or broken)"""
import pathlib, re, sys
from urllib.parse import urljoin, urlparse, unquote

root = pathlib.Path(__file__).resolve().parent.parent
BASE = 'https://hwemo-chung.github.io/'
ADSENSE = 'ca-pub-3498371918924514'
# The duplicate teagarden account, closed: no page, ads.txt line or meta may name it.
CLOSED_ADSENSE = ('8998804759171463',)
SKIP_DIRS = {'.git', '.omo', '.playwright-cli', '.playwright-mcp', '.claude', 'node_modules', 'lumos-fireworks', 'assets'}
# Redirect stubs and asset sources are not indexable pages.
NOINDEX = {'404.html', 'hotlauncher.html', 'hot-launcher/index.html', 'HotLauncher/index.html', 'google91df428475f19f42.html',
           }
# Pages the owner keeps ad-free on purpose (2026-11-26).
NO_ADS = {'claude-code-kenshu.html'}
# Legal pages: no ads, and they carry one <h1> per language section.
LEGAL = re.compile(r'^(pp|tokushoho|[a-z]+-privacy)\.html$')


def pages():
    for p in sorted(root.rglob('*.html')):
        rel = p.relative_to(root).as_posix()
        if any(part in SKIP_DIRS for part in p.relative_to(root).parts):
            continue
        yield rel, p.read_text(encoding='utf-8', errors='ignore')


def url_of(rel):
    return BASE + (rel[:-len('index.html')] if rel.endswith('index.html') else rel)


def exists(path):
    f = root / path.lstrip('/')
    return f.is_file() or (f / 'index.html').is_file()


problems = []
for rel, html in pages():
    if rel in NOINDEX:
        continue
    head = html.split('</head>')[0]
    if 'name="robots" content="noindex' in head:
        continue
    need = {
        'title': re.search(r'<title>[^<]{5,}</title>', head),
        'description': re.search(r'<meta name="description" content="[^"]{20,}"', head),
        'canonical': re.search(r'<link rel="canonical" href="([^"]+)"', head),
        'og:title': 'property="og:title"' in head,
        'og:image': 'property="og:image"' in head,
        'adsense': ADSENSE in head or LEGAL.match(rel) or rel in NO_ADS,
        'lang': re.search(r'<html[^>]* lang="', html),
        'h1': len(re.findall(r'<h1[\s>]', html)) == 1 or LEGAL.match(rel),
    }
    for k, ok in need.items():
        if not ok:
            problems.append(f'{rel}: missing {k}')
    m = need['canonical']
    if m and m.group(1) != url_of(rel) and rel != '404.html':
        problems.append(f'{rel}: canonical {m.group(1)} != {url_of(rel)}')
    for href in re.findall(r'(?:href|src)="([^"#?]+)', html):
        if href.startswith(('mailto:', 'tel:', 'data:', 'javascript:', 'blob:')) or '${' in href:
            continue
        u = urlparse(urljoin(url_of(rel), href))
        if u.netloc and u.netloc != urlparse(BASE).netloc:
            continue
        if not exists(unquote(u.path)):
            problems.append(f'{rel}: broken link {href}')

for rel, html in pages():
    for pid in CLOSED_ADSENSE:
        if pid in html:
            problems.append(f'{rel}: closed AdSense id pub-{pid}')
ads_txt = (root / 'ads.txt').read_text(encoding='utf-8')
for pid in CLOSED_ADSENSE:
    if pid in ads_txt:
        problems.append(f'ads.txt: closed AdSense id pub-{pid}')
if f"google.com, {ADSENSE.removeprefix('ca-')}, DIRECT, f08c47fec0942fa0" not in ads_txt.splitlines():
    problems.append('ads.txt: missing the main account line')

print('\n'.join(problems) or 'ok')
sys.exit(1 if problems else 0)
