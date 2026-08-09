# Lumos Sales Design System

**Version:** 1.0 · **Date:** 2026-08-09  
**Brand contact:** tolaria@naver.com  
**Git author policy:** `Chung Hwemo <tolaria@naver.com>` only (author + committer)

---

## 1. Purpose

One system for every paid offer page, hub, and outbound message:

1. **Visual** — tokens + components (`tokens.css`, `components.css`)
2. **Commercial** — offer catalog (`offers.json`)
3. **Copy rules** — fact-checked claims only
4. **Funnel** — self-check → free “what” → paid “how”

Portfolio home (`style.css` gold) stays separate. Sales surfaces use **blue action + gold warn**.

---

## 2. Positioning

| | KO | EN |
|---|----|----|
| **One line** | 실기기·스토어·레거시 하이브리드 프로덕션 | Real-device Ionic/Capacitor/WebView production |
| **Not** | 그린필드 외주·에뮬레이터 데모 | Greenfield pitch decks |
| **Proof style** | 공개 APK·스토어·공식 문서 | Same |

**Pillars (capability map)**

| Pillar | Offer IDs | Page |
|--------|-----------|------|
| A. Store policy & legacy hybrid | diag-free, play-extension, android-target-bump, capacitor-migrate, deeplink-repair | cordova.html |
| B. Production retainer | retainer-pilot, retainer-monthly | retainer.html |
| C. Productized tools | threads-*, burnline | threads / burnline |
| D. Portfolio apps | where, sumiwake, … | separate; not sales CSS |

---

## 3. Visual tokens

| Role | Token | Hex |
|------|-------|-----|
| Background | `--ls-bg` | `#0b0d10` |
| Card | `--ls-card` | `#141a22` |
| Text | `--ls-text` | `#e8eef6` |
| Muted | `--ls-muted` | `#93a0b4` |
| **Action** | `--ls-accent` | `#4d9fff` |
| Success | `--ls-ok` | `#5eead4` |
| **Deadline** | `--ls-warn` | `#fbbf24` |
| Danger | `--ls-danger` | `#f87171` |
| Border | `--ls-border` | `#2a384c` |

**Type:** system UI stack, `word-break: keep-all` for KO.  
**Touch:** buttons min-height 44px.  
**Motion:** respect `prefers-reduced-motion`.

---

## 4. Components (class map)

| Class | Use |
|-------|-----|
| `body.ls` | Enable sales shell |
| `.ls-nav` / `.ls-brand` | Sticky sales nav |
| `.ls-wrap` | 760px content column |
| `.ls-badge` + `.ls-badge__dot` | Status pill |
| `.ls-callout` / `--warn` / `--ok` | Fact boxes |
| `.ls-cta` + `.ls-btn--primary\|ghost` | CTAs |
| `ul.ls-trust` | Checkmarks; `--x` for exclusions |
| `.ls-grid--2\|3` + `.ls-card` | Pricing / steps |
| `.ls-price` | Price display |
| `.ls-table` | Policy / self-check tables |
| `.ls-faq` | Accordion |
| `.ls-funnel` | 4-step funnel |
| `.ls-sticky` | Mobile bottom CTA |
| `.ls-chip` | Offer status tags |
| `.ls-foot` | Sources + legal |

**HTML skeleton**

```html
<link rel="stylesheet" href="sales/tokens.css" />
<link rel="stylesheet" href="sales/components.css" />
<body class="ls">
  <a class="ls-skip" href="#main">…</a>
  <nav class="ls-nav">…</nav>
  <main id="main" class="ls-wrap">…</main>
  <div class="ls-sticky">…</div>
</body>
```

---

## 5. Message rules (non-negotiable)

1. **Primary sources** for dates (Apple / Play / Firebase docs). Blogs can exaggerate.
2. **Deprecated ≠ removed** (Maps JS case — kill list).
3. **Play wording:** new users on devices running **OS higher than app target** — not “all new users worldwide”.
4. **Apple wording:** upload requires Xcode 26 / iOS 26 SDK — not “app deleted from phones”.
5. **Firebase DL:** service ended; ROI only if traffic/print QR evidence.
6. **Free diagnosis = WHAT only.** HOW is paid.
7. **Signing keys stay with customer.**
8. **No employer brand** in sales claims.
9. **Field-only apps:** Play impact may be low — say so.
10. **No Cordova “officially archived”** absolute claim.

---

## 6. Funnel

```
Aware (hub/outbound)
  → Self-check table (30s)
    → Free report: blocked status (10 slots)
      → Entry: Play extension / Pilot $400
        → Mid: target bump / Stabilizer
          → High: Capacitor migrate
```

**CTA subjects (mailto)**

- Free diag: `레거시 앱 무료 진단 신청`
- Pilot EN: `Pilot $400 — one issue class`
- Fit call: `Mobile Production Retainer — fit call`

---

## 7. Offer catalog

Canonical data: [`offers.json`](./offers.json). Hub UI: [`index.html`](./index.html).

**Active priority (cash)**

1. Free diag → paid KO path (cordova)
2. EN pilot $400 (retainer)
3. Threads report service (low friction cash)
4. Products waitlist (threads desktop, burnline) — no force sell

---

## 8. Page inventory

| URL | Role | Design system |
|-----|------|----------------|
| `/sales/` | Hub + gallery + catalog | full |
| `/cordova.html` | KO flagship | full |
| `/retainer.html` | EN flagship | full |
| `/threads-analyzer.html` | Product (gold theme) | full |
| `/burnline.html` | Waitlist (burn theme) | full |
| `/burnline-dashboard.html` | App · token shell | full (burnline-app.css) |
| `/burnline-demo.html` | Sample | full |
| `/` | Portfolio | gold `style.css` (not sales) |

---

## 9. Outbound templates (short)

**KO (diag)**  
> 공개 스토어/APK만으로 iOS 업로드·Play 타겟·죽은 링크 상태를 1장으로 정리합니다. 고치는 방법은 유료 단계입니다. 해당 없으면 해당 없음으로 회신합니다.

**EN (pilot)**  
> One production failure class, ~6h in one week, real devices. $400 pilot. No emulator theatre.

---

## 10. Kill list

See `offers.json` → `kill_list`. Do not reintroduce without new primary sources.

---

## 11. Change process

1. Edit tokens before new colors.  
2. Add component classes before one-off CSS on pages.  
3. Update `offers.json` when price/scope changes.  
4. Re-read §5 before publishing deadline claims.  
5. Commit as `Chung Hwemo <tolaria@naver.com>`.

---

## 12. Files

```
sales/
  tokens.css
  components.css
  offers.json
  SYSTEM.md      ← this file
  index.html     ← living system + hub
```
