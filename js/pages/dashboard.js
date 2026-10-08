/* 01 대시보드 — 마켓 오버뷰 · 경제 캘린더 · 시장 뉴스 */
(function () {
  const C = window.AppConfig;

  /* ── 현황 요약 카드 ────────────────────────────────
     TradingView iframe 없이 스캐너 API로 직접 그림 — 모바일에서 즉시 뜨는 것이 목적.
     "폰에서 열면 이 한 화면만 보고 끝낼 수 있게"가 설계 의도 */
  async function renderSummary() {
    const host = document.getElementById('sum-cards');
    const stamp = document.getElementById('sum-stamp');
    if (!host) return;
    stamp.textContent = '불러오는 중…';

    let quotes;
    try {
      quotes = await App.fetchQuotes(C.SUMMARY_SYMBOLS);
    } catch (e) {
      stamp.textContent = '조회 실패 — 눌러서 재시도';
      host.innerHTML = `<div class="err">시세를 불러오지 못했습니다: ${App.esc(e.message)}</div>`;
      return;
    }

    host.innerHTML = '';
    C.SUMMARY_SYMBOLS.forEach(item => {
      const q = quotes.get(item.sym);
      const card = document.createElement('button');
      card.className = 'sum-card';
      if (!q) {
        card.classList.add('na');
        card.innerHTML = `<span class="sc-label">${App.esc(item.label)}</span><span class="sc-price">—</span>`;
      } else {
        const chg = q.change || 0;
        /* 반올림하면 0.00%가 되는 값에 ▲▼를 붙이면 오류처럼 보인다 → 보합으로 표시 */
        const flat = Math.abs(chg) < 0.005;
        const arrow = flat ? '—' : (chg > 0 ? '▲' : '▼');
        card.classList.add(flat ? 'flat' : (chg > 0 ? 'up' : 'dn'));
        card.innerHTML =
          `<span class="sc-label">${App.esc(item.label)}</span>` +
          `<span class="sc-price">${App.fmt.idx(q.close)}</span>` +
          `<span class="sc-chg">${arrow} ${Math.abs(chg).toFixed(2)}%</span>`;
        card.onclick = () => App.openSymbolModal(item.sym, item.label);
      }
      host.appendChild(card);
    });

    stamp.textContent = '갱신 ' + new Date().toLocaleTimeString('ko-KR') + ' · 눌러서 새로고침';

    /* 최신 AI 리포트 한 줄 */
    const foot = document.getElementById('sum-foot');
    const latest = (window.AppReports || [])[0];
    /* 경과일 — 오래된 리포트를 "오늘 것"으로 착각하지 않도록 */
    const days = latest ? Math.floor((Date.now() - new Date(latest.date.slice(0, 10) + 'T00:00:00+09:00')) / 864e5) : 0;
    const age = days >= 1 ? ` <span class="sf-age">(${days}일 전)</span>` : '';
    foot.innerHTML = latest
      ? `<b>최신 리포트</b> ${App.esc(latest.date)}${age} · ${App.esc(latest.target)}` +
        `${latest.direction ? ' ' + App.esc(latest.direction) : ''} <span class="sf-go">전문 보기 →</span>`
      : '<b>최신 리포트</b> 아직 없음';
    foot.onclick = latest ? () => App.show('reports') : null;
    foot.classList.toggle('clickable', !!latest);
  }

  App.registerPage({
    id: 'dash',
    label: '대시보드',
    order: 10,
    html: `
      <div class="panel sum-panel">
        <div class="panel-hd"><h2>현황 요약</h2><span class="note" id="sum-stamp">불러오는 중…</span></div>
        <div class="sum-cards" id="sum-cards"></div>
        <div class="sum-foot" id="sum-foot"></div>
      </div>
      <div class="grid mt">
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
      renderSummary();
      document.getElementById('sum-stamp').onclick = renderSummary;

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
