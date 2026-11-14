#!/usr/bin/env python3
"""Rebuild the tool lists on /tools/index.html and the homepage from each tool's <h1> and meta description.
Grouping and order come from tools/ORDER ("# 그룹" lines followed by slugs)."""
import html, pathlib, re

root = pathlib.Path(__file__).resolve().parent.parent
esc = html.escape

info = {}
for page in sorted((root / 'tools').glob('*/index.html')):
    src = page.read_text(encoding='utf-8')
    h1 = re.search(r'<h1[^>]*>(.*?)</h1>', src, re.S)
    if not h1:
        raise SystemExit(f'no <h1> in {page}')
    desc = re.search(r'<meta name="description" content="([^"]*)"', src)
    info[page.parent.name] = (html.unescape(re.sub(r'<[^>]+>', '', h1.group(1)).strip()),
                              html.unescape(desc.group(1)) if desc else '')

groups, seen = [], set()
for line in (root / 'tools' / 'ORDER').read_text(encoding='utf-8').splitlines():
    line = line.strip()
    if line.startswith('#'):
        groups.append((line.lstrip('# '), []))
    elif line:
        if line not in info:
            raise SystemExit(f'ORDER lists {line} but tools/{line}/index.html is missing')
        groups[-1][1].append(line)
        seen.add(line)
missing = sorted(set(info) - seen)
if missing:
    raise SystemExit(f'not in ORDER: {missing}')

def sub(path, block):
    text = path.read_text(encoding='utf-8')
    new, n = re.subn(r'<!-- TOOLS:START -->.*?<!-- TOOLS:END -->', lambda _: f'<!-- TOOLS:START -->\n{block}\n<!-- TOOLS:END -->', text, flags=re.S)
    if n != 1:
        raise SystemExit(f'TOOLS markers not found once in {path}')
    path.write_text(new, encoding='utf-8')

sub(root / 'index.html', '<ul class="tool-index" data-no-i18n>\n' + '\n'.join(
    f'<li><a href="/tools/{s}/">{esc(info[s][0])}<span>{esc(g)}</span></a></li>' for g, ss in groups for s in ss) + '\n</ul>')

sub(root / 'tools' / 'index.html', '\n'.join(
    f'<section class="group"><h2>{esc(g)}</h2><ul>\n' + '\n'.join(
        f'<li><a href="{s}/"><strong>{esc(info[s][0])}</strong><span>{esc(info[s][1])}</span></a></li>' for s in ss)
    + '\n</ul></section>' for g, ss in groups))
sub(root / 'llms.txt', '\n'.join(
    f'- {info[s][0]}: {info[s][1]} https://hwemo-chung.github.io/tools/{s}/' for _, ss in groups for s in ss))
print(sum(len(ss) for _, ss in groups), 'tools in', len(groups), 'groups')
