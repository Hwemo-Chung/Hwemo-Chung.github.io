# CRM 보드 (복제해서 시트/노션에 붙여넣기)

## 컬럼

| date | name | channel | url_or_email | offer | status | last_touch | next | amount | note |
|------|------|---------|--------------|-------|--------|------------|------|--------|------|
| 2026-08-10 | | linkedin | | diag-free | new | | | 0 | |

## status 값

`new` → `sent` → `replied` → `call` → `proposed` → `won` | `lost` | `nurture`

## offer 값

`diag-free` · `play-extension` · `android-target-bump` · `capacitor-migrate` · `deeplink-repair` · `retainer-pilot` · `retainer-monthly` · `threads-report` · `other`

## 주간 집계 (일요일)

| week | outreach | replies | calls | proposals | won | revenue |
|------|----------|---------|-------|-----------|-----|---------|
| W1 | | | | | | |

## 피벗 규칙

- D30 회신 0 → 채널 교체 (LinkedIn ↔ 크몽)
- D60 입금 0 → 진입가만 판매 (연장 50~150만 / pilot $400)
- 세일즈 주 5h 미만 → 경고, 빌드 중단
