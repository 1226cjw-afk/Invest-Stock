/* 04 핫 종목 — TradingView 스캐너 API로 자체 테이블 렌더링
   (종목 클릭 시 외부 링크 대신 페이지 내 상세 팝업: 차트 + 종목정보 + 매매시그널)
   API 검증: scanner.tradingview.com 은 CORS 전면 허용이라 file:// 에서도 동작

   컨트롤(시장 · 지수 · 정렬 기준)은 config.js의 SCANNER에서 통째로 생성한다.
   → 종목군을 늘리려면 이 파일이 아니라 config.js만 고치면 됨 */
(function () {
  const C = window.AppConfig;
  let mkt = 'america';
  let scr = 'top_gainers';
  let uni = 'all';          // 지수 구성종목 필터 (config의 universes 키)
  let krwView = false;      // 서학개미 원화 병기 (미국 시장에서만)
  let fx = null;            // {rate, change} — 원화 뷰가 켜졌을 때만 채움
  let ready = false;

  /* ── 스캐너 호출 (포맷터는 App.fmt 공용 사용) ────── */
  async function scan() {
    const m = C.SCANNER.markets[mkt];
    const s = C.SCANNER.screens[scr];
    const u = (m.universes || []).find(x => x[0] === uni);
    const body = {
      options: { lang: 'ko' },
      filter: m.filter,
      columns: ['name', 'description', 'close', 'change', 'volume',
                'Value.Traded', 'market_cap_basic', 'logoid'],
      sort: { sortBy: s.sortBy, sortOrder: s.order },
      range: [0, C.SCANNER.rows],
    };
    /* 지수 한정은 symbols.groups로만 동작 — filter에 left:'index'를 넣으면 항상 0건이 온다
       (2026-08-03 실측). filter와 함께 보내는 것은 정상 동작. */
    if (u && u[2]) body.symbols = { groups: [{ type: 'index', values: [u[2]] }] };

    /* ⚠ content-type 헤더 금지 — 스캐너 CORS가 이 헤더를 허용하지 않아
       preflight에서 실패함. 헤더 없이 = 단순 요청 = preflight 없음 (sectors.js 참조) */
    const r = await fetch(`https://scanner.tradingview.com/${m.scan}/scan`, {
      method: 'POST',
      body: JSON.stringify(body),
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
      const won = krwView && cur === 'USD' && fx;   // 원화 병기 여부

      let html = `<table class="hot-table"><thead><tr>
        <th>#</th><th style="text-align:left">종목</th><th>현재가</th><th>등락률</th>
        <th>거래대금</th><th>거래량</th><th>시가총액</th>
      </tr></thead><tbody>`;

      rows.forEach((row, i) => {
        const [name, desc, close, change, volume, value, cap, logoid] = row.d;
        const sym = row.s;                       // 예: "KRX:005930"
        const chg = change ?? 0;
        const up = chg >= 0;
        const logo = logoid
          ? `<img class="stock-logo" src="https://s3-symbol-logo.tradingview.com/${logoid}.svg" onerror="this.remove()" alt="">`
          : `<span class="stock-logo lg-txt">${App.esc((name || '?')[0])}</span>`;

        /* 환율까지 반영한 원화 수익률 = (1+주가수익률)×(1+환율변동) − 1 */
        const chgWon = won ? ((1 + chg / 100) * (1 + fx.change / 100) - 1) * 100 : null;
        const upWon = (chgWon ?? 0) >= 0;

        html += `<tr class="hot-row" data-sym="${App.esc(sym)}" data-name="${App.esc(desc || name)}">
          <td class="dim">${i + 1}</td>
          <td class="nm">${logo}<span><b>${App.esc(desc || name)}</b><small>${App.esc(sym)}</small></span></td>
          <td class="num">${App.fmt.price(close, cur)}${
            won && close != null ? `<small>${App.fmt.krw(close * fx.rate)}</small>` : ''}</td>
          <td class="num ${up ? 'up' : 'dn'}">${up ? '▲' : '▼'} ${Math.abs(chg).toFixed(2)}%${
            won ? `<small class="${upWon ? 'up' : 'dn'}">₩ ${upWon ? '+' : '−'}${Math.abs(chgWon).toFixed(2)}%</small>` : ''}</td>
          <td class="num dim">${App.fmt.cap(value, cur)}</td>
          <td class="num dim">${App.fmt.vol(volume)}</td>
          <td class="num dim">${App.fmt.cap(cap, cur)}${
            won && cap ? `<small>${App.fmt.krwShort(cap * fx.rate)}</small>` : ''}</td>
        </tr>`;
      });
      html += '</tbody></table>';
      box.innerHTML = html;

      const bits = ['갱신 ' + new Date().toLocaleTimeString('ko-KR')];
      if (won) {
        const s = fx.change >= 0 ? '▲' : '▼';
        bits.push(`환율 ${App.fmt.idx(fx.rate)} ${s}${Math.abs(fx.change).toFixed(2)}%`);
      }
      bits.push('종목 클릭 = 상세 보기');
      stamp.textContent = bits.join(' · ');

      box.querySelectorAll('.hot-row').forEach(tr =>
        tr.onclick = () => App.openSymbolModal(tr.dataset.sym, tr.dataset.name));
    } catch (e) {
      box.innerHTML = `<div class="err"><b>목록을 불러오지 못했습니다:</b> ${App.esc(e.message)}<br>
        네트워크 문제일 수 있습니다. 잠시 후 <b>새로고침</b>을 눌러 다시 시도하세요.</div>`;
      stamp.textContent = '오류';
    }
  }

  /* ── 컨트롤 (config에서 생성 — 시장에 따라 지수 목록이 바뀌므로 매번 다시 그림) ── */
  function buildControls() {
    const box = document.getElementById('hot-ctl');
    const m = C.SCANNER.markets[mkt];
    const btn = (cls, key, label, on) =>
      `<button class="ctl ${cls}${on ? ' active' : ''}" data-k="${App.esc(key)}">${label}</button>`;

    let h = Object.entries(C.SCANNER.markets)
      .map(([k, v]) => btn('mkt', k, v.label, k === mkt)).join('');
    if (m.universes) {
      h += '<span class="ctl-sep"></span>';
      h += m.universes.map(u => btn('uni', u[0], u[1], u[0] === uni)).join('');
    }
    h += '<span class="ctl-sep"></span>';
    h += Object.entries(C.SCANNER.screens)
      .map(([k, v]) => btn('scr', k, v.label, k === scr)).join('');
    h += '<span class="ctl-sep"></span>';
    /* 원화 병기는 달러 시장에서만 의미가 있음 */
    if (m.currency === 'USD') {
      h += `<button class="ctl krw${krwView ? ' active' : ''}" id="hot-krw"
              title="달러 가격에 원화 환산과 환율 반영 수익률을 함께 표시">₩ 원화 병기</button>`;
    }
    h += '<button class="ctl" id="hot-refresh">⟳ 새로고침</button>';
    box.innerHTML = h;

    box.querySelectorAll('.ctl.mkt').forEach(b => b.onclick = () => {
      mkt = b.dataset.k;
      uni = 'all';           // 지수 키가 시장마다 다르므로 초기화
      buildControls(); render();
    });
    box.querySelectorAll('.ctl.uni').forEach(b => b.onclick = () => {
      uni = b.dataset.k; buildControls(); render();
    });
    box.querySelectorAll('.ctl.scr').forEach(b => b.onclick = () => {
      scr = b.dataset.k; buildControls(); render();
    });
    const krwBtn = document.getElementById('hot-krw');
    if (krwBtn) krwBtn.onclick = async () => {
      krwView = !krwView;
      if (krwView && !fx) {
        krwBtn.textContent = '환율 조회 중…';
        try { fx = await App.fxUsdKrw(); }
        catch (e) { krwView = false; alert('환율을 불러오지 못했습니다: ' + e.message); }
      }
      buildControls(); render();
    };
    document.getElementById('hot-refresh').onclick = render;
  }

  /* 다른 화면(시장 폭 스트립)에서 특정 시장·지수로 바로 열기 */
  window.AppHot = {
    goto(mktKey, uniKey) {
      if (C.SCANNER.markets[mktKey]) mkt = mktKey;
      uni = uniKey || 'all';
      const was = ready;            // 최초 진입이면 show()가 init()을 부르며 현재 상태로 그림
      App.show('hot');
      if (was) { buildControls(); render(); }
    },
  };

  /* ── 페이지 등록 ─────────────────────────────────── */
  App.registerPage({
    id: 'hot',
    label: '핫 종목',
    order: 40,
    html: `
      <div class="panel h-full">
        <div class="panel-hd"><h2>핫 종목</h2><span class="note" id="hot-stamp">—</span></div>
        <div class="controls" id="hot-ctl"></div>
        <div class="panel-bd" id="hot-table"></div>
      </div>`,
    init() {
      buildControls();
      render();
      ready = true;
    },
  });
})();
