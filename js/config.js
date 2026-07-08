/* ═══════════════════════════════════════════════════════════
   INVST://STOCK — 설정 파일
   심볼·목록·기본값은 전부 여기서만 수정하면 됩니다. (로직 無)
   나중에 웹 앱으로 이식할 때 이 파일이 곧 초기 데이터/설정이 됩니다.
═══════════════════════════════════════════════════════════ */
window.AppConfig = {

  /* localStorage 키 */
  STORAGE: {
    apiKey:    'invst_api_key',
    watchlist: 'invst_watchlist',
  },

  /* 상단 티커 테이프 */
  TAPE_SYMBOLS: [
    { proName: 'FOREXCOM:SPXUSD', title: 'S&P 500' },
    { proName: 'FOREXCOM:NSXUSD', title: '나스닥 100' },
    { proName: 'FOREXCOM:DJI',    title: '다우존스' },
    { proName: 'KRX:KOSPI',       title: '코스피' },
    { proName: 'KRX:KOSDAQ',      title: '코스닥' },
    { proName: 'FX_IDC:USDKRW',   title: '달러/원' },
    { proName: 'TVC:US10Y',       title: '미 10년물' },
    { proName: 'TVC:USOIL',       title: 'WTI 원유' },
    { proName: 'TVC:GOLD',        title: '금' },
    { proName: 'BINANCE:BTCUSDT', title: '비트코인' },
  ],

  /* 대시보드 마켓 오버뷰 탭 */
  OVERVIEW_TABS: [
    { title: '미국', symbols: [
      { s: 'FOREXCOM:SPXUSD', d: 'S&P 500' },
      { s: 'FOREXCOM:NSXUSD', d: '나스닥 100' },
      { s: 'FOREXCOM:DJI',    d: '다우존스' },
      { s: 'TVC:RUT',         d: '러셀 2000' },
      { s: 'TVC:VIX',         d: 'VIX 변동성' },
      { s: 'TVC:US10Y',       d: '미 10년물 금리' },
    ]},
    { title: '한국', symbols: [
      { s: 'KRX:KOSPI',     d: '코스피' },
      { s: 'KRX:KOSDAQ',    d: '코스닥' },
      { s: 'KRX:KOSPI200',  d: '코스피 200' },
      { s: 'FX_IDC:USDKRW', d: '달러/원 환율' },
    ]},
    { title: '글로벌·원자재', symbols: [
      { s: 'TVC:NI225',       d: '닛케이 225' },
      { s: 'TVC:HSI',         d: '항셍' },
      { s: 'XETR:DAX',        d: '독일 DAX' },
      { s: 'TVC:UKX',         d: '영국 FTSE 100' },
      { s: 'TVC:USOIL',       d: 'WTI 원유' },
      { s: 'TVC:GOLD',        d: '금' },
      { s: 'BINANCE:BTCUSDT', d: '비트코인' },
    ]},
  ],

  /* 경제 캘린더 국가 필터 */
  CALENDAR_COUNTRIES: 'us,kr,cn,jp,eu',

  /* 미국 섹터 히트맵 데이터셋 (TradingView embed dataSource) — 첫 항목이 기본값.
     ⚠ 임베드 위젯은 한국 데이터셋(KOSPI 등)을 지원하지 않고 SPX500으로 폴백함
       (2026-07-08 headless 렌더 테스트로 확인) → 국내는 아래 KR_HEATMAP 자체 구현 사용 */
  HEATMAP_SETS: {
    us: [
      ['SPX500', 'S&P 500'],
      ['NASDAQ100', '나스닥 100'],
      ['NASDAQCOMPOSITE', '나스닥 종합'],
      ['DJDJI', '다우존스'],
      ['AllUSA', '미국 전체'],
    ],
  },

  /* 국내 섹터 트리맵 (스캐너 API 자체 구현) */
  KR_HEATMAP: {
    indexes: [
      ['KRX:KOSPI', '코스피'],
      ['KRX:KOSPI200', '코스피 200'],
      ['KRX:KOSDAQ', '코스닥'],
      ['KRX:KOSDAQ150', '코스닥 150'],
    ],
    maxStocks: 160,       // 시총 상위 N종목만 표시 (가독성)
    colorMax: 3,          // 색 강도가 최대가 되는 등락률(%)
    /* TradingView 섹터 분류 → 한글 */
    sectorKo: {
      'Electronic Technology': '전자 기술',
      'Technology Services': '기술 서비스',
      'Finance': '금융',
      'Health Technology': '의료 기술',
      'Health Services': '의료 서비스',
      'Consumer Durables': '소비자 내구재',
      'Consumer Non-Durables': '소비자 비내구재',
      'Consumer Services': '소비자 서비스',
      'Producer Manufacturing': '생산자 제조',
      'Process Industries': '공정 산업',
      'Industrial Services': '산업 서비스',
      'Commercial Services': '상업 서비스',
      'Distribution Services': '유통 서비스',
      'Retail Trade': '소매업',
      'Transportation': '운송',
      'Utilities': '유틸리티',
      'Energy Minerals': '에너지',
      'Non-Energy Minerals': '비에너지 광물',
      'Communications': '통신',
      'Miscellaneous': '기타',
    },
  },

  /* 핫 종목 스캐너 (TradingView scanner API — 페이지 내 자체 테이블) */
  SCANNER: {
    rows: 30,
    markets: {
      america: {
        label: '🇺🇸 미국', scan: 'america', currency: 'USD',
        filter: [
          { left: 'type', operation: 'equal', right: 'stock' },
          { left: 'subtype', operation: 'in_range', right: ['common'] },
          { left: 'exchange', operation: 'in_range', right: ['NASDAQ', 'NYSE', 'AMEX'] },
          { left: 'close', operation: 'greater', right: 2 },
          { left: 'volume', operation: 'greater', right: 500000 },
        ],
      },
      korea: {
        label: '🇰🇷 한국', scan: 'korea', currency: 'KRW',
        filter: [
          { left: 'type', operation: 'equal', right: 'stock' },
          { left: 'subtype', operation: 'in_range', right: ['common'] },
          { left: 'volume', operation: 'greater', right: 10000 },
        ],
      },
    },
    screens: {
      top_gainers:      { label: '📈 급등주',       sortBy: 'change',           order: 'desc' },
      top_losers:       { label: '📉 급락주',       sortBy: 'change',           order: 'asc'  },
      volume_leaders:   { label: '🔥 거래량 상위',   sortBy: 'volume',           order: 'desc' },
      most_capitalized: { label: '🏦 시가총액 상위', sortBy: 'market_cap_basic', order: 'desc' },
    },
  },

  /* 지수 차트 사이드바 (그룹명 → [심볼, 표시명]) */
  CHART_GROUPS: [
    ['미국 지수', [
      ['FOREXCOM:SPXUSD', 'S&P 500'],
      ['FOREXCOM:NSXUSD', '나스닥 100'],
      ['FOREXCOM:DJI',    '다우존스'],
      ['TVC:RUT',         '러셀 2000'],
      ['TVC:VIX',         'VIX 변동성지수'],
    ]],
    ['한국 지수', [
      ['KRX:KOSPI',    '코스피'],
      ['KRX:KOSDAQ',   '코스닥'],
      ['KRX:KOSPI200', '코스피 200'],
    ]],
    ['아시아·유럽', [
      ['TVC:NI225', '닛케이 225'],
      ['TVC:HSI',   '항셍'],
      ['XETR:DAX',  '독일 DAX'],
      ['TVC:UKX',   '영국 FTSE 100'],
    ]],
    ['금리·환율·원자재', [
      ['TVC:US10Y',       '미 국채 10년물'],
      ['FX_IDC:USDKRW',   '달러/원'],
      ['TVC:DXY',         '달러 인덱스'],
      ['TVC:USOIL',       'WTI 원유'],
      ['TVC:GOLD',        '금'],
      ['BINANCE:BTCUSDT', '비트코인'],
    ]],
  ],

  /* AI 분석 대상 프리셋 */
  AI_TARGETS: [
    'S&P 500', '나스닥', '다우존스', '코스피', '코스닥',
    '미국 반도체 섹터', '미국 빅테크', '국내 반도체 섹터',
    '국내 2차전지 섹터', '국내 바이오 섹터',
    '원달러 환율', '미국 국채 금리', '유가(WTI)', '비트코인',
  ],

  /* Claude API 설정 — 웹 서비스로 확장 시 endpoint만 자체 프록시 서버로 교체 */
  AI: {
    endpoint: 'https://api.anthropic.com/v1/messages',
    model: 'claude-opus-4-8',
    maxTokens: 16000,
    maxWebSearches: 8,
    maxContinuations: 4,   // pause_turn(서버측 검색 루프 일시정지) 이어받기 횟수
  },

  /* 매매 시그널 기본 관심목록 */
  DEFAULT_WATCHLIST: ['NASDAQ:NVDA', 'NASDAQ:AAPL', 'NASDAQ:TSLA', 'KRX:005930', 'KRX:000660'],

  /* 시그널 페이지 최초 선택 심볼 */
  DEFAULT_SIGNAL_SYMBOL: 'NASDAQ:NVDA',
};
