# 호롱 이력서 스크리너 (호롱랩스 v0.1.0)

채용 실무자를 위한 이력서 1차 스크리닝 데스크톱 앱. **이력서 원문/개인정보는 이 앱을 설치한 PC 밖으로 절대 나가지 않는다**가 핵심 설계 원칙입니다.

## 왜 데스크톱 앱인가

이력서에는 이름·연락처·학력·경력 같은 개인정보가 포함됩니다. 이 도구는 처음부터
- 파일을 서버에 업로드하지 않고
- 브라우저/클라우드로 텍스트를 전송하지 않고
- 로컬 디스크에서 읽고, 로컬 메모리에서 채점하고, 로컬 디스크에만 저장

하도록 설계했습니다. `main.js`는 앱 시작 시 `session.webRequest.onBeforeRequest`로 **http/https 아웃바운드 요청 자체를 전부 차단**합니다 (`file:`/`data:`/`devtools:`만 예외). 이건 "우리가 안 보낸다고 약속"이 아니라 앱 레벨에서 기술적으로 막아놓은 것입니다.

## 채점 방식 (규칙 기반, AI 아님 — 의도된 선택)

`src/scoring.js`는 키워드 매칭 + 경력 연차 추정(명시적 "N년" 표현 또는 근무기간 날짜range 합산) + 학력 인식으로 점수를 계산합니다. LLM을 안 쓰는 이유:
1. 로컬 LLM(Ollama 등)을 기본 번들하면 앱 용량이 수 GB로 커지고 사용자 PC 사양을 탐 → 지금 단계에서는 배포 장벽
2. 왜 이 점수가 나왔는지 매칭/누락 키워드로 100% 설명 가능해야 채용 담당자가 신뢰하고, AI 채용 스크리닝의 편향(bias) 이슈도 원천적으로 피함
3. 필요하면 나중에 "로컬 LLM 감지 시 AI 인사이트 추가 제공" 같은 옵션 기능으로 확장 가능 (지금 아키텍처와 충돌 없음)

## 구조

```
main.js            Electron 메인 프로세스: 파일 다이얼로그, IPC, 네트워크 차단, 세션 저장
preload.js          contextBridge로 안전하게 window.horong API 노출
src/scoring.js       순수 로직 (네트워크 호출 절대 없음) — 채점/연차추정/학력인식/연락처추출
src/extractText.js   PDF(pdf-parse)/DOCX(mammoth)/TXT 로컬 텍스트 추출
renderer/            UI (index.html, app.js, style.css) — 호롱불 테마
renderer/demo/       개발용 브라우저 미리보기 하네스 (실제 배포 앱에는 포함 안 됨)
test/                node --test 단위 테스트 (scoring.js 대상 16개, 전부 통과)
```

## 실행 / 빌드

```bash
npm install
npm start              # Electron 앱 실행
npm test                # 단위 테스트
npm run pack             # release/mac-arm64/ 에 미서명 .app 생성 (개발용)
npm run dist              # 배포용 패키징 (아이콘/서명 설정 추가 필요)
```

## 검증한 것 / 아직 안 한 것

**검증 완료**
- 채점 로직 단위 테스트 16개 전부 통과 (`node --test test/`)
- 실제 생성한 PDF 이력서로 텍스트 추출 → 채점 → 랭킹까지 전체 파이프라인 CLI로 실행 확인
- Electron으로 실제 macOS .app 패키징 성공 (electron-builder)
- UI는 실제 코드(app.js/style.css)를 브라우저에 그대로 로드해 목업 데이터로 렌더링/상호작용 스크린샷 확보

**아직 안 한 것 (다음 단계)**
- 실제 GUI 창을 띄운 라이브 테스트는 이번 세션 환경(샌드박스가 WindowServer 접근을 막음)에서 못 했음 — 사용자 PC에서 직접 실행 확인 필요 (`~/Downloads`에 복사해둔 앱으로 확인 가능)
- DOCX/한글(HWP) 실제 파일 테스트 (DOCX는 mammoth 라이브러리 자체는 검증된 라이브러리, 우리 코드 경로는 미검증)
- 앱 아이콘, macOS 코드사이닝(Apple Developer 인증서, $99/년)·공증(notarization), Windows 코드사이닝 — 지금은 미서명이라 첫 실행 시 Gatekeeper/SmartScreen 경고가 뜸
- 이름/연락처 추출 정확도 개선 (현재는 정규식 기반, 실제 다양한 이력서 포맷으로 더 테스트 필요)
- 여러 채용공고(JD)를 저장해두고 전환하는 UX, 이력서 일괄 폴더 감시 등

## 브랜드

호롱랩스(🏮) — 채용 실무자 책상 위에 놓는 작은 손전등이라는 컨셉. 큰 기업용 채용관리솔루션(그리팅 등)과 달리 회사 승인 없이 개인이 바로 켜서 쓰는 도구를 지향합니다.
