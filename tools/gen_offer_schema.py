#!/usr/bin/env python3
"""offers/products.json -> 각 offers/{id}.html 에 Service+Offer JSON-LD 주입.

AI 쇼핑 에이전트가 카탈로그를 읽을 수 있게 하는 목적.
- serviceType 은 offers/index.html 의 기존 ItemList 에서 가져와 값 불일치를 막는다.
- 문의(=체크아웃) 액션은 페이지에 이미 있는 mailto CTA 를 그대로 재사용한다.
- products.json 은 읽기 전용. 실행은 몇 번을 해도 결과가 같다(기존 블록 교체).
"""
import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OFFERS = ROOT / "offers"
BASE = "https://hwemo-chung.github.io"
PERSON = f"{BASE}/#person"

LD_RE = re.compile(r'\n?\s*<script type="application/ld\+json">.*?</script>', re.S)
CTA_RE = re.compile(r'<a class="ls-btn ls-btn--primary" href="(mailto:[^"]+)"')


def service_types() -> "dict[str, str]":
    """기존 ItemList 에서 id -> serviceType 추출."""
    idx = (OFFERS / "index.html").read_text(encoding="utf-8")
    block = LD_RE.search(idx).group(0)
    data = json.loads(re.search(r"(\{.*\})", block, re.S).group(1))
    out = {}
    for entry in data["itemListElement"]:
        item = entry["item"]
        pid = item["@id"].rsplit("/", 1)[-1].removesuffix(".html#service")
        out[pid] = item.get("serviceType", "")
    return out


def build(product: dict, service_type: str, cta: "str | None") -> dict:
    pid = product["id"]
    url = f"{BASE}/offers/{pid}.html"
    offer = {
        "@type": "Offer",
        "url": url,
        "availability": "https://schema.org/InStock",
        "deliveryLeadTime": product["delivery"],
        "priceSpecification": {
            "@type": "PriceSpecification",
            "priceCurrency": product["price_currency"],
            "minPrice": product["price_min"],
            "maxPrice": product["price_max"],
        },
    }
    node = {
        "@context": "https://schema.org",
        "@type": "Service",
        "@id": f"{url}#service",
        "name": product["name_ko"],
        "alternateName": product["name"],
        "serviceType": service_type,
        "description": product["tagline"],
        "disambiguatingDescription": product["pitch"],
        "url": url,
        "provider": {"@id": PERSON},
        "offers": offer,
    }
    if product.get("needs"):
        # 에이전트가 "무엇을 준비해야 주문 가능한지" 읽을 수 있게 한다.
        offer["additionalProperty"] = [
            {"@type": "PropertyValue", "name": "requiredInput", "value": product["needs"]}
        ]
    if product.get("bullets"):
        node["serviceOutput"] = [{"@type": "Thing", "name": b} for b in product["bullets"]]
    if cta:
        node["potentialAction"] = {
            "@type": "OrderAction",
            "name": "메일로 견적 문의",
            "target": {"@type": "EntryPoint", "urlTemplate": cta},
        }
    return node


def main() -> int:
    products = json.loads((OFFERS / "products.json").read_text(encoding="utf-8"))
    types = service_types()
    missing, written = [], 0

    for p in products:
        page = OFFERS / f"{p['id']}.html"
        if not page.exists():
            missing.append(p["id"])
            continue
        src = page.read_text(encoding="utf-8")
        m = CTA_RE.search(src)
        cta = html.unescape(m.group(1)) if m else None
        node = build(p, types.get(p["id"], ""), cta)
        block = (
            '  <script type="application/ld+json">\n'
            + json.dumps(node, ensure_ascii=False, separators=(",", ":"))
            + "\n  </script>"
        )
        stripped = LD_RE.sub("", src, count=1)
        out = stripped.replace("</head>", block + "\n</head>", 1)
        if out != src:
            page.write_text(out, encoding="utf-8")
            written += 1

    print(f"updated {written}/{len(products)} offer pages")

    # 자체 검증: 다시 읽어서 블록이 1개인지, 가격이 원본과 같은지 확인.
    for p in products:
        page = OFFERS / f"{p['id']}.html"
        if not page.exists():
            continue
        blocks = re.findall(
            r'<script type="application/ld\+json">\s*(\{.*?\})\s*</script>',
            page.read_text(encoding="utf-8"), re.S)
        assert len(blocks) == 1, f"{p['id']}: ld+json blocks={len(blocks)}"
        node = json.loads(blocks[0])
        spec = node["offers"]["priceSpecification"]
        assert (spec["minPrice"], spec["maxPrice"], spec["priceCurrency"]) == (
            p["price_min"], p["price_max"], p["price_currency"]), f"{p['id']}: price mismatch"
        assert node["offers"]["deliveryLeadTime"] == p["delivery"], f"{p['id']}: delivery mismatch"
    print(f"verified {len(products) - len(missing)} pages")

    if missing:
        print("MISSING PAGES:", ", ".join(missing), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
