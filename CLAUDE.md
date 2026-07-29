# INVST://STOCK — 투자 참조 터미널

로컬 주식투자 참조 페이지. `index.html` 더블클릭으로 실행(file:// 기준이므로 **ES module 금지**, 전역 네임스페이스 `App`/`AppConfig`/`AiClient` 유지). 구조·확장 가이드는 `README.md` 참조.

## 구조 요약

- `js/config.js` — 심볼·목록·필터·프리셋 전부 여기 (로직 없음). 종목/탭 데이터 수정은 이 파일만.
- `js/core.js` — 페이지 레지스트리, `App.tv(id,위젯,설정)` 위젯 팩토리, `App.openSymbolModal(sym,name)` 공용 상세 팝업, `App.store`,
  자체 시세박스 `App.renderQuoteBox`(내부 `App.fetchQuote`) · 여러 종목 일괄 조회 `App.fetchQuotes`
  (시장별 병렬 — 대시보드 요약 카드가 사용) · 심볼→스캐너 시장 판별 `App.scanRegion`
  (KRX=korea, FX_IDC/FOREXCOM=forex, BINANCE=crypto, 나머지=america) ·
  주기 셀렉트 `App.intervalSelect` · 포맷터 `App.fmt`.
- `js/pages/*.js` — 화면 모듈. **새 탭 = 파일 1개(`App.registerPage({id,label,order,html,init})`) + index.html에 script 태그 1줄.**
- `js/ai-client.js` — Claude API 호출 격리. 현재 사용하는 페이지 없음(AI분석 탭 2026-07-11 삭제) — 웹 확장 대비 보존, 삭제 금지.

## ★ 시장 분석 요청 시 필수 워크플로

사용자는 API 키가 없어서 페이지의 AI 분석 버튼 대신 **Claude Code 세션에서 직접 분석을 요청**한다.
"~왜 올랐어/빠졌어", "~분석해줘" 류의 시장·종목 질문을 받으면 **반드시 아래 순서대로**:

1. **WebSearch로 조사** 후 아래 형식의 한국어 리포트 작성 (수치는 검색으로 확인된 것만, 미확인은 "미확인" 표기):
   ```
   ## 📌 핵심 요약
   ## 📊 무슨 일이 있었나
   ## 🔍 원인 분석
   ## 🎯 영향받는 종목·섹터
   ## 🧭 향후 관전 포인트
   ※ 본 분석은 투자 참고용이며 매매 권유가 아닙니다.
   ```
2. **`reports/YYYY-MM-DD_<대상>.md`로 저장** (아카이브용. 파일명의 대상은 짧게, 공백은 `_`).
3. **`js/reports-data.js`의 `window.AppReports` 배열 맨 앞에 항목 추가** (페이지 "AI 리포트" 탭이 이 파일을 읽음):
   ```js
   {
     id: "YYYYMMDD-HHmm",
     date: "YYYY-MM-DD HH:mm",
     target: "코스피",            // 분석 대상
     direction: "급락 ▼",         // 급등 ▲ / 급락 ▼ / 혼조 등 (없으면 "")
     md: "## 📌 핵심 요약\n...",   // 리포트 전문 — JSON 문자열로 이스케이프(개행=\n, 따옴표 주의)
     sources: [{ url: "...", title: "..." }]
   },
   ```
   이 파일은 유효한 JS여야 페이지가 열린다. 수정 후 문법이 깨지지 않았는지 확인할 것.
4. 리포트 전문을 채팅에도 그대로 출력.
5. **git 커밋 + 푸시** — 리모트: https://github.com/1226cjw-afk/Invest-Stock (public).
   커밋 메시지 예: `리포트: 2026-07-08 코스피 급락 분석`. 코드 수정 시에도 작업 단위로 커밋·푸시.
   푸시하면 GitHub Pages(https://1226cjw-afk.github.io/Invest-Stock/)에 1~2분 내 자동 배포됨 (2026-07-11 개시).
   빌드 확인: `gh api repos/1226cjw-afk/Invest-Stock/pages/builds/latest --jq .status`

## 환경 주의

- 한글 파일은 Read 도구로 읽을 것 (PowerShell `Get-Content`는 인코딩 깨짐).
- API 키·비밀값을 코드/리포트에 절대 저장하지 말 것 (키는 브라우저 localStorage에만).
- 페이지 스크립트를 추가하면 `index.html`의 로드 순서(설정 → 데이터 → 코어 → ai-client → pages)를 지킬 것.
- JS 수정 후 `node --check <파일>`로 문법 확인. 로컬 서버는 `node serve.js`(:8804, Python 없음).
- 특정 탭 바로 열기: `index.html#탭id` (예: `#kr`, `#hot`) · 종목 상세 팝업 바로 열기: `?sym=KRX:005930`.
- TradingView 위젯 iframe **내부**의 문구·오역(차트 툴바 '날', 안내 팝업 등)은 우리가 못 고침 —
  위젯 밖 대체 구현(자체 시세박스 `App.renderQuoteBox`, 주기 셀렉트 `App.intervalSelect`)을 쓸 것.

## 데이터 소스 함정 (2026-07-08 확정)

- **scanner.tradingview.com fetch에 `content-type` 헤더 금지** — CORS 허용 헤더 목록에 없어
  preflight에서 거부됨(Failed to fetch). 문자열 body만 보내는 단순 요청으로 호출할 것.
- 스캐너는 단일 종목 시세(`symbols:{tickers:[…]}`)와 한글 이름 검색(`filter: description match`
  + `options.lang:'ko'`)도 지원 (2026-07-11 확인) — 위젯 대체 시 `App.fetchQuote`/`App.renderQuoteBox` 사용.
- **TradingView embed 히트맵은 한국 데이터셋(KOSPI 등) 미지원** — 조용히 SPX500으로 폴백.
  국내 섹터맵은 자체 트리맵(`js/pages/sectors.js`) 유지, 위젯으로 되돌리지 말 것.
- 브라우저용 API 검증 시 curl POST 성공만 믿지 말 것 — preflight(OPTIONS +
  `Access-Control-Request-Headers`)를 별도 확인해야 브라우저 동작과 일치.
- headless Edge는 file://·localhost 페이지의 외부 XHR을 차단함 — 단, **배포된 GitHub Pages
  (https://1226cjw-afk.github.io/Invest-Stock/)에서는 허용**되므로 push 후
  `msedge --headless=new --screenshot=... "…/?sym=KRX:005930"`으로 실렌더 검증 가능 (2026-07-11 확인).
  로컬 렌더 검증은 fetch 스텁 테스트 페이지로 할 것 (`test/`는 gitignore됨).
- **모바일 폭 검증 함정 (2026-07-29 확인)**: Windows headless Edge는 `--window-size=390,844`를 줘도
  뷰포트가 **483px 아래로 안 내려간다**(`--headless=old`도 동일). 스크린샷만 390px로 잘려 나와서
  멀쩡한 레이아웃이 "오른쪽이 잘린 것"처럼 보인다 — 이걸 버그로 오인하지 말 것.
  진짜 폰 폭은 **`<iframe width=390>` 안에 페이지를 띄워** 재현한다(iframe 뷰포트에 미디어쿼리가 적용됨).
  측정값은 iframe 안에서 `parent.postMessage` → 부모 DOM에 기록 → `--dump-dom`으로 읽으면 된다.
  넘침 판정은 눈이 아니라 `document.body.scrollWidth` vs `documentElement.clientWidth`로 할 것.
