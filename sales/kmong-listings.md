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

---

## 소셜·블로그 자동화 (적법 범위)

**제외 명시:** 무단 DM, 좋아요/팔로우 조작, 수신동의 없는 대량 메일, SEO 스팸 양산.

### S1 — 콘텐츠 캘린더(시트) 운영 자동화

**가격:** ₩300,000 ~ ₩800,000 · **기간:** 5~10영업일

```
시트에 쓴 초안·예약 시각 → 승인 큐로 정리 (자동 무단 게시 없음)

■ 적법 범위
플랫폼 자동 스팸 게시·가짜 참여 유도 없음. 고객 소유 계정·공식 API/수동 게시만.

■ 납품
· 시트 스키마(채널·본문·미디어·상태)
· 상태머신: draft → review → approved → done
· 크론으로 리마인더/마감 알림 1채널
· 게시 실행은 수동 또는 공식 API(별도 범위)

■ 상세
https://hwemo-chung.github.io/offers/social-calendar-sheet.html
```

### S2 — 블로그 초안 큐 자동화

**가격:** ₩400,000 ~ ₩1,000,000 · **기간:** 1~2주

```
RSS/노션/시트 소스 → 마크다운·CMS 초안만 생성 (공개 예약은 사람)

■ 적법 범위
타 사이트 본문 무단 복제·자동 SEO 스팸 게시 제외. 라이선스 있는 소스·요약·오리지널 작성 전제.

■ 납품
· 소스 2종까지 (RSS/시트/폴더)
· 중복 URL 제거
· 초안 저장(레포/노션/CMS draft API)
· 편집 체크리스트 템플릿

■ 상세
https://hwemo-chung.github.io/offers/social-draft-queue.html
```

### S3 — UTM·캠페인 링크 관리 자동화

**가격:** ₩200,000 ~ ₩500,000 · **기간:** 3~7영업일

```
캠페인별 UTM 생성·시트 기록·만료 링크 점검 크론

■ 적법 범위
피싱·오해 소지 도메인 클로킹 구축 안 함.

■ 납품
· UTM 빌더(시트 또는 소형 웹폼)
· 캠페인 마스터 시트
· 주 1회 링크 200/404 점검
· 깨진 링크 알림

■ 상세
https://hwemo-chung.github.io/offers/social-utm-tracker.html
```

### S4 — 브랜드 멘션 일일 다이제스트

**가격:** ₩300,000 ~ ₩900,000 · **기간:** 1~2주

```
공개 검색/공식 API 범위에서 멘션·키워드를 모아 매일 요약 메일

■ 적법 범위
계정 비밀번호 요구 스크래핑·약관 위반 크롤링 제외. API 한도 준수.

■ 납품
· 키워드/핸들 목록
· 일 1회 크론 수집
· 다이제스트 메일 또는 시트
· 출처 링크 포함

■ 상세
https://hwemo-chung.github.io/offers/social-mention-digest.html
```

### S5 — 게시 승인 봇 (슬랙/메일)

**가격:** ₩350,000 ~ ₩800,000 · **기간:** 5~10영업일

```
초안 도착 → 승인/반려 버튼 → 결과 시트 반영

■ 적법 범위
무단 대행 게시·계정 공유 강요 없음. 고객 정책에 맞춤.

■ 납품
· 초안 수신 채널
· 승인/반려 액션
· 감사 로그(누가 언제)
· 반려 사유 필드

■ 상세
https://hwemo-chung.github.io/offers/social-approval-slack.html
```

### S6 — 자사 블로그 → 뉴스레터 초안

**가격:** ₩250,000 ~ ₩600,000 · **기간:** 3~7영업일

```
자사 RSS만 모아 주간 뉴스레터 초안 생성

■ 적법 범위
수신동의 없는 대량 메일 엔진 구축 안 함. 고객 ESP·구독 리스트 준수.

■ 납품
· 자사 RSS 1~3개
· 주간 크론
· HTML/MD 초안
· 제목·요약 템플릿

■ 상세
https://hwemo-chung.github.io/offers/social-newsletter-digest.html
```

### S7 — 블로그 SEO 헬스 크론

**가격:** ₩200,000 ~ ₩550,000 · **기간:** 3~7영업일

```
자사 URL 기준 타이틀·og·사이트맵·깨진 링크 주간 점검

■ 적법 범위
검색 조작·숨은 텍스트 삽입 자동화 제외.

■ 납품
· URL 목록 또는 사이트맵
· title/description/og 누락 리포트
· 내부 404 샘플
· 주간 메일 리포트

■ 상세
https://hwemo-chung.github.io/offers/social-seo-check-cron.html
```

### S8 — 원문 1개 → 채널별 초안 패키지

**가격:** ₩150,000 ~ ₩400,000 (템플릿) / 건당 운영은 별도 · **기간:** 템플릿 구축 3~5일

```
블로그 URL/본문 → X·LinkedIn·Threads·뉴스레터용 초안 (게시 전 사람 확인)

■ 적법 범위
타사 콘텐츠 무단 재게시·허위 후기 생성 안 함.

■ 납품
· 채널별 글자 수 템플릿
· UTM 자동 부착 옵션
· 초안 출력(시트/MD)
· 금지 표현 체크리스트

■ 상세
https://hwemo-chung.github.io/offers/social-crosspost-draft.html
```

### S9 — Threads 게시 시간 도우미

**가격:** ₩100,000 ~ ₩250,000 (리포트 연동 시) · **기간:** 2~4영업일

```
본인 계정 분석 리포트 기반 ‘추천 시간대’ 카드 + 캘린더 시트

■ 적법 범위
공식 API·본인 계정 협조. 인게이지먼트 조작 봇 없음.

■ 납품
· 추천 시간대 TOP
· 피해야 할 슬롯
· 4주 캘린더 시트
· 글자수 밴드 메모

■ 상세
https://hwemo-chung.github.io/offers/social-threads-schedule-assist.html
```

### S10 — 댓글·문의 모더레이션 큐

**가격:** ₩300,000 ~ ₩900,000 · **기간:** 1~2주

```
신고·금칙어·스팸 패턴을 큐로 모아 사람이 처리

■ 적법 범위
불법 검열 대행·경쟁사 여론조작 도구 아님. 고객 커뮤니티 정책 준수.

■ 납품
· 금칙어/패턴 목록
· 수집 어댑터(가능한 공식 경로)
· 처리 상태 워크플로
· 처리 로그

■ 상세
https://hwemo-chung.github.io/offers/social-comment-mod-queue.html
```

---

## 심화 기술 (Deep)

고단가. 저장소 접근·스테이징 협조 전제. 구현 스프린트는 별도 SOW.

### D1 — Angular 메이저 마이그레이션 실행 계획

**가격:** ₩800,000 ~ ₩2,500,000 · **기간:** 1~2주

```
vN→vN+k 경로, 깨질 패키지, 단계 PR 단위까지 문서+스파이크

■ 납품
· 현재→목표 버전 경로표
· 차단 패키지·대체안
· PR 단위 마이그레이션 순서
· 리스크/공수 밴드 + 스파이크 결과(옵션)

■ 예시
· Angular 12→18
· View Engine 잔재 정리
· Ionic 동시 메이저

■ 상세
https://hwemo-chung.github.io/offers/deep-ng-major-migrate.html
```

### D2 — RxJS 구독·메모리 릭 감사

**가격:** ₩500,000 ~ ₩1,200,000 · **기간:** 5~10영업일

```
takeUntilDestroyed/async pipe 누락·중첩 subscribe 전수 패턴 리포트

■ 납품
· 위험 패턴 목록(파일:라인)
· 우선순위 P0–P2
· 권장 패턴 치트시트
· 수정 견적 밴드

■ 예시
· 라우트 이탈 후 폴링 잔존
· 중첩 subscribe 지옥
· Subject 미완료

■ 상세
https://hwemo-chung.github.io/offers/deep-rxjs-leak-audit.html
```

### D3 — 번들·런타임 성능 심층 분석

**가격:** ₩600,000 ~ ₩1,500,000 · **기간:** 1주

```
초기 로드·메인 스레드·청크 전략을 수치로 분해

■ 납품
· 번들 상위 모듈 Top N
· 라우트 레이지 기회
· 메인 스레드 병목 가설
· 2주 개선 백로그

■ 예시
· 모바일 3G 첫 화면
· 관리자 거대 vendor.js
· 아이콘/폰트 과다

■ 상세
https://hwemo-chung.github.io/offers/deep-bundle-perf.html
```

### D4 — WebView·Capacitor 브리지 장애 심층 디버그

**가격:** ₩700,000 ~ ₩2,000,000 · **기간:** 1~2주 (기기 협조 필요)

```
실기기 only 이슈: 쿠키, 딥링크, 플러그인, 백그라운드

■ 납품
· 재현 시나리오 문서
· 로그/크롬 인스펙트 포인트
· 원인 후보 순위
· 수정 방향 + 공수 밴드

■ 예시
· Android 쿠키/세션
· iOS 안전영역·키보드
· 백그라운드 복귀 후 토큰

■ 상세
https://hwemo-chung.github.io/offers/deep-webview-bridge.html
```

### D5 — 인증·세션 위협 모델링 리뷰

**가격:** ₩800,000 ~ ₩2,000,000 · **기간:** 1~2주

```
JWT/리프레시/쿠키/OAuth 리다이렉트 흐름 보안 리뷰

■ 납품
· 플로우 다이어그램
· 위협 시나리오 표
· 수정 권고 P0–P2
· 회귀 테스트 체크리스트

■ 예시
· 리프레시 재사용 탐지
· 웹뷰 쿠키 SameSite
· OAuth redirect 오픈 리다이렉트

■ 상세
https://hwemo-chung.github.io/offers/deep-auth-session.html
```

### D6 — 오프라인 우선 동기화 설계

**가격:** ₩1,000,000 ~ ₩3,000,000 · **기간:** 2~3주

```
IndexedDB/큐/충돌 정책을 도메인에 맞게 설계 문서화

■ 납품
· 동기 상태머신
· 충돌 정책 결정 로그
· 실패 재시도/데드레터
· 최소 스파이크 범위 제안

■ 예시
· 주문 오프라인 접수
· 재고 실사
· 서명/사진 지연 업로드

■ 상세
https://hwemo-chung.github.io/offers/deep-offline-sync.html
```

### D7 — Nx·모노레포 분리/통합 설계

**가격:** ₩900,000 ~ ₩2,500,000 · **기간:** 1~3주

```
앱·라이브러리 경계, CI 영향 그래프, 배포 단위 설계

■ 납품
· 현재 구조 진단
· 목표 라이브러리 경계
· CI affected 전략
· 이주 단계 로드맵

■ 예시
· 디자인시스템 패키지 분리
· admin/web 공유 UI
· 버전 정책

■ 상세
https://hwemo-chung.github.io/offers/deep-monorepo-nx.html
```

### D8 — 디자인 토큰·공유 UI 추출

**가격:** ₩700,000 ~ ₩1,800,000 · **기간:** 1~2주

```
흩어진 스타일/컴포넌트를 토큰+라이브러리 초안으로

■ 납품
· 토큰 JSON/CSS 초안
· 핵심 컴포넌트 목록
· 안티패턴(복붙 스타일) 목록
· 도입 PR 가이드

■ 예시
· 판매/세일즈 페이지 통합
· 멤버 앱+어드민 톤 통일

■ 상세
https://hwemo-chung.github.io/offers/deep-design-tokens.html
```

### D9 — 접근성(WCAG) 감사 + 수정 백로그

**가격:** ₩600,000 ~ ₩1,500,000 · **기간:** 1~2주

```
키보드·대비·스크린리더 기준 이슈 우선순위화

■ 납품
· 플로우별 이슈 표
· 심각도·재현 절차
· 수정 가이드 링크
· 재감사 범위 제안

■ 예시
· 회원가입
· 결제/신청
· 관리자 테이블

■ 상세
https://hwemo-chung.github.io/offers/deep-a11y-wcag.html
```

### D10 — OpenAPI 타입 클라이언트 생성 파이프라인

**가격:** ₩400,000 ~ ₩1,000,000 · **기간:** 3~7영업일

```
스펙 변경 시 Angular 서비스/타입 자동 재생성 + CI 검증

■ 납품
· 생성 스크립트
· CI 스텝
· 사용 가이드 (import 경로)
· 브레이킹 변경 감지 전략

■ 예시
· nestjs swagger → angular
· 버전 헤더 분기

■ 상세
https://hwemo-chung.github.io/offers/deep-openapi-client.html
```

### D11 — 피처 플래그 아키텍처 도입

**가격:** ₩500,000 ~ ₩1,400,000 · **기간:** 1~2주

```
환경·유저·점진 배포를 위한 플래그 계층 설계+샘플 연동

■ 납품
· 플래그 분류(릴리스/실험/권한)
· Angular 프로바이더 샘플
· 킬스위치 운영 절차
· 감사 로그 권고

■ 예시
· 결제 리뉴얼 점진 오픈
· 내부 직원 only 메뉴

■ 상세
https://hwemo-chung.github.io/offers/deep-feature-flags.html
```

### D12 — API 부하 테스트 팩 (k6)

**가격:** ₩500,000 ~ ₩1,300,000 · **기간:** 5~10영업일

```
핵심 API 시나리오 스크립트 + 기준선 리포트

■ 납품
· 시나리오 스크립트
· 환경별 실행 방법
· p95/에러율 리포트
· 병목 가설

■ 예시
· 로그인+목록
· 검색
· 웹훅 수신

■ 상세
https://hwemo-chung.github.io/offers/deep-loadtest-k6.html
```
