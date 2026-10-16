#!/usr/bin/env python3
"""Fill missing Open Graph / Twitter tags from each page's own <title>, description and canonical,
then rebuild sitemap.xml from the indexable pages. Idempotent: existing tags are left alone.
Usage: python3 tools/seo_build.py"""
import datetime, html, pathlib, re, subprocess

root = pathlib.Path(__file__).resolve().parent.parent
BASE = 'https://hwemo-chung.github.io/'
SKIP_DIRS = {'.git', '.omo', '.playwright-cli', '.playwright-mcp', '.claude', 'node_modules', 'lumos-fireworks', 'assets'}
NOINDEX = {'404.html', 'hotlauncher.html', 'hot-launcher/index.html', 'HotLauncher/index.html',
           'google91df428475f19f42.html', }


def og_image(rel):
    if rel.startswith('tools/'):
        return BASE + 'assets/og-tools.png'
    if rel.startswith('hot-launcher'):
        return BASE + 'assets/hot-launcher-og.png'
    return BASE + 'assets/og-lumos.png'


def lastmod(path):
    out = subprocess.run(['git', 'log', '-1', '--format=%cs', '--', str(path)], cwd=root, capture_output=True, text=True).stdout.strip()
    # Uncommitted pages are being published today.
    dirty = subprocess.run(['git', 'status', '--porcelain', '--', str(path)], cwd=root, capture_output=True, text=True).stdout.strip()
    return datetime.date.today().isoformat() if dirty or not out else out


urls = []
for p in sorted(root.rglob('*.html')):
    rel = p.relative_to(root).as_posix()
    if any(part in SKIP_DIRS for part in p.relative_to(root).parts) or rel in NOINDEX:
        continue
    src = p.read_text(encoding='utf-8')
    head, sep, rest = src.partition('</head>')
    if not sep or 'name="robots" content="noindex' in head:
        continue
    canonical = re.search(r'<link rel="canonical" href="([^"]+)"', head)
    title = re.search(r'<title>([^<]+)</title>', head)
    desc = re.search(r'<meta name="description" content="([^"]+)"', head)
    if canonical:
        urls.append((canonical.group(1), lastmod(p)))
    if not (canonical and title and desc):
        continue
    t, d, u = html.unescape(title.group(1)), html.unescape(desc.group(1)), canonical.group(1)
    tags = {
        'property="og:type"': f'<meta property="og:type" content="website">',
        'property="og:site_name"': '<meta property="og:site_name" content="Lumos">',
        'property="og:title"': f'<meta property="og:title" content="{html.escape(t)}">',
        'property="og:description"': f'<meta property="og:description" content="{html.escape(d)}">',
        'property="og:url"': f'<meta property="og:url" content="{u}">',
        'property="og:image"': f'<meta property="og:image" content="{og_image(rel)}">',
        'name="twitter:card"': '<meta name="twitter:card" content="summary_large_image">',
    }
    add = [tag for key, tag in tags.items() if key not in head]
    if add:
        indent = re.search(r'\n([ \t]*)<link rel="canonical"', head)
        pad = indent.group(1) if indent else ''
        p.write_text(head.rstrip() + '\n' + '\n'.join(pad + a for a in add) + '\n' + sep + rest, encoding='utf-8')

seen, rows = set(), []
for u, d in sorted(urls, key=lambda x: (x[0] != BASE, x[0])):
    if u in seen:
        continue
    seen.add(u)
    rows.append(f'  <url>\n    <loc>{u}</loc>\n    <lastmod>{d}</lastmod>\n  </url>')
(root / 'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                                  + '\n'.join(rows) + '\n</urlset>\n', encoding='utf-8')
print(len(rows), 'urls in sitemap')
