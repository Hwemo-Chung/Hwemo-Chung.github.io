#!/usr/bin/env python3
"""Static security scan of the published site files. Prints findings; exit 1 if any."""
import pathlib, re, sys

root = pathlib.Path(__file__).resolve().parent.parent
skip = {'.git', '.omo', '.playwright-cli', '.playwright-mcp', '.ruff_cache', '.claude', 'node_modules', '.codegraph'}
exts = {'.html', '.js', '.json', '.css', '.txt', '.xml', '.md', '.py'}
checks = [
    ('secret', re.compile(r'ghp_[A-Za-z0-9]{20}|github_pat_[A-Za-z0-9_]{20}|sk-[A-Za-z0-9]{20}|AKIA[0-9A-Z]{16}|xox[bp]-[0-9A-Za-z-]{10}|-----BEGIN [A-Z ]*PRIVATE KEY|AIza[0-9A-Za-z_-]{35}')),
    ('blank-no-noopener', re.compile(r'<a\b(?=[^>]*target="_blank")(?![^>]*rel="[^"]*noopener)[^>]*>')),
    ('insecure-http', re.compile(r'(?:src|href|action)="http://(?!127\.0\.0\.1|localhost)[^"]+"')),
    ('eval', re.compile(r'\beval\s*\(|new Function\s*\(')),
    ('internal-word', re.compile(r'CAINZ|カインズ|카인즈|upsell|업셀|kill[_ ]list', re.I)),
]
hits = []
for p in sorted(root.rglob('*')):
    rel = p.relative_to(root)
    if not p.is_file() or p.suffix not in exts or any(part in skip for part in rel.parts):
        continue
    if rel.parts[0] == 'tools' and p.suffix == '.py':
        continue
    text = p.read_text(encoding='utf-8', errors='ignore')
    for name, rx in checks:
        for m in rx.finditer(text):
            line = text.count('\n', 0, m.start()) + 1
            hits.append(f'{name}\t{rel}:{line}\t{m.group(0)[:100]}')
print('\n'.join(hits) or 'clean')
sys.exit(1 if hits else 0)
