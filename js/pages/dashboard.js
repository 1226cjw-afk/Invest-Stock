/* 01 대시보드 — 마켓 오버뷰 · 경제 캘린더 · 시장 뉴스 */
(function () {
  const C = window.AppConfig;

  App.registerPage({
    id: 'dash',
    label: '대시보드',
    order: 10,
    html: `
      <div class="grid">
        <div class="panel h-tall">
          <div class="panel-hd"><h2>글로벌 마켓 오버뷰</h2><span class="note">지수 · 환율 · 원자재</span></div>
          <div class="panel-bd" id="w-overview"></div>
        </div>
        <div class="col">
          <div class="panel h-mid">
            <div class="panel-hd"><h2>경제 캘린더</h2><span class="note">주요국 핵심 지표</span></div>
            <div class="panel-bd" id="w-events"></div>
          </div>
          <div class="panel h-mid">
            <div class="panel-hd"><h2>시장 뉴스</h2><span class="note">실시간 헤드라인</span></div>
            <div class="panel-bd" id="w-news"></div>
          </div>
        </div>
      </div>`,
    init() {
      App.tv('w-overview', 'market-overview', {
        ...App.DARK, dateRange: '3M', showChart: true,
        width: '100%', height: '100%',
        plotLineColorGrowing: '#f0a500', plotLineColorFalling: '#4a9eff',
        gridLineColor: 'rgba(42,52,65,0)', scaleFontColor: '#6b7684',
        belowLineFillColorGrowing: 'rgba(240,165,0,0.10)',
        belowLineFillColorFalling: 'rgba(74,158,255,0.10)',
        symbolActiveColor: 'rgba(240,165,0,0.12)',
        tabs: C.OVERVIEW_TABS,
      });
      App.tv('w-events', 'events', {
        ...App.DARK, width: '100%', height: '100%',
        countryFilter: C.CALENDAR_COUNTRIES, importanceFilter: '0,1',
      });
      App.tv('w-news', 'timeline', {
        ...App.DARK, feedMode: 'market', market: 'stock',
        displayMode: 'regular', width: '100%', height: '100%',
      });
    },
  });
})();
