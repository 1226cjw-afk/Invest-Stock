/* 04 핫 종목 — TradingView 스캐너 API로 자체 테이블 렌더링
   (종목 클릭 시 외부 링크 대신 페이지 내 상세 팝업: 차트 + 종목정보 + 매매시그널)
   API 검증: scanner.tradingview.com 은 CORS 전면 허용이라 file:// 에서도 동작 */
(function () {
  const C = window.AppConfig;
  let mkt = 'america';
  let scr = 'top_gainers';

  /* ── 포맷터 ─────────────────────────────────────── */
  function fmtPrice(v, cur) {
    if (v == null) return '—';
    return cur === 'KRW'
      ? Math.round(v).toLocaleString('ko-KR') + '원'
      : '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtCap(v, cur) {
    if (!v) return '—';
    if (cur === 'KRW') {
      if (v >= 1e12) return (v / 1e12).toFixed(1) + '조';
      return Math.round(v / 1e8).toLocaleString('ko-KR') + '억';
    }
    if (v >= 1e12) return '$' + (v / 1e12).toFixed(2) + 'T';
    if (v >= 1e9) return '$' + (v / 1e9).toFixed(1) + 'B';
    return '$' + Math.round(v / 1e6).toLocaleString() + 'M';
  }
  function fmtVol(v) {
    if (!v) return '—';
    if (v >= 1e8) return (v / 1e8).toFixed(1) + '억';
    if (v >= 1e4) return Math.round(v / 1e4).toLocaleString() + '만';
    return v.toLocaleString();
  }

  /* ── 스캐너 호출 ─────────────────────────────────── */
  async function scan() {
    const m = C.SCANNER.markets[mkt];
    const s = C.SCANNER.screens[scr];
    /* ⚠ content-type 헤더 금지 — 스캐너 CORS가 이 헤더를 허용하지 않아
       preflight에서 실패함. 헤더 없이 = 단순 요청 = preflight 없음 (sectors.js 참조) */
    const r = await fetch(`https://scanner.tradingview.com/${m.scan}/scan`, {
      method: 'POST',
      body: JSON.stringify({
        options: { lang: 'ko' },
        filter: m.filter,
        columns: ['name', 'description', 'close', 'change', 'volume', 'market_cap_basic', 'logoid'],
        sort: { sortBy: s.sortBy, sortOrder: s.order },
        range: [0, C.SCANNER.rows],
      }),
    });
    if (!r.ok) throw new Error('스캐너 응답 오류 HTTP ' + r.status);
    return (await r.json()).data || [];
  }

  /* ── 테이블 렌더 ─────────────────────────────────── */
  async function render() {
    const box = document.getElementById('hot-table');
    const stamp = document.getElementById('hot-stamp');
    box.innerHTML = '<div class="placeholder"><span class="big">◌</span>불러오는 중…</div>';
    try {
      const rows = await scan();
      const cur = C.SCANNER.markets[mkt].currency;
      let html = `<table class="hot-table"><thead><tr>
        <th>#</th><th style="text-align:left">종목</th><th>현재가</th><th>등락률</th><th>거래량</th><th>시가총액</th>
      </tr></thead><tbody>`;
      rows.forEach((row, i) => {
        const [name, desc, close, change, volume, cap, logoid] = row.d;
        const sym = row.s;                       // 예: "KRX:005930"
        const up = (change || 0) >= 0;
        const logo = logoid
          ? `<img class="stock-logo" src="https://s3-symbol-logo.tradingview.com/${logoid}.svg" onerror="this.remove()" alt="">`
          : `<span class="stock-logo lg-txt">${App.esc((name || '?')[0])}</span>`;
        html += `<tr class="hot-row" data-sym="${App.esc(sym)}" data-name="${App.esc(desc || name)}">
          <td class="dim">${i + 1}</td>
          <td class="nm">${logo}<span><b>${App.esc(desc || name)}</b><small>${App.esc(sym)}</small></span></td>
          <td class="num">${fmtPrice(close, cur)}</td>
          <td class="num ${up ? 'up' : 'dn'}">${up ? '▲' : '▼'} ${Math.abs(change ?? 0).toFixed(2)}%</td>
          <td class="num dim">${fmtVol(volume)}</td>
          <td class="num dim">${fmtCap(cap, cur)}</td>
        </tr>`;
      });
      html += '</tbody></table>';
      box.innerHTML = html;
      stamp.textContent = '갱신 ' + new Date().toLocaleTimeString('ko-KR') + ' · 종목 클릭 = 상세 보기';
      box.querySelectorAll('.hot-row').forEach(tr =>
        tr.onclick = () => App.openSymbolModal(tr.dataset.sym, tr.dataset.name));
    } catch (e) {
      box.innerHTML = `<div class="err"><b>목록을 불러오지 못했습니다:</b> ${App.esc(e.message)}<br>
        네트워크 문제일 수 있습니다. 잠시 후 <b>새로고침</b>을 눌러 다시 시도하세요.</div>`;
      stamp.textContent = '오류';
    }
  }

  /* ── 페이지 등록 ─────────────────────────────────── */
  App.registerPage({
    id: 'hot',
    label: '핫 종목',
    order: 40,
    html: `
      <div class="panel h-full">
        <div class="panel-hd"><h2>핫 종목</h2><span class="note" id="hot-stamp">—</span></div>
        <div class="controls">
          <button class="ctl mkt active" data-mkt="america">🇺🇸 미국</button>
          <button class="ctl mkt" data-mkt="korea">🇰🇷 한국</button>
          <span class="ctl-sep"></span>
          <button class="ctl scr active" data-scr="top_gainers">📈 급등주</button>
          <button class="ctl scr" data-scr="top_losers">📉 급락주</button>
          <button class="ctl scr" data-scr="volume_leaders">🔥 거래량 상위</button>
          <button class="ctl scr" data-scr="most_capitalized">🏦 시가총액 상위</button>
          <span class="ctl-sep"></span>
          <button class="ctl" id="hot-refresh">⟳ 새로고침</button>
        </div>
        <div class="panel-bd" id="hot-table" style="overflow-y:auto"></div>
      </div>`,
    init() {
      render();
      document.querySelectorAll('#page-hot .ctl.mkt').forEach(b => b.onclick = () => {
        document.querySelectorAll('#page-hot .ctl.mkt').forEach(x => x.classList.remove('active'));
        b.classList.add('active'); mkt = b.dataset.mkt; render();
      });
      document.querySelectorAll('#page-hot .ctl.scr').forEach(b => b.onclick = () => {
        document.querySelectorAll('#page-hot .ctl.scr').forEach(x => x.classList.remove('active'));
        b.classList.add('active'); scr = b.dataset.scr; render();
      });
      document.getElementById('hot-refresh').onclick = render;
    },
  });
})();
