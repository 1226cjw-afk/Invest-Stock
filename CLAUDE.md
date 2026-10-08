# INVST://STOCK — 투자 참조 터미널

로컬 주식투자 참조 페이지. `index.html` 더블클릭으로 실행(file:// 기준이므로 **ES module 금지**, 전역 네임스페이스 `App`/`AppConfig`/`AiClient` 유지). 구조·확장 가이드는 `README.md` 참조.

## 구조 요약

- `js/config.js` — 심볼·목록·필터·프리셋 전부 여기 (로직 없음). 종목/탭 데이터 수정은 이 파일만.
- `js/core.js` — 페이지 레지스트리, `App.tv(id,위젯,설정)` 위젯 팩토리, `App.openSymbolModal(sym,name)` 공용 상세 팝업, `App.store`,
  자체 시세박스 `App.renderQuoteBox`(내부 `App.fetchQuote`) · 여러 종목 일괄 조회 `App.fetchQuotes`
  (시장별 병렬 — 대시보드 요약 카드가 사용) · 심볼→스캐너 시장 판별 `App.scanRegion`
  (KRX=korea, FX_IDC/FOREXCOM=forex, BINANCE=crypto, 나머지=america) ·
  주기 셀렉트 `App.intervalSelect` · 포맷터 `App.fmt` ·
  자체 기술적 분석 게이지 `App.taWidget(id,sym,주기)`(스캐너 `Recommend.*`, 위젯 아님 — Promise로 `{desc,iv}` 반환) ·
  국내 차트 `App.krxChart(id,sym)`(네이버 금융 차트 이미지 — KRX는 TV 위젯이 막음).
- `js/breadth.js` — 헤더 티커 아래 **시장 폭 스트립**(전역, 탭 아님). 지수 구성종목을 통째로 받아
  상승/보합/하락 종목 수·거래대금·상한가를 직접 집계하고 시장 온도(상승÷(상승+하락)×100)를 낸다.
  세그먼트를 누르면 `AppHot.goto(시장, 지수)`로 핫 종목 탭이 그 지수로 열림. 설정은 `AppConfig.BREADTH`.
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
- 페이지 스크립트를 추가하면 `index.html`의 로드 순서(설정 → 데이터 → 코어 → breadth → ai-client → pages)를 지킬 것.
- 헤더 쪽에 줄을 더하거나 빼면 CSS 토큰 **`--chrome`**(고정 요소가 먹는 세로 높이)만 고치면 된다.
  꽉 차는 패널들이 `calc(100vh - var(--chrome))`로 높이를 잡으므로 여기가 어긋나면 전 탭이 함께 어긋난다.
- 색은 **한국 관례**: 상승 빨강(`--up`) · 하락 파랑(`--down`). 서구식 green-up으로 만들지 말 것.
- 가로로 늘어나는 줄(`nav`·`.controls`·`.bd-strip`)은 모바일에서 **줄바꿈이 아니라 가로 스크롤**이
  관례 — 버튼이 늘면 줄이 쌓여 본문을 가린다 (실측: 컨트롤이 4줄 191px까지 쌓여 표를 덮음).
- JS 수정 후 `node --check <파일>`로 문법 확인. 로컬 서버는 `node serve.js`(:8804, Python 없음).
- 특정 탭 바로 열기: `index.html#탭id` (예: `#kr`, `#hot`) · 종목 상세 팝업 바로 열기: `?sym=KRX:005930`.
- TradingView 위젯 iframe **내부**의 문구·오역(차트 툴바 '날', 안내 팝업 등)은 우리가 못 고침 —
  위젯 밖 대체 구현(자체 시세박스 `App.renderQuoteBox`, 주기 셀렉트 `App.intervalSelect`)을 쓸 것.

## 데이터 소스 함정 (2026-07-08 확정)

- **scanner.tradingview.com fetch에 `content-type` 헤더 금지** — CORS 허용 헤더 목록에 없어
  preflight에서 거부됨(Failed to fetch). 문자열 body만 보내는 단순 요청으로 호출할 것.
- 스캐너는 단일 종목 시세(`symbols:{tickers:[…]}`)와 한글 이름 검색(`filter: description match`
  + `options.lang:'ko'`)도 지원 (2026-07-11 확인) — 위젯 대체 시 `App.fetchQuote`/`App.renderQuoteBox` 사용.
- **거래대금 컬럼명은 `Value.Traded`** — `value_traded`·`turnover`·`total_value_traded`는 항상 `null`이
  오고 그 컬럼으로 정렬하면 **에러 없이 뒤죽박죽 결과**가 온다 (2026-08-03 확인).
- **지수 구성종목 한정은 `symbols:{groups:[{type:'index',values:['KRX:KOSPI']}]}`로만 동작.**
  `filter`에 `left:'index'`를 넣으면 조용히 0건이 온다. `symbols.groups`와 `filter`는 함께 써도 됨.
- `range:[0,1]`로 보내면 `totalCount`에 조건 충족 종목 수가 온다(시장 폭 카운트에 사용 가능).
  다만 방향별로 요청이 나뉘므로, 구성종목을 통째로 받아 세는 편이 싸다 — `js/breadth.js` 참조
  (코스피 808종목 42KB · 코스닥 1727종목 89KB · SPX 28KB · NDX 6KB, 각 ~450ms).
- **TradingView 무료 위젯은 KRX 전부 + 일부 TVC 심볼을 막는다 (2026-10-08 확인)** — 위젯 안에
  "TradingView에서만 사용할 수 있습니다"가 뜬다. 콘솔 에러도 네트워크 실패도 없어서 **스크린샷으로만 보인다**.
  막힘: `KRX:*`(종목·지수 전부) · `TVC:VIX/US10Y/DXY/RUT/NI225/HSI/UKX/SPX` · `SP:SPX` · `CBOE:*`.
  대체 확인: `CAPITALCOM:VIX`·`FRED:DGS10`·`CAPITALCOM:DXY`·`FOREXCOM:US2000/JP225/HKXHKD/UKXGBP`.
  위젯에 심볼을 추가할 땐 `test/`에 single-quote 위젯 격자 페이지를 만들어 스크린샷으로 먼저 확인할 것.
  스캐너 API는 이 제한과 무관(현황 요약의 `TVC:VIX`·`KRX:*`는 정상).
- **국내 일봉 이력은 브라우저에서 못 받는다** — 야후(`query1.finance.yahoo.com`)·네이버 API 모두
  CORS 헤더가 없다(2026-10-08 확인). 그래서 `<img>`로 받는 네이버 차트 이미지
  `ssl.pstatic.net/imgfinance/chart/mobile/{day|candle/day|candle/week|candle/month}/{코드}_end.png`를 쓴다
  (종목은 6자리 코드, 지수는 `KOSPI`·`KOSDAQ`·`KPI200`). 진짜 캔들 데이터가 필요하면 Workers 프록시가 필요.
- **TradingView embed 히트맵은 한국 데이터셋(KOSPI 등) 미지원** — 조용히 SPX500으로 폴백.
  국내 섹터맵은 자체 트리맵(`js/pages/sectors.js`) 유지, 위젯으로 되돌리지 말 것.
- 브라우저용 API 검증 시 curl POST 성공만 믿지 말 것 — preflight(OPTIONS +
  `Access-Control-Request-Headers`)를 별도 확인해야 브라우저 동작과 일치.
- **렌더 검증 순서: ① 로컬 `node serve.js`에 CDP로 붙어 실데이터 확인 → ② 커밋·푸시 →
  ③ 배포본에서 재확인.** 배포본(https://1226cjw-afk.github.io/Invest-Stock/)은
  `?sym=KRX:005930` 같은 쿼리로 바로 열어 볼 수 있다.
  ⚠ "headless Edge가 localhost 외부 XHR을 차단한다"(2026-07-11 메모)는 `--screenshot` 단발 실행
  한정이며, `--remote-debugging-port`로 띄우면 통과한다 (2026-08-03 정정 — 아래 CDP 항목).
  따라서 fetch 스텁 테스트 페이지는 더 이상 필요 없다 (`test/`는 gitignore됨).
- **모바일 폭 검증 함정 (2026-07-29 확인)**: Windows headless Edge는 `--window-size=390,844`를 줘도
  뷰포트가 **483px 아래로 안 내려간다**(`--headless=old`도 동일). 스크린샷만 390px로 잘려 나와서
  멀쩡한 레이아웃이 "오른쪽이 잘린 것"처럼 보인다 — 이걸 버그로 오인하지 말 것.
  넘침 판정은 눈이 아니라 `document.body.scrollWidth` vs `documentElement.clientWidth`로 할 것.
- **CDP를 쓰면 위 함정이 통째로 사라진다 (2026-08-03 확인, 권장 방법)**: `--remote-debugging-port`로
  띄우고 `Emulation.setDeviceMetricsOverride{width:390,height:844,mobile:true}`를 보내면
  `clientWidth`가 실제로 390이 된다(iframe 우회 불필요). Node 24의 전역 `WebSocket`으로 바로 붙을 수 있음.
  이 방식이면 `--dump-dom` 대신 `Runtime.evaluate`로 아무 값이나 측정하고, 클릭·탭 전환까지 스크립트로 검증 가능.
  덤으로 **remote-debugging으로 띄운 Edge는 localhost 페이지의 외부 XHR도 통과시킨다** —
  `node serve.js`(:8804)에 붙이면 배포 전에 실데이터 렌더를 로컬에서 확인할 수 있다.
- `--virtual-time-budget`은 웹소켓으로 실시간 연결을 유지하는 사이트에서 **영원히 끝나지 않는다**
  (가상 시간이 진행되지 않음). 그런 페이지는 실제 `setTimeout` 대기로 렌더를 기다릴 것.
- 티커 테이프 위젯은 `displayMode:'adaptive'`면 좁은 화면에서 여러 줄로 쌓여 46px짜리 `#tape`를
  넘쳐 아래 줄을 덮는다 → `'regular'` 고정 + `#tape{overflow:hidden}` (2026-08-03 390px 실측).
