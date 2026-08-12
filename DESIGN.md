# Lumos Site Design System — shadcn/ui Neutral

## 1. Atmosphere & Identity

Lumos uses the official shadcn/ui default Neutral light theme. The design is intentionally unbranded and utilitarian: white background, neutral foreground, neutral primary actions, thin borders, compact radii, and one identical navigation rail on every page.

## 2. Color

All shipped colors come from [sales/tokens.css](sales/tokens.css).

| Role | Token | Value | Usage |
| --- | --- | --- | --- |
| Main surface | `--ls-bg` | `oklch(1 0 0)` | shadcn `background` |
| Elevated surface | `--ls-bg-elevated` | `oklch(0.97 0 0)` | shadcn `secondary` / `muted` |
| Card surface | `--ls-card` | `oklch(1 0 0)` | shadcn `card` |
| Primary text | `--ls-text` | `oklch(0.145 0 0)` | shadcn `foreground` |
| Secondary text | `--ls-muted` | `oklch(0.556 0 0)` | shadcn `muted-foreground` |
| Primary action | `--ls-accent` | `oklch(0.205 0 0)` | shadcn `primary` |
| Primary action text | `--ls-accent-ink` | `oklch(0.985 0 0)` | shadcn `primary-foreground` |
| Lines | `--ls-border` | `oklch(0.922 0 0)` | shadcn `border` / `input` |
| Status | `--ls-ok`, `--ls-warn`, `--ls-danger` | semantic ramp | State only |

Product pages do not override the palette. Raw page-local colors are reserved only for semantic status, data visualization, spreadsheet samples, or functional color output such as the color picker preview.

## 3. Typography

- Primary: `--ls-font`, a system UI stack with Apple SD Gothic Neo and Malgun Gothic for Korean.
- Mono: `--ls-font-mono`.
- Display/H1: `clamp(1.6rem, 4.6vw, 2.1rem)`, weight 700, `--ls-lh-tight`.
- H2: 1.15rem, weight 600–700.
- H3/body lead/body/meta: 1rem / 1.05rem / 1rem / 0.85rem.
- Korean and Japanese content uses `word-break: keep-all`; headings use balanced wrapping and paragraphs use pretty wrapping where supported.

## 4. Spacing & Layout

- Base unit: 4px, expressed by `--ls-space-1` through `--ls-space-6`.
- Reading wrapper: `--ls-wrap: 760px`; wide/product wrapper: `--ls-wrap-wide: 960px`.
- Page gutter: 20px desktop/tablet, 16px at narrow mobile.
- Breakpoints: 520px for sticky CTA content, 640px for grids, 900px for desktop sticky behavior.
- Wide tables own their horizontal scrolling through `.ls-table-scroll`; the document itself must never overflow horizontally.

## 5. Components

### Site navigation

- Structure: `.ls-nav > .ls-nav__inner > .ls-brand + ul`.
- Variants: none. Every page uses the same width, height, color, and six links.
- States: default, hover, `aria-current="page"`, keyboard focus.
- Accessibility: named `nav`, skip link before it, 44px minimum language controls, visible focus.
- Layout: sticky cluster; on narrow screens the link row scrolls within the rail rather than widening the document.

### Page wrapper

- Structure: `main.ls-wrap`, optionally `.ls-wrap--wide` or `.ls-wrap--product`.
- Layout: centered reading column with intrinsic-width children and explicit table scroll owners.

### Cards, buttons, callouts, tables, footer

- Source: reusable `.ls-card`, `.ls-btn`, `.ls-callout`, `.ls-table-scroll/.ls-table`, and `.ls-foot` primitives in [sales/components.css](sales/components.css).
- States: buttons and links expose hover, active, and focus; tables retain readable scroll; cards do not encode interaction unless they contain an action.
- Footer structure: `.ls-foot > nav + p`, using the same primary site destinations.

### Language selector

- Structure: `.language-selector > button.lang-btn[data-lang]`.
- States: default, hover, active, focus.
- Behavior: supported pages persist `ko|en|ja` in `localStorage.language`, update `html[lang]`, and ignore missing translation keys without throwing.

## 6. Motion & Interaction

- Duration: `--ls-duration: 160ms`; easing: `--ls-ease`.
- Animate only color, opacity, filter, or transform.
- Sticky navigation has no decorative movement.
- `prefers-reduced-motion: reduce` removes animation and smooth scrolling.

## 7. Depth & Surface

Strategy: shadcn Neutral surface contrast plus one-pixel borders. The page background is flat `background`; cards use `card` and `border`; controls use `primary`, `secondary`, `input`, and `ring` with no decorative glow.

## 8. Accessibility Constraints & Accepted Debt

- Target: WCAG 2.2 AA, visible keyboard focus, semantic landmarks, skip link, minimum 44px touch controls, reduced-motion support.
- CJK text must not clip or leave one-character orphan lines at 320px.
- All interactive navigation works without JavaScript; JavaScript only enhances language state.

| Item | Location | Why accepted | Owner / Exit |
| --- | --- | --- | --- |
| Full translated copy is available only on language-enabled pages | Existing single-language product/offer pages | Translating every sales document changes business copy and exceeds the requested i18n bug fix | Add per-page dictionaries when translated product copy is commissioned |
