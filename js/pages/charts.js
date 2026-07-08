/* 05 지수 차트 — 사이드바에서 지수/환율/원자재 선택 → 고급 차트 */
(function () {
  const C = window.AppConfig;

  function renderChart(sym) {
    App.tv('w-chart', 'advanced-chart', {
      autosize: true, symbol: sym, interval: 'D',
      timezone: 'Asia/Seoul', theme: 'dark', style: '1', locale: 'kr',
      backgroundColor: '#0d1117', gridColor: 'rgba(42,52,65,0.5)',
      withdateranges: true, allow_symbol_change: true, hide_side_toolbar: false,
      calendar: false, support_host: 'https://www.tradingview.com',
    });
  }

  App.registerPage({
    id: 'chart',
    label: '지수 차트',
    order: 50,
    html: `
      <div class="grid">
        <div class="panel symlist" id="chart-list"></div>
        <div class="panel"><div class="panel-bd" id="w-chart"></div></div>
      </div>`,
    init() {
      const list = document.getElementById('chart-list');
      C.CHART_GROUPS.forEach(([group, syms]) => {
        const g = document.createElement('div');
        g.className = 'group'; g.textContent = group;
        list.appendChild(g);
        syms.forEach(([sym, name]) => {
          const b = document.createElement('button');
          b.className = 'symbtn';
          b.innerHTML = `${App.esc(name)}<small>${App.esc(sym)}</small>`;
          b.onclick = () => {
            list.querySelectorAll('.symbtn').forEach(x => x.classList.remove('active'));
            b.classList.add('active');
            renderChart(sym);
          };
          list.appendChild(b);
        });
      });
      const first = list.querySelector('.symbtn');
      first.classList.add('active');
      renderChart(C.CHART_GROUPS[0][1][0][0]);
    },
  });
})();
