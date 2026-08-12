# Lumos 아웃리치 키트 (복붙용)

**연락:** tolaria@naver.com  
**허브:** https://hwemo-chung.github.io/sales/  
**규칙:** 하루 목표 건수만 채운다. 문장 다듬기에 30분 이상 쓰지 않는다.

---

## 일일 쿼터 (최소)

| 채널 | 건/일 | 비고 |
|------|-------|------|
| 이메일 / LinkedIn | 8 | EN pilot 또는 KO 진단 |
| 크몽 문의 답변·프로필 노출 | 1 세션 | 상품 등록 후 |
| 커뮤니티 (과하지 않게) | 0~1 | 스팸 금지 |
| **합** | **≥10** | 주 5일 = 50 |

---

## KO — 레거시 앱 진단 (1순위)

**제목:** 레거시 앱, iOS 업로드·Play 타겟 상태만 무료로 정리해 드립니다

```
안녕하세요, {이름}님.

공개 스토어/APK만 보고
· iOS(Xcode 26 / iOS 26 SDK) 업로드 가능 여부
· Play 타겟 API 영향(상위 OS 신규 사용자 조건 포함)
· page.link 등 죽은 딥링크 유무
를 1장으로 정리하는 무료 진단을 하고 있습니다. (초기 10곳)

고치는 방법은 넣지 않습니다. 해당 없으면 "해당 없음"으로 회신합니다.
원하시면 앱 이름 또는 스토어 링크만 답장 주세요.

랜딩: https://hwemo-chung.github.io/cordova.html
— Lumos / tolaria@naver.com
```

**짧은 DM (10줄 이내):**

```
공개 APK만으로 iOS 업로드·Play 타겟 상태를 1장 정리하는 무료 진단 진행 중입니다(10곳).
앱 이름/스토어 링크만 주시면 됩니다. https://hwemo-chung.github.io/cordova.html
```

**팔로업 D+3:**

```
지난주 진단 제안 드렸습니다. 필요 없으시면 이 스레드 닫겠습니다.
앱 링크 하나면 영업일 2일 안 회신 가능합니다.
```

**팔로업 D+7:**

```
이번 달 무료 진단 슬롯이 남아 있습니다. 불필요하시면 무시해 주세요.
```

---

## EN — Production pilot $400

**Subject:** Capacitor/WebView production issue — 1-week pilot

```
Hi {Name},

I help teams ship Ionic/Capacitor/Android WebView apps through real-device
failures (not emulator demos): release-week crashes, Play policy,
background location, auth/cookie gaps, store builds.

Offer: $400 pilot — ~6h in one week — one failure class, written repro + fix path.
Monthly stabilizer: $1,200 / 8h async if useful.

Invoice before work (card / Wise / bank).
Landing: https://hwemo-chung.github.io/retainer.html

If you're mid-release or stuck on a device-only bug, reply with the symptom.

{Your name}
tolaria@naver.com
```

**Follow-up D+3:**

```
Quick bump — if you share one symptom + OS, I can say whether a $400 pilot fits.
No pitch deck required.
```

**Follow-up D+7:**

```
Closing the loop. Pilot slot this week if still relevant: retainer page above.
```

---

## Threads 리포트 대행

```
Threads 계정을 12시트 엑셀로 뽑는 리포트 대행합니다 (5~10만 원대).
CLI는 무료 공개, 설정 시간이 부담이면 대행이 맞습니다.
안내: https://hwemo-chung.github.io/threads-analyzer.html
```

---

## 케이스 스터디 (3줄 × 3 · 복붙용)

### #1 — 하이브리드 업무 앱 targetSdk 대응

```
문제: Cordova 기반 업무용 운영 앱, Play targetSdk 미달로 상위 OS 신규 사용자 제한 경고 수신
조치: 네이티브 플러그인 호환성 감사 후 최소 변경 범위 targetSdk 상향. 실기기 회귀 체크리스트 통과 [확인 필요: 항목 수]
결과: 프로덕션 업로드 승인, 정책 연장 신청 없이 기한 내 해결 [확인 필요: 실제 타임라인]
스택: Cordova / Ionic / Android
```

### #2 — 위치 추적 유틸 · 백그라운드 FGS 알람 누락

```
문제: Android 12+ 배터리 최적화로 포그라운드 서비스(FGS) 위치 알람이 간헐 누락
조치: FGS 타입 선언(location) + 정확한 알람 권한(SCHEDULE_EXACT_ALARM) 적용. 필드 시나리오 테스트 [확인 필요: 기기 수]
결과: 장시간 연속 추적에서 알람 누락 해소. Play 정책 위치·FGS 선언 통과 [확인 필요: 추적 시간·기기 수]
스택: Kotlin / Jetpack Compose / Android FGS
```

### #3 — WebView 쿠키·세션 실기기 장애

```
문제: Android WebView에서 로그인 세션이 백그라운드 복귀 후 소실 — 에뮬레이터 재현 불가
조치: Chrome DevTools 원격 인스펙트로 SameSite 쿠키 정책 충돌 확인. 쿠키 저장소 동기화 타이밍 수정
결과: 백그라운드 복귀 후 세션 유지 확인 [확인 필요: 검증 기기 수·세션 유지율 측정치]
스택: Capacitor / Angular / Android WebView
```

---

## 거절 멘트 (범위 밖)

```
요청 범위가 제가 맡는 축(레거시 하이브리드·실기기 프로덕션)과 맞지 않아
이번엔 사양하겠습니다. 진단만 필요하시면 스토어 링크 주시면 상태만 짧게 적어 드리겠습니다.
```

---

## 리드 소스 체크리스트

- [ ] LinkedIn: Capacitor, Ionic, Cordova, Play rejection, targetSdk
- [ ] 크몽: 앱 오류, 스토어, Ionic 검색 알림
- [ ] Upwork: Capacitor / Ionic bug (영문)
- [ ] 지인 2명/주 (회사 기밀 경계)
- [ ] GitHub Issues / Discord (스팸 금지, 도움 먼저)
