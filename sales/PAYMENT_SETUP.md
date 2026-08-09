# 결제 세팅 체크리스트 (본인 10~30분)

랜딩은 이미 “Invoice before work”를 말합니다.  
**라이브 결제 URL이 없으면 전환이 샌다.** 아래 중 **하나만** 오늘 연결.

---

## 옵션 A — PayPal (가장 빠름)

1. https://www.paypal.com/paypalme 로 링크 생성  
2. 예: `https://paypal.me/YOURID/400` (pilot USD)  
3. `sales/payment-links.json` 에 기입 (아래)  
4. retainer / cordova CTA가 파일을 읽어 버튼을 붙임

## 옵션 B — Stripe Payment Link

1. Stripe Dashboard → Payment Links  
2. Pilot $400 · Stabilizer $1200 one-time or subscription  
3. URL을 `payment-links.json`에

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
