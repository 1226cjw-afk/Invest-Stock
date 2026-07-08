# INVST://STOCK — 투자 참조 터미널

미국·국내 주식을 한 화면에서 참조하기 위한 로컬 웹페이지.
TradingView 무료 위젯(시세·히트맵·스크리너·차트·기술적 분석)과
Claude API(웹 검색 기반 급등락 원인 분석)를 조합했다.

> ⚠ 모든 정보는 투자 **참고용**이다. 기술적 시그널·AI 분석 모두 매매 권유가 아니다.

## 실행 방법

- **그냥 쓰기**: `index.html` 더블클릭.
- **위젯/AI 호출이 안 뜰 때** (브라우저의 file:// 제한 등): 로컬 서버로 실행.
  ```
  cd C:\Users\1226c\Projects\Invest_Stock
  node serve.js
  ```
  → 브라우저에서 `http://localhost:8804`
  (이 PC에는 Python이 설치되어 있지 않아 Node 기반 `serve.js`를 동봉함)

숫자키 `1`~`7`로 탭 전환.

## 화면 구성

| # | 탭 | 내용 |
|---|---|---|
| 1 | 대시보드 | 글로벌 지수/환율/원자재 오버뷰 · 경제 캘린더 · 시장 뉴스 |
| 2 | 미국 섹터맵 | S&P 500 섹터 히트맵 — TradingView 위젯 (나스닥100·다우 등 전환) |
| 3 | 국내 섹터맵 | 코스피/코스닥 섹터 트리맵 — **자체 구현** (스캐너 API + squarified treemap, 타일 클릭 = 상세 팝업, 빨강=상승/파랑=하락) |
| 4 | 핫 종목 | 급등/급락/거래량/시총 자체 테이블 — **종목 클릭 시 페이지 안 팝업**(차트+시그널)으로 상세 확인 |
| 5 | 지수 차트 | 주요 지수·금리·환율·원자재 고급 차트 |
| 6 | 급등락 AI 분석 | Claude + 웹 검색으로 급등락 원인 리포트 생성 (API 키 필요) |
| 7 | AI 리포트 | Claude Code 세션에서 분석·저장한 리포트 보관함 (API 키 불필요) |
| 8 | 매매 시그널 | TradingView 기술적 분석 게이지(적극매수~적극매도) + 관심목록 보드 |

### API 키 없이 AI 분석 쓰는 법 (권장 워크플로)
이 폴더에서 Claude Code를 열고 "오늘 코스피 왜 빠졌는지 분석해줘"처럼 물어보면,
Claude Code가 웹 검색으로 리포트를 작성한 뒤 `reports/`(마크다운 원본)와
`js/reports-data.js`(페이지 표시용)에 자동 저장한다 — 규칙은 `CLAUDE.md`에 정의.
저장 후 페이지를 새로고침하면 **AI 리포트 탭**에서 볼 수 있다.

헤더에는 KST/ET 시계와 KRX·NYSE 장 운영 상태(프리장/정규장/애프터장)가 실시간 표시된다
(공휴일은 미반영 — 요일·시간 기준).

## 폴더 구조 (확장을 전제로 설계)

```
Invest_Stock/
├── index.html            # 뼈대만. 탭/섹션은 페이지 모듈이 자동 생성
├── css/
│   └── terminal.css      # 디자인 토큰(:root) + 컴포넌트 스타일
├── js/
│   ├── config.js         # ★ 심볼·목록·기본값 전부 여기 (로직 없음)
│   ├── core.js           # 페이지 레지스트리·위젯 팩토리·시계·유틸
│   ├── ai-client.js      # Claude API 호출 (프롬프트·응답 파싱 분리)
│   └── pages/            # 화면 모듈 — 파일 1개 = 탭 1개
│       ├── dashboard.js
│       ├── sectors.js
│       ├── hot.js
│       ├── charts.js
│       ├── analysis.js
│       └── signals.js
└── README.md
```

> ES module 대신 전역 네임스페이스(`App`, `AppConfig`, `AiClient`)를 쓴 이유:
> `file://` 로 더블클릭 실행할 때 브라우저가 `type="module"`을 차단하기 때문.
> 로컬 서버로만 쓸 거라면 module로 바꿔도 무방하다.

## 확장 가이드

### 1. 심볼/목록 추가 — `js/config.js`만 수정
- 티커 테이프: `TAPE_SYMBOLS`
- 대시보드 오버뷰 탭: `OVERVIEW_TABS`
- 지수 차트 사이드바: `CHART_GROUPS`
- AI 분석 프리셋: `AI_TARGETS`
- 기본 관심목록: `DEFAULT_WATCHLIST`

한국 종목 심볼 형식은 `KRX:종목코드`(예: 삼성전자 `KRX:005930`),
미국은 `거래소:티커`(예: `NASDAQ:NVDA`, `NYSE:KO`).

### 2. 새 탭(화면) 추가 — 파일 1개 + script 태그 1줄
`js/pages/mypage.js`:
```js
(function () {
  App.registerPage({
    id: 'mypage',            // 고유 id → 섹션 id는 page-mypage
    label: '내 화면',         // 탭 이름
    order: 80,               // 탭 정렬 순서
    html: `<div class="panel h-full">
             <div class="panel-hd"><h2>제목</h2></div>
             <div class="panel-bd" id="w-my"></div>
           </div>`,
    init() {                 // 탭 첫 진입 시 1회 실행 (lazy load)
      App.tv('w-my', 'advanced-chart', { autosize: true, symbol: 'KRX:005930', theme: 'dark', locale: 'kr' });
    },
  });
})();
```
그리고 `index.html`의 페이지 스크립트 목록에 `<script src="js/pages/mypage.js"></script>` 추가. 끝.

### 3. TradingView 위젯 추가
`App.tv(컨테이너id, 위젯이름, 설정객체)` 한 줄이면 된다.
위젯 이름은 embed 스크립트 파일명 기준: `advanced-chart`, `stock-heatmap`, `screener`,
`market-overview`, `technical-analysis`, `timeline`, `events`, `symbol-info`, `ticker-tape` 등.
전체 목록·옵션: https://www.tradingview.com/widget-docs/widgets/

### 4. 테마 변경
`css/terminal.css` 상단 `:root` 디자인 토큰만 바꾸면 전체 적용.
(참고: 한국 관례에 맞춰 `--up`=빨강, `--down`=파랑)

### 5. 정식 웹 서비스로 발전시킬 때 (로드맵)

1. **API 키 보안 (필수)** — 지금은 개인 로컬용이라 브라우저에서 Anthropic API를
   직접 호출한다(`anthropic-dangerous-direct-browser-access`). 여러 사람이 접속하는
   서버에 배포하면 키가 노출되므로, 반드시 백엔드 프록시(예: `POST /api/analyze`)를
   만들어 키를 서버 환경변수로 옮기고 `config.js`의 `AI.endpoint`만 교체할 것.
   `ai-client.js`의 프롬프트/응답 파싱 로직은 그대로 서버로 이식 가능.
2. **프레임워크 이식** — `config.js`(데이터), `ai-client.js`(API), 각 페이지 모듈(화면)이
   이미 분리되어 있어 React/Next.js 컴포넌트로 1:1 대응된다.
   TradingView 위젯은 React에서도 동일한 embed 스크립트 방식을 쓴다.
3. **데이터 소스 업그레이드(선택)** — 위젯 대신 원시 데이터가 필요해지면:
   국내(KRX 정보데이터시스템 API, 한국투자증권 OpenAPI), 미국(yfinance, Polygon, Finnhub) 등을
   백엔드에서 수집해 자체 차트/알림으로 확장.
4. **추가 아이디어** — 관심목록 서버 동기화(로그인), 급등락 자동 감지 + AI 분석 자동 실행,
   텔레그램/이메일 알림, 종목별 AI 분석(재무제표 + 뉴스), 백테스트 화면.

## 알아두면 좋은 것

- TradingView 무료 위젯 시세는 거래소에 따라 **지연 시세**일 수 있다.
- **TradingView embed 히트맵 위젯은 한국 데이터셋을 지원하지 않는다** (`dataSource:"KOSPI"` 등을
  넣어도 조용히 SPX500으로 폴백 — 2026-07-08 headless 렌더 대조 실험으로 확인. NASDAQ100은
  정상 적용되므로 설정 전달 문제가 아니라 임베드 앱의 값 거부). 그래서 국내 섹터맵은
  스캐너 API + 자체 squarified treemap으로 구현했다 (`js/pages/sectors.js`,
  설정은 `config.js`의 `KR_HEATMAP` — 지수 목록·표시 종목 수·색 스케일·섹터 한글 매핑).
  미국용 위젯 dataSource: `SPX500·NASDAQ100·NASDAQCOMPOSITE·DJDJI·AllUSA` (`HEATMAP_SETS.us`).
- 핫 종목·국내 섹터맵은 TradingView 공개 스캐너 API(`scanner.tradingview.com/{market}/scan`)를
  직접 호출한다(`options.lang:"ko"`로 한글 종목명). 필터·정렬 프리셋은 `config.js`의 `SCANNER`.
  **주의: fetch에 `content-type` 헤더를 붙이면 안 된다** — 스캐너의 CORS 허용 헤더 목록에
  content-type이 없어 preflight에서 거부됨(Failed to fetch). 헤더 없이 보내는 단순 요청은
  preflight이 없어 file://·localhost 모두 통과 (2026-07-08 확인).
- AI 분석은 `claude-opus-4-8` + 웹 검색 도구를 사용하며, 1회당 검색 횟수 최대 8회
  (`config.js`의 `AI.maxWebSearches`로 조절). 호출 비용은 Anthropic 콘솔에서 확인.
