# 크몽 상품 등록 초안 (복붙)

등록 후 URL을 `offers.json` / CRM에 붙일 것.  
**가격은 범위 가설** — 첫 3건 후 조정.

---

## 상품 1 — 레거시 앱 상태 진단 (진입)

**제목:**  
[앱] Cordova/Ionic 레거시 앱 iOS·Play 상태 진단 리포트

**카테고리:** IT·프로그래밍 > 모바일 앱 / 기술 지원  

**가격:** 0원(이벤트) 또는 49,000원 (10곳 이후 유료화)  
**기간:** 2영업일  

**서비스 설명:**

```
■ 이런 분께
· Cordova / Ionic 하이브리드 앱을 운영 중
· 최근 iOS 업로드가 실패하거나 빌드가 깨짐
· Play 타겟 API·정책 메일을 받았음
· 원 개발사가 손을 뗐음

■ 받는 것 (WHAT only)
· 공개 스토어/APK 기준 1장 리포트
· iOS SDK 업로드 위험 여부
· Play 타겟 API 영향(공식 조건 문구 기준)
· page.link 등 죽은 딥링크 유무
· 대략 공수 밴드 (상/중/하)

■ 안 하는 것
· 소스 수정, 패치 코드, 상세 수정 절차
· 서명키·스토어 계정 요구

■ 필요 정보
앱 이름 또는 스토어 링크만

■ 참고
https://hwemo-chung.github.io/cordova.html
```

**수정 요청 예시 답:**  
“상세 수정은 별도 견적입니다. 진단 리포트의 공수 밴드를 보신 뒤 긴급 대응/이전 중 선택하시면 됩니다.”

---

## 상품 2 — Play 연장·정책 안내

**제목:** Play 타겟 API 연장 신청·정책 대응 체크리스트  

**가격:** 150,000 ~ 500,000원 (범위 협의)  
**기간:** 3~5일  

```
■ 포함
· Play Console 연장/정책 관련 체크리스트
· 제출 문구 초안
· 이후 마이그레이션 로드맵 1페이지

■ 제외
· 실제 앱 코드 수정 (상품 3으로)

■ 전제
고객사 Play Console 접근 권한 또는 스크린 공유
```

---

## 상품 3 — 긴급 타겟 API 상향 (Android)

**제목:** Android targetSdk 긴급 상향 (Capacitor 이전 없이)  

**가격:** 3,000,000 ~ 6,000,000원  
**기간:** 협의 (보통 1~3주)  

```
■ 포함
· 타겟 상향 빌드 통과 시도
· 실기기 회귀 체크리스트
· 스토어 제출 준비 (서명·업로드는 고객사 권한 가능)

■ 불가할 수 있음
· 폐기 플러그인 다수, 네이티브 커스텀 과다 → 진단 후 사양 가능
```

---

## 상품 4 — Capacitor 이전

**제목:** Cordova → Capacitor 런타임 이전  

**가격:** 8,000,000 ~ 20,000,000원  
**기간:** 수주~수개월 (규모 따름)  

```
■ 포함
· Cordova → Capacitor 교체
· 플러그인 현행 대체·검증
· 코드 납품 + 인수인계
· 서명키는 고객사 보유 권장

■ 제외
· 전면 UI 리라이트, 신규 기능 개발
```

---

## 상품 5 — Threads 12시트 리포트 대행

**제목:** Threads 계정 분석 엑셀 12시트 리포트  

**가격:** 50,000 ~ 100,000원  
**기간:** 1~3일  

```
■ 포함
· Meta 인사이트 기반 12시트 엑셀
· 중앙값·시간대·글자수 등 (팔로워 100 미만 시 인구통계 제외)

■ 고객 협조
· Meta 개발자 앱/OAuth (본인 계정, 약 10분)
· 부담되면 구매 비추 (랜딩 FAQ와 동일)

■ 안내
https://hwemo-chung.github.io/threads-analyzer.html
CLI 무료: github.com/Hwemo-Chung/threads-analytics
```

---

## 프로필 한 줄

```
실기기 Ionic/Capacitor/WebView · 레거시 Cordova · Play/iOS 스토어 정책.
에뮬레이터 데모가 아니라 릴리스 주 장애와 업로드 봉쇄를 풉니다.
```

---

## 자동화 상품 (Angular / TypeScript / Cron)

등록 시 카테고리: IT·프로그래밍 > 기타 / 자동화 / 스크립트

### A1 — TypeScript 크론 워커 구축

**영문:** TS Cron Worker Pack  
**가격:** ₩400,000 ~ ₩1,200,000  
**기간:** 3~10영업일 (잡 복잡도)

```
Cloudflare Cron / GitHub Actions / 서버 crontab 중 환경에 맞게 주기 작업 1종 가동

■ 납품
· 잡 스펙 1페이지 (입력·출력·실패 정책)
· TypeScript 구현 + 환경변수 목록
· cron / Actions / Workers cron 등록
· 실패 알림(이메일 또는 웹훅) 1채널

■ 예시
· 매일 23:00 매출 CSV 수집
· 1시간마다 헬스체크
· 주 1회 만료 토큰 정리

■ 필요
실행 환경(클라우드/서버) 접근 + 대상 API·시트 권한

■ 상세
https://hwemo-chung.github.io/offers/auto-cron-worker.html
```

### A2 — Angular/TypeScript CI 파이프라인

**영문:** Angular CI Gate  
**가격:** ₩300,000 ~ ₩800,000  
**기간:** 2~5영업일

```
PR마다 lint · test · build 자동 실행, 실패 시 머지 차단

■ 납품
· push/PR 워크플로 YAML
· npm ci + lint + test + build
· Node 버전 매트릭스 또는 고정
· README 실행/트러블슈팅 절

■ 예시
· Angular 18+ 앱
· 라이브러리 패키지 publish dry-run
· 스토리북 빌드 옵션

■ 필요
GitHub/GitLab 저장소 + Actions 권한

■ 상세
https://hwemo-chung.github.io/offers/auto-angular-ci.html
```

### A3 — Google 시트 ↔ API 양방향 동기화

**영문:** Sheet ↔ API Sync  
**가격:** ₩500,000 ~ ₩1,500,000  
**기간:** 1~2주

```
시트를 운영 DB처럼 쓰되, 크론으로 API와 주기 동기화

■ 납품
· 매핑 표 (열 ↔ 필드)
· 증분 동기 / 전체 동기 선택
· 충돌 정책(시트 우선 vs API 우선)
· 스케줄 + 실패 로그 시트

■ 예시
· 재고 시트 → 쇼핑몰 API
· 문의 시트 → CRM
· 출고 상태 역동기

■ 필요
시트 공유 + API 스펙/토큰

■ 상세
https://hwemo-chung.github.io/offers/auto-sheet-sync.html
```

### A4 — Gmail 라벨·보관 자동화

**영문:** Gmail Triage Bot  
**가격:** ₩200,000 ~ ₩600,000  
**기간:** 3~7영업일

```
규칙 기반 분류 + 일 1회 크론 정리 (Apps Script / TS)

■ 납품
· 라벨 규칙 세트
· 시간 트리거(크론) 정리 잡
· 처리 로그 시트
· 오분류 예외 목록

■ 예시
· 청구서/영수증 분리
· 채용 메일 라벨
· 고객 도메인별 분류

■ 필요
대상 Gmail(Workspace 가능 여부) + 규칙 초안

■ 상세
https://hwemo-chung.github.io/offers/auto-gmail-triage.html
```

### A5 — RSS/뉴스 → 초안 파이프라인

**영문:** RSS → Draft Pipeline  
**가격:** ₩400,000 ~ ₩1,000,000  
**기간:** 1~2주

```
수집 → 필터 → (선택) LLM 요약 → 초안 저장을 크론으로

■ 납품
· 소스 목록 + 필터 규칙
· 크론 수집 잡
· 초안 저장소(시트/노션/MD)
· 중복 URL 제거

■ 예시
· 업계 뉴스 큐
· 경쟁사 블로그 모니터링
· 채용 공고 수집

■ 필요
소스 URL + 저장 위치 + (선택) LLM API 키

■ 상세
https://hwemo-chung.github.io/offers/auto-rss-pipeline.html
```

### A6 — API·웹 헬스체크 크론

**영문:** API Health Cron  
**가격:** ₩150,000 ~ ₩400,000  
**기간:** 2~4영업일

```
분/시간 단위 핑 + 연속 실패 시 알림

■ 납품
· 체크 대상 URL 목록
· 스케줄(크론 식)
· 알림 채널 1개
· 최근 결과 로그(시트 또는 JSON)

■ 예시
· 프로덕션 /health
· 결제 웹훅 엔드포인트
· 정적 사이트 200 확인

■ 필요
URL 목록 + 알림 웹훅/메일

■ 상세
https://hwemo-chung.github.io/offers/auto-health-cron.html
```

### A7 — Angular i18n 키 동기화 봇

**영문:** i18n Key Sync Bot  
**가격:** ₩200,000 ~ ₩500,000  
**기간:** 2~5영업일

```
ko/en/ja JSON 키 누락·고아 키를 PR마다 검사

■ 납품
· 키 diff 스크립트(TS)
· CI 스텝 통합
· 리포트 아티팩트
· 베이스 로케일 설정

■ 예시
· jp.json / en.json 싱크
· 신규 키만 이슈화
· 미사용 키 경고

■ 필요
i18n JSON/xlf 경로 + CI 권한

■ 상세
https://hwemo-chung.github.io/offers/auto-i18n-sync.html
```

### A8 — 야간 E2E(Playwright/Cypress) 크론

**영문:** Nightly E2E Cron  
**가격:** ₩500,000 ~ ₩1,500,000  
**기간:** 1~3주

```
매일 밤 스모크 E2E 실행 → 실패 시 리포트 링크 알림

■ 납품
· 스모크 시나리오 1~3
· CI 야간 크론
· 스크린샷/트레이스 아티팩트
· 실패 알림 1채널

■ 예시
· 로그인→홈
· 장바구니 핵심 경로
· 관리자 목록 조회

■ 필요
스테이징 URL + 테스트 계정

■ 상세
https://hwemo-chung.github.io/offers/auto-e2e-nightly.html
```

### A9 — 릴리스 노트 자동 초안 봇

**영문:** Release Notes Bot  
**가격:** ₩200,000 ~ ₩450,000  
**기간:** 2~5영업일

```
태그/머지 시 커밋 로그 → CHANGELOG 초안 PR

■ 납품
· 태그/릴리스 트리거
· CHANGELOG 섹션 템플릿
· PR 본문 초안
· 스킵 라벨 규칙

■ 예시
· 버전 태그 시 노트
· 주간 요약 이슈
· 스토어 릴리스 문구 초안

■ 필요
커밋 컨벤션 유무 + 저장소 권한

■ 상세
https://hwemo-chung.github.io/offers/auto-release-bot.html
```

### A10 — 문의 폼 → 시트/슬랙/CRM 웹훅

**영문:** Form → CRM Webhook  
**가격:** ₩250,000 ~ ₩700,000  
**기간:** 3~7영업일

```
랜딩 문의를 실시간·배치로 운영 채널에 연결

■ 납품
· 수신 API(서버리스/Workers)
· 시트 또는 메일 전달
· 레이트리밋/허니팟
· 문의 알림 1채널

■ 예시
· offers 문의 집계
· 채용 지원 접수
· B2B 리드 슬랙

■ 필요
도메인/호스팅 + 전달 대상(시트/슬랙)

■ 상세
https://hwemo-chung.github.io/offers/auto-form-webhook.html
```
