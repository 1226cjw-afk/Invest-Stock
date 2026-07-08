/* 07 매매 시그널 — TradingView 기술적 분석 게이지 + 관심목록 보드 */
(function () {
  const C = window.AppConfig;

  const getWatch = () => App.store.get(C.STORAGE.watchlist, C.DEFAULT_WATCHLIST.slice());
  const setWatch = w => App.store.set(C.STORAGE.watchlist, w);

  function taWidget(elId, sym) {
    App.tv(elId, 'technical-analysis', {
      colorTheme: 'dark', locale: 'kr', isTransparent: true,
      interval: '1D', width: '100%', height: '100%', symbol: sym,
      showIntervalTabs: true, displayMode: 'single',
    });
  }

  function renderSelected(sym) {
    document.getElementById('sig-title').textContent = sym + ' — 종합 시그널';
    App.tv('w-syminfo', 'symbol-info', { ...App.DARK, symbol: sym, width: '100%' });
    taWidget('w-ta-main', sym);
  }

  function renderWatch() {
    const grid = document.getElementById('watch-grid');
    grid.innerHTML = '';
    getWatch().forEach(sym => {
      const cell = document.createElement('div');
      cell.className = 'watch-cell panel h-ta';
      const x = document.createElement('button');
      x.className = 'watch-x'; x.textContent = '✕'; x.title = sym + ' 제거';
      x.onclick = () => { setWatch(getWatch().filter(s => s !== sym)); renderWatch(); };
      const hd = document.createElement('div');
      hd.className = 'panel-hd'; hd.innerHTML = `<h2>${App.esc(sym)}</h2>`;
      const bd = document.createElement('div');
      bd.className = 'panel-bd';
      bd.id = 'ta-' + sym.replace(/[^A-Za-z0-9]/g, '_');
      cell.append(x, hd, bd);
      grid.appendChild(cell);
      taWidget(bd.id, sym);
    });
  }

  /* 심볼 정규화: 6자리 숫자 → KRX, 거래소 생략 → NASDAQ */
  function normSym(v) {
    v = v.trim().toUpperCase();
    if (!v) return null;
    if (/^\d{6}$/.test(v)) return 'KRX:' + v;
    if (!v.includes(':')) return 'NASDAQ:' + v;
    return v;
  }

  App.registerPage({
    id: 'sig',
    label: '매매 시그널',
    order: 70,
    html: `
      <div class="panel">
        <div class="panel-hd">
          <h2>기술적 분석 매수/매도 시그널</h2>
          <span class="note">오실레이터 + 이동평균 종합 · 게이지 안에서 기간(1분~1개월) 전환 가능</span>
        </div>
        <div class="sig-form">
          <input type="text" id="sig-input" placeholder="심볼 입력 (예: NASDAQ:AAPL, KRX:005930)">
          <button class="btn-sm" id="sig-go">조회</button>
          <button class="btn-sm btn-ghost" id="sig-add">+ 관심목록에 추가</button>
          <span class="hint" style="margin:0">한국 종목은 KRX:종목코드 (삼성전자=KRX:005930) · 미국은 거래소:티커 (NASDAQ:NVDA, NYSE:KO)</span>
        </div>
      </div>

      <div id="sig-selected">
        <div class="panel h-info"><div class="panel-bd" id="w-syminfo"></div></div>
        <div class="panel h-ta"><div class="panel-hd"><h2 id="sig-title">—</h2></div><div class="panel-bd" id="w-ta-main"></div></div>
      </div>

      <div class="panel mt">
        <div class="panel-hd"><h2>관심목록 시그널 보드</h2><span class="note">종합 판단: 적극매수/매수/중립/매도/적극매도</span></div>
      </div>
      <div class="watch-grid" id="watch-grid"></div>`,
    init() {
      renderSelected(C.DEFAULT_SIGNAL_SYMBOL);
      renderWatch();
      const go = () => {
        const s = normSym(document.getElementById('sig-input').value);
        if (s) renderSelected(s);
      };
      document.getElementById('sig-go').onclick = go;
      document.getElementById('sig-input').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
      document.getElementById('sig-add').onclick = () => {
        const s = normSym(document.getElementById('sig-input').value);
        if (!s) return;
        const w = getWatch();
        if (!w.includes(s)) { w.push(s); setWatch(w); renderWatch(); }
      };
    },
  });
})();
