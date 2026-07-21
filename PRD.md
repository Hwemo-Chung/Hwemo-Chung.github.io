# Hwemo-Chung.github.io 개선 PRD
**작성일**: 2026-07-04 · **분류**: 개인 · **활동 상태**: active · **권장**: 유지보수

## 1. 개요
Hwemo Chung 개인 GitHub Pages 사이트. AdSense로 수익화된 랜딩 페이지와, 30개 마이크로 SaaS MVP 아이디어를 소개하는 `micro-saas-mvps/index.html` 목록 페이지로 구성. 순수 정적 HTML/CSS/JS이며 빌드 도구·패키지 매니저·프레임워크가 전혀 없다. 2026-04-30 마지막 커밋에서 404.html 파일명, ads.txt 대소문자, HTML 인코딩, sitemap, 버튼 접근성 문제를 이미 수정한 상태로, 작동 중인 소규모 사이트를 낮은 빈도로 손보는 유지보수 단계 프로젝트다.

## 2. 현황 진단

| 항목 | 현재 상태 | 비고 |
|---|---|---|
| 스택 | 정적 HTML/CSS/JS | 프레임워크·번들러 없음 — 버전 종속 리스크 자체가 없음 |
| 빌드 도구 | 없음 (package.json/lockfile 없음) | GitHub Pages가 파일을 그대로 서빙 |
| CI/CD | 없음 (`.github/workflows` 없음) | 배포 전 자동 검증 전무 |
| 테스트 | 없음 | 테스트 디렉터리·spec 파일 전무 |
| 규모 | 약 3,295줄 (*.html/*.js/*.css) | `pp.html` 약 59.7KB로 최대 파일 (개인정보처리방침 추정) |
| 보안 | 실제 자격증명 없음 | grep 결과 `secret-clip`은 i18n.js 내 제품명 번역 키, 실 credential 아님 |
| 수익화 | Google AdSense 연동 (ads.txt, ads.html, google-site-verification) | 공개 서비스 트래픽 존재 — 다운타임/오류가 수익에 직결 |

핵심 문제:
- CI 파이프라인 부재로 HTML 문법 오류·깨진 링크·ads.txt 형식 오류가 배포 후에야 발견됨.
- 테스트 부재는 정적 사이트 특성상 리스크가 낮지만, 최소한의 링크/HTML 유효성 자동 검사조차 없음.
- `micro-saas-mvps/index.html`이 외부 GitHub 링크 30개를 나열하는 단일 페이지 — 링크 유효성을 수동으로만 확인 가능.

## 3. 개선 항목

### P0

**문제**: `.github/workflows` 디렉터리 부재로 커밋 시점의 HTML 오류(404.html 파일명 오타, ads.txt 대소문자 오류 등, 2026-04-30 커밋에서 실제로 발생했던 종류의 실수)가 배포 후 사용자/애드센스 크롤러에게 노출될 때까지 발견 안 됨.
**개선안**: GitHub Actions 워크플로 1개 추가 — HTML validator(html5validator 또는 유사 액션) + 링크 체커(lychee-action 등 정적 실행 바이너리 기반, 별도 런타임 설치 불필요)를 push/PR 시 실행.
**근거**: keyFindings — "No .github/workflows directory — no CI/CD pipeline configured." 및 "last commit 2026-04-30 already fixed 404.html filename, ads.txt casing, HTML encoding... issues" (과거 실제 오류 이력).
**수용 기준**: `.github/workflows/*.yml` 파일 존재, push 시 워크플로 실행 로그에서 HTML validate + link-check 단계가 green으로 통과. 의도적으로 깨진 링크를 넣은 테스트 PR에서 워크플로가 fail하는 것으로 검증.

### P1

**문제**: `micro-saas-mvps/index.html`의 30개 외부 GitHub 링크가 저장소(repo 삭제/이름변경/private 전환)에 대해 수동 확인 외 방법이 없어 시간이 지나면 깨진 링크(404)가 누적됨.
**개선안**: P0의 link-checker 워크플로를 주 1회(cron) 실행으로 확장하여 외부 링크 회귀를 정기 감지, 결과를 GitHub Issue로 자동 생성(lychee-action의 `--github-issue` 또는 유사 옵션 활용).
**근거**: keyFindings — "micro-saas-mvps/index.html is a single flat content page listing 30 MVP ideas with external GitHub links — no supporting code/build for those listed projects lives in this repo."
**수용 기준**: cron 워크플로 정의 존재, 최소 1회 실행 로그 확인, 깨진 링크 발견 시 자동 이슈 생성 동작을 수동 트리거로 검증.

## 4. 비범위 (YAGNI)
- 프레임워크/번들러 도입 (React, Vite 등) — 정적 사이트 규모(3,295줄)에 과잉 설계, 유지보수 부담만 증가.
- 단위 테스트 스위트 구축 — 로직이 거의 없는 정적 콘텐츠 페이지에 테스트 코드 작성은 비용 대비 효과 없음.
- micro-saas-mvps 30개 프로젝트 자체의 코드/빌드 이관 — 각 프로젝트는 별도 repo에 있으며 이 repo 책임 범위 밖.
- 다국어/i18n 확장, 신규 콘텐츠 기획 — 기능 제안 아님, 유지보수 PRD 범위 초과.

## 5. 참고 자료
(외부 스택 버전 관련 research 항목은 본 프로젝트 스택인 정적 HTML/CSS/JS와 무관하여 인용하지 않음. 개선안은 GitHub Actions 표준 기능(html5validator, lychee-action) 활용을 전제로 하며, 해당 도구는 별도 벤더 공식 링크 확보 대상이 아닌 GitHub Marketplace 액션이므로 생략함.)

<!-- ULW_PRD_ROOT_PLACEMENT source=/Users/solution/Documents/GitHub/_docs-plans/prd/Hwemo-Chung.github.io.md project=Hwemo-Chung.github.io -->

---

## 추가 데이터 조사 지침

- 원본 PRD: `/Users/solution/Documents/GitHub/_docs-plans/prd/Hwemo-Chung.github.io.md`
- 프로젝트 루트: `/Users/solution/Documents/GitHub/_projects/Hwemo-Chung.github.io`
- 감지된 스택/근거: 미확인 또는 문서/자료 중심 프로젝트 (manifest: 상위 3단계 내 주요 manifest 미검출)
- 조사 기준일: 2026-07-04. 날짜/버전/가격/시장 수치는 최신성이 흔들리므로 재작성 직전에 공식 문서나 원 출처로 재검증한다.

### 조사 우선순위
1. 저장소 사실 확인: `git status --short`, `git log -5 --oneline --decorate`, 최근 변경 파일, 실제 디렉터리 구조, manifest/lockfile, 테스트/CI/배포 파일을 먼저 확인한다.
2. 문서-코드 일치성: README, CLAUDE/AGENTS류 문서, docs/ 설계서의 주장과 실제 소스/설정/스크립트를 대조하고 불일치는 파일 경로와 함께 기록한다.
3. 실행 가능성: 빌드/테스트 명령은 manifest의 실제 scripts를 기준으로 선택한다. 실행하지 못하면 사유(의존성 없음, SDK 없음, 인증 필요 등)를 PRD에 명시한다.
4. 의존성 최신성: 프레임워크/SDK/런타임 버전은 공식 릴리즈 노트, EOL 표, 패키지 레지스트리에서 확인하고 조회일을 남긴다.
5. 제품/시장 근거: 시장 규모, 경쟁 제품, 가격, 앱스토어/배포 상태, 사용자 지표는 원 출처 URL과 조회일을 같이 남기며 추정치는 추정으로 표시한다.
6. 우선순위 재산정: P0는 빌드 불가/데이터 손실/보안/배포 차단처럼 즉시 막는 문제만 둔다. P1은 유지보수와 재현성, P2는 정리/문서/후속 개선으로 제한한다.

### 권장 로컬 조사 명령
```sh
git -C "/Users/solution/Documents/GitHub/_projects/Hwemo-Chung.github.io" status --short
git -C "/Users/solution/Documents/GitHub/_projects/Hwemo-Chung.github.io" log -5 --oneline --decorate
find "/Users/solution/Documents/GitHub/_projects/Hwemo-Chung.github.io" -maxdepth 3 \( -name package.json -o -name pubspec.yaml -o -name build.gradle -o -name build.gradle.kts -o -name Package.swift -o -name pyproject.toml -o -name go.mod -o -name Cargo.toml -o -name README.md -o -path '*/.github/workflows/*' \) -print
```

### PRD 작성 규칙
- 관찰한 사실과 제안을 분리한다. 증거 없는 단정은 `확인 필요`로 남긴다.
- 각 개선 항목은 문제, 근거, 최소 개선안, 수용 기준을 포함한다.
- 신규 기능보다 현재 코드의 재현성, 테스트 가능성, 배포 가능성을 먼저 평가한다.
- 이 지침은 조사 절차이며, 조사 결과 자체로 간주하지 않는다.
