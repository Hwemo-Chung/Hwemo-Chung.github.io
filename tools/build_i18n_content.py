# /// script
# requires-python = ">=3.13"
# dependencies = []
# ///
# ─── How to run ───
# uv run tools/build_i18n_content.py

from __future__ import annotations

import json
import re
import sys
import time
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent.parent
LANGS = ("ko", "en", "ja")
SKIP = {"script", "style", "code", "pre", "kbd", "samp", "svg"}
MARK = re.compile(r"\[\[\[I(\d+)\]\]\]")

NEVER_TRANSLATE = {
    "Lumos", "Burnline", "LUMOS!", "Lumos!",
    "Angular", "Ionic", "Capacitor", "Cordova", "Firebase", "React",
    "Supabase", "WebSocket", "localStorage", "Android", "Ghost",
    "Apple", "Monaco Editor", "Stabilizer", "Scale", "Pilot",
    "@Hwemo-Chung", "EN", "HEX", "ID", "ok", "OVER",
    "sales/", "retainer.html", "components.css", "tokens.css",
    "SYSTEM.md", "OUTREACH.md", "offers.json",
    "한", "日", "日本語",
}


class VisibleText(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.stack: list[tuple[str, dict[str, str | None]]] = []
        self.values: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        self.stack.append((tag, values))
        for key in ("placeholder", "title", "aria-label"):
            self.add(values.get(key))
        if tag == "meta" and (
            values.get("name") == "description"
            or values.get("property") in {"og:title", "og:description"}
            or values.get("name") in {"twitter:title", "twitter:description"}
        ):
            self.add(values.get("content"))

    def handle_endtag(self, tag: str) -> None:
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index][0] == tag:
                self.stack = self.stack[:index]
                break

    def handle_data(self, data: str) -> None:
        if any(tag in SKIP for tag, _ in self.stack):
            return
        if any("data-i18n" in attrs for _, attrs in self.stack):
            return
        if any(tag == "section" and attrs.get("id") in LANGS for tag, attrs in self.stack):
            return
        self.add(data)

    def add(self, value: str | None) -> None:
        if value is None:
            return
        text = " ".join(value.split())
        if text and not re.fullmatch(r"[\d\W_]+", text):
            if len(text) == 1 and text.isascii():
                return
            self.values.append(text)


def pages() -> list[Path]:
    result: list[Path] = []
    for path in sorted(ROOT.rglob("*.html")):
        relative = path.relative_to(ROOT).as_posix()
        source = path.read_text()
        if relative.startswith((".omo/", "mocks/")):
            continue
        if relative.startswith("google") or "site-unified.css" not in source:
            continue
        result.append(path)
    return result


def source_language(value: str) -> str:
    if re.search(r"[가-힣]", value):
        return "ko"
    if re.search(r"[ぁ-んァ-ヶ]", value):
        return "ja"
    return "en"


def translate(values: list[str], source: str, lang: str) -> dict[str, str]:
    if source == lang:
        return dict(zip(values, values, strict=True))
    translated: dict[str, str] = {}
    for start in range(0, len(values), 20):
        batch = values[start : start + 20]
        payload = "\n".join(f"[[[I{index}]]] {value}" for index, value in enumerate(batch))
        query = urlencode({"client": "gtx", "sl": source, "tl": lang, "dt": "t", "q": payload})
        try:
            response = urlopen(f"https://translate.googleapis.com/translate_a/single?{query}", timeout=30)
            body = json.loads(response.read())
            response.close()
        except (HTTPError, URLError) as error:
            raise RuntimeError(f"translation request failed: {source} -> {lang}") from error
        output = "".join(item[0] for item in body[0])
        matches = list(MARK.finditer(output))
        if len(matches) != len(batch):
            raise RuntimeError(f"translation markers lost: {lang} {start}")
        for position, match in enumerate(matches):
            end = matches[position + 1].start() if position + 1 < len(matches) else len(output)
            value = output[match.end() : end].strip()
            translated[batch[int(match.group(1))]] = value or translate_one(batch[int(match.group(1))], source, lang)
        time.sleep(0.05)
    return translated


def translate_one(value: str, source: str, lang: str) -> str:
    query = urlencode({"client": "gtx", "sl": source, "tl": lang, "dt": "t", "q": value})
    try:
        response = urlopen(f"https://translate.googleapis.com/translate_a/single?{query}", timeout=30)
        body = json.loads(response.read())
        response.close()
    except (HTTPError, URLError) as error:
        raise RuntimeError(f"translation request failed: {source} -> {lang}") from error
    return "".join(item[0] for item in body[0]).strip()


def main() -> None:
    overrides_path = ROOT / "tools" / "i18n-overrides.json"
    overrides = json.loads(overrides_path.read_text()) if overrides_path.exists() else {}

    page_values: dict[str, list[str]] = {}
    originals: list[str] = []
    for path in pages():
        parser = VisibleText()
        parser.feed(path.read_text())
        values = list(dict.fromkeys(parser.values))
        page_values["/" + path.relative_to(ROOT).as_posix()] = values
        originals.extend(values)
    unique = list(dict.fromkeys(originals))

    all_values = set(unique)
    to_translate = [v for v in unique if v not in NEVER_TRANSLATE]
    by_source = {lang: [v for v in to_translate if source_language(v) == lang] for lang in LANGS}

    dictionaries = {
        lang: {
            source: translated
            for source_lang in LANGS
            for source, translated in translate(by_source[source_lang], source_lang, lang).items()
        }
        for lang in LANGS
    }

    for nt in NEVER_TRANSLATE:
        if nt in all_values:
            for lang in LANGS:
                dictionaries[lang][nt] = nt

    for source, corrections in overrides.items():
        if source not in all_values:
            continue
        for lang, value in corrections.items():
            if lang in dictionaries:
                dictionaries[lang][source] = value

    content = {
        page: {
            lang: {source: dictionaries[lang][source] for source in values if source in dictionaries[lang]}
            for lang in LANGS
        }
        for page, values in page_values.items()
    }

    dead = [k for k in overrides if k not in all_values]
    if dead:
        print(f"✗ {len(dead)} dead override keys (no matching source):", file=sys.stderr)
        for k in dead:
            print(f"  {k!r}", file=sys.stderr)

    en_sources = [v for v in unique if source_language(v) == "en" and v not in NEVER_TRANSLATE]
    covered = set(overrides.keys()) | NEVER_TRANSLATE
    uncovered = [s for s in en_sources if s not in covered]
    if uncovered:
        print(f"⚠ {len(uncovered)} English-source strings without override:", file=sys.stderr)
        for s in uncovered[:30]:
            ko = dictionaries["ko"].get(s, "?")
            print(f"  {s!r} → {ko!r}", file=sys.stderr)
        if len(uncovered) > 30:
            print(f"  ... and {len(uncovered) - 30} more", file=sys.stderr)

    target = ROOT / "i18n-content.json"
    target.write_text(json.dumps(content, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"wrote {target.name}: {len(content)} pages, {len(unique)} source strings", file=sys.stderr)


if __name__ == "__main__":
    main()
