# 결제 세팅 체크리스트 (본인 10~30분)

랜딩은 이미 “Invoice before work”를 말합니다.  
**라이브 결제 URL이 없으면 전환이 샌다.** 아래 중 **하나만** 오늘 연결.

---

## 옵션 A — PayPal (가장 빠름)

1. https://www.paypal.com/paypalme 로 링크 생성  
2. 예: `https://paypal.me/YOURID/400` (pilot USD)  
3. `sales/payment-links.json` 에 기입 (아래)  
4. retainer / cordova CTA가 파일을 읽어 버튼을 붙임

## 옵션 B — Stripe Payment Link  ✅ 통합 검증 완료 (2026-08-17, 테스트 모드)

Stripe MCP 로 상품·결제링크를 만들고 4242 테스트 카드로 체크아웃까지 성공 확인.

- 상품: `Mobile Production Retainer — Pilot`(단건 $400), `Mobile Production Retainer — Stabilizer`(구독 $1,200/월)
- 계정: `Lumos sandbox`(테스트). **라이브 링크가 아니므로 아직 사이트에 걸지 않음** —
  공개 사이트에 테스트 링크를 걸면 방문객이 "TEST MODE" 화면만 보고 실결제가 안 된다.

**라이브 전환 (1줄로 끝남):**
1. Stripe Dashboard 에서 계정 활성화 (한국은 사업자등록 필요) → 테스트→라이브 토글
2. Payment Links 에서 Pilot/Stabilizer LIVE 링크 생성 (`https://buy.stripe.com/...`, `test_` 없음)
3. `payment-links.json` 의 `pilot_usd`, `stabilizer_usd` 에 붙여넣기 → `payment.js` 가 자동으로 "Pay" 버튼 노출
4. 본인 실카드로 1회 결제/환불 테스트 후 공지

라이브 활성화 전 가장 빠른 실결제 경로는 옵션 A(PayPal.me).

## 옵션 C — Wise / 계좌 이체

1. 청구서 템플릿(아래)만으로 시작 가능  
2. 입금 확인 후 킥오프 메일

## 옵션 D — 크몽 안전결제

1. `kmong-listings.md` 상품 등록  
2. 크몽이 결제·세금계산 처리

---

## payment-links.json

저장소의 `sales/payment-links.json`을 편집:

```json
{
  "pilot_usd": "",
  "stabilizer_usd": "",
  "diag_paid_krw": "",
  "threads_report_krw": "",
  "note": "비우면 mailto 인보이스 플로우 유지"
}
```

**시크릿·개인 계좌번호는 git에 넣지 말 것.** PayPal.me / Stripe public link만.

---

## 인보이스 메일 템플릿 (EN pilot)

```
Subject: Invoice — Pilot $400 — {Product}

Scope (one issue class): {…}
Hours: ~6 within 7 days
Amount: USD 400
Pay: {payment link or Wise/bank instructions}
Start: after payment cleared

Out of scope: greenfield rewrite, 24/7 on-call, store account ownership transfer
```

## 인보이스 메일 템플릿 (KO 연장)

```
제목: 견적 — Play 정책 대응 안내

범위: 연장 체크리스트 + 콘솔 문구 + 로드맵 1p
금액: {N}원
입금: {크몽 / 계좌 / 링크}
착수: 입금 확인 후
```

---

## 완료 정의

- [ ] payment-links.json에 공개 링크 ≥1 또는 크몽 상품 라이브  
- [ ] 본인 테스트 결제/취소 1회  
- [ ] retainer·cordova에 “Pay” 버튼 노출 확인
