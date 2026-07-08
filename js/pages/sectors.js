/* 02·03 섹터 히트맵 — 미국 / 국내
   위젯 내장 데이터셋 선택기(isDataSetEnabled)는 두 iframe이 설정을 공유해
   마지막 선택이 다른 탭까지 덮어쓰므로 끄고, 자체 버튼으로 전환한다. */
(function () {
  const C = window.AppConfig;

  function heatmap(elId, dataSource) {
    App.tv(elId, 'stock-heatmap', {
      locale: 'kr', colorTheme: 'dark',
      dataSource, grouping: 'sector',
      blockSize: 'market_cap_basic', blockColor: 'change',
      exchanges: [], hasTopBar: false, isDataSetEnabled: false,
      isZoomEnabled: true, hasSymbolTooltip: true, isMonoSize: false,
      width: '100%', height: '100%',
    });
  }

  /* 데이터셋 전환 버튼을 만들고 첫 항목을 기본 렌더 */
  function setupControls(pageId, widgetId, sets) {
    const wrap = document.getElementById(pageId + '-sets');
    sets.forEach(([id, label], i) => {
      const b = document.createElement('button');
      b.className = 'ctl' + (i === 0 ? ' active' : '');
      b.textContent = label;
      b.onclick = () => {
        wrap.querySelectorAll('.ctl').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        heatmap(widgetId, id);
      };
      wrap.appendChild(b);
    });
    heatmap(widgetId, sets[0][0]);
  }

  App.registerPage({
    id: 'us',
    label: '미국 섹터맵',
    order: 20,
    html: `
      <div class="panel h-full">
        <div class="panel-hd"><h2>미국 주식 섹터 히트맵</h2>
          <span class="note">블록 크기 = 시가총액 · 색 = 등락률 · 휠로 확대/축소</span></div>
        <div class="controls" id="us-sets"></div>
        <div class="panel-bd" id="w-heat-us"></div>
      </div>`,
    init() { setupControls('us', 'w-heat-us', C.HEATMAP_SETS.us); },
  });

  App.registerPage({
    id: 'kr',
    label: '국내 섹터맵',
    order: 30,
    html: `
      <div class="panel h-full">
        <div class="panel-hd"><h2>국내 주식 섹터 히트맵</h2>
          <span class="note">블록 크기 = 시가총액 · 색 = 등락률 · 휠로 확대/축소</span></div>
        <div class="controls" id="kr-sets"></div>
        <div class="panel-bd" id="w-heat-kr"></div>
      </div>`,
    init() { setupControls('kr', 'w-heat-kr', C.HEATMAP_SETS.kr); },
  });
})();
