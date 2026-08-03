/* ═══════════════════════════════════════════════════════════
   INVST://STOCK — 코어
   페이지 레지스트리 · TradingView 위젯 팩토리 · 시계/장세션 · 유틸
   새 화면 추가 = js/pages/에 파일 하나 만들고 App.registerPage() 호출
═══════════════════════════════════════════════════════════ */
window.App = (function () {
  const C = window.AppConfig;
  const pages = [];          // {id, label, order, html, init}
  const loaded = {};

  /* ── TradingView 위젯 팩토리 ─────────────────────── */
  const DARK = { colorTheme: 'dark', locale: 'kr', isTransparent: true };

  function tv(elId, name, config) {
    const host = document.getElementById(elId);
    if (!host) return;
    host.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'tradingview-widget-container';
    wrap.style.cssText = 'height:100%;width:100%';
    const inner = document.createElement('div');
    inner.className = 'tradingview-widget-container__widget';
    inner.style.cssText = 'height:100%;width:100%';
    wrap.appendChild(inner);
    const s = document.createElement('script');
    s.type = 'text/javascript';
    s.async = true;
    s.src = 'https://s3.tradingview.com/external-embedding/embed-widget-' + name + '.js';
    s.text = JSON.stringify(config);
    wrap.appendChild(s);
    host.appendChild(wrap);
  }

  /* ── 유틸 ────────────────────────────────────────── */
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  /* 가격·시총·거래량 포맷터 (핫 종목 테이블·시세 박스 공용) */
  const fmt = {
    price(v, cur) {
      if (v == null) return '—';
      return cur === 'KRW'
        ? Math.round(v).toLocaleString('ko-KR') + '원'
        : '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },
    cap(v, cur) {
      if (!v) return '—';
      if (cur === 'KRW') {
        if (v >= 1e12) return (v / 1e12).toFixed(1) + '조';
        return Math.round(v / 1e8).toLocaleString('ko-KR') + '억';
      }
      if (v >= 1e12) return '$' + (v / 1e12).toFixed(2) + 'T';
      if (v >= 1e9) return '$' + (v / 1e9).toFixed(1) + 'B';
      return '$' + Math.round(v / 1e6).toLocaleString() + 'M';
    },
    vol(v) {
      if (!v) return '—';
      if (v >= 1e8) return (v / 1e8).toFixed(1) + '억';
      if (v >= 1e4) return Math.round(v / 1e4).toLocaleString() + '만';
      return v.toLocaleString();
    },
    /* 지수·환율처럼 통화 단위가 없는 값 (소수 2자리 고정) */
    idx(v) {
      if (v == null) return '—';
      return v.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },
    /* 원화 환산 표시 (서학개미 뷰) — 가격은 원 단위까지, 시총·대금은 조/억으로 줄임 */
    krw(v) {
      if (v == null) return '—';
      return '₩' + Math.round(v).toLocaleString('ko-KR');
    },
    krwShort(v) {
      if (!v) return '—';
      if (v >= 1e12) return '₩' + (v / 1e12).toFixed(1) + '조';
      if (v >= 1e8) return '₩' + Math.round(v / 1e8).toLocaleString('ko-KR') + '억';
      return '₩' + Math.round(v).toLocaleString('ko-KR');
    },
  };
  /* 초경량 마크다운 렌더러 (##, **, - 리스트) */
  function mdLite(s) {
    return esc(s)
      .replace(/^#{1,4}\s*(.+)$/gm, '<h3>$1</h3>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/^[-•]\s+(.+)$/gm, '<li>$1</li>')
      .replace(/(<li>[\s\S]+?<\/li>)(?!\s*<li>)/g, '<ul>$1</ul>')
      .replace(/\n{2,}/g, '<br>')
      .replace(/\n/g, ' ');
  }
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); }
      catch (e) { return fallback; }
    },
    set(key, val) { localStorage.setItem(key, JSON.stringify(val)); },
    getRaw(key) { return localStorage.getItem(key) || ''; },
    setRaw(key, val) { localStorage.setItem(key, val); },
  };

  /* ── 페이지 레지스트리 ───────────────────────────── */
  function registerPage(page) { pages.push(page); }

  /* ── 심볼 → 스캐너 시장 구분 ──────────────────────
     scanner.tradingview.com/<scan>/scan 의 <scan>. 잘못 고르면 빈 배열이 옴 */
  function scanRegion(sym) {
    if (sym.startsWith('KRX:')) return 'korea';
    if (/^(FX_IDC|FX|OANDA|FOREXCOM):/.test(sym)) return 'forex';
    if (/^(BINANCE|COINBASE|BITSTAMP):/.test(sym)) return 'crypto';
    return 'america';
  }

  /* ── 여러 종목 일괄 시세 (시장별로 나눠 병렬 호출) ──
     한 시장이 실패해도 나머지는 표시되도록 개별 try/catch */
  async function fetchQuotes(items) {
    const byScan = new Map();
    items.forEach(it => {
      const scan = it.scan || scanRegion(it.sym);
      if (!byScan.has(scan)) byScan.set(scan, []);
      byScan.get(scan).push(it.sym);
    });
    const out = new Map();
    await Promise.all([...byScan].map(async ([scan, tickers]) => {
      try {
        /* ⚠ content-type 헤더 금지 — 단순 요청이어야 preflight 없이 통과 */
        const r = await fetch(`https://scanner.tradingview.com/${scan}/scan`, {
          method: 'POST',
          body: JSON.stringify({
            options: { lang: 'ko' },
            symbols: { tickers },
            columns: ['description', 'close', 'change'],
          }),
        });
        if (!r.ok) return;
        ((await r.json()).data || []).forEach(row => {
          out.set(row.s, { desc: row.d[0], close: row.d[1], change: row.d[2] });
        });
      } catch (e) { /* 해당 시장만 누락 */ }
    }));
    return out;
  }

  /* ── 달러/원 환율 (서학개미 원화 뷰 공용) ──────────
     60초 캐시. 실패 시 예외를 던지므로 호출부에서 원화 표시를 생략할 것 */
  let fxCache = { at: 0, val: null };
  async function fxUsdKrw() {
    if (fxCache.val && Date.now() - fxCache.at < 60000) return fxCache.val;
    /* ⚠ content-type 헤더 금지 — 단순 요청이어야 preflight 없이 통과 */
    const r = await fetch('https://scanner.tradingview.com/forex/scan', {
      method: 'POST',
      body: JSON.stringify({ symbols: { tickers: ['FX_IDC:USDKRW'] }, columns: ['close', 'change'] }),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = (await r.json()).data;
    if (!d || !d.length) throw new Error('환율 정보 없음');
    fxCache = { at: Date.now(), val: { rate: d[0].d[0], change: d[0].d[1] || 0 } };
    return fxCache.val;
  }

  /* ── 단일 종목 시세 (스캐너 API) ──────────────────
     TradingView symbol-info 위젯 대체: 위젯은 좁은 박스에서 글자가 겹치고
     "트레이딩뷰에서만" 안내 문구가 떠서 자체 렌더링으로 교체 (2026-07-11) */
  async function fetchQuote(sym) {
    const scan = scanRegion(sym);
    /* ⚠ content-type 헤더 금지 — 단순 요청이어야 preflight 없이 통과 */
    const r = await fetch(`https://scanner.tradingview.com/${scan}/scan`, {
      method: 'POST',
      body: JSON.stringify({
        options: { lang: 'ko' },
        symbols: { tickers: [sym] },
        columns: ['name', 'description', 'close', 'change', 'open', 'high', 'low',
                  'volume', 'market_cap_basic', 'currency', 'logoid'],
      }),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = (await r.json()).data;
    if (!d || !d.length) throw new Error('심볼 정보 없음');
    const [name, desc, close, change, open, high, low, volume, cap, currency, logoid] = d[0].d;
    return { sym: d[0].s, name, desc, close, change, open, high, low, volume, cap, currency, logoid };
  }

  async function renderQuoteBox(elId, sym, fallbackName) {
    const host = document.getElementById(elId);
    if (!host) return null;
    host.innerHTML = '<div class="qb-empty">시세 불러오는 중…</div>';
    try {
      const q = await fetchQuote(sym);
      const up = (q.change || 0) >= 0;
      const cur = q.currency || (sym.startsWith('KRX:') ? 'KRW' : 'USD');
      const nm = q.desc || fallbackName || q.name;
      const logo = q.logoid
        ? `<img class="stock-logo" src="https://s3-symbol-logo.tradingview.com/${q.logoid}.svg" onerror="this.remove()" alt="">`
        : '';
      host.innerHTML = `
        <div class="quote-box">
          <div class="qb-name">${logo}<span><b>${esc(nm)}</b><small>${esc(q.sym)}</small></span></div>
          <div class="qb-price ${up ? 'up' : 'dn'}">${fmt.price(q.close, cur)}
            <small>${up ? '▲' : '▼'} ${Math.abs(q.change ?? 0).toFixed(2)}%</small></div>
          <div class="qb-stats">
            <span>시가 <b>${fmt.price(q.open, cur)}</b></span>
            <span>고가 <b>${fmt.price(q.high, cur)}</b></span>
            <span>저가 <b>${fmt.price(q.low, cur)}</b></span>
            <span>거래량 <b>${fmt.vol(q.volume)}</b></span>
            <span>시총 <b>${fmt.cap(q.cap, cur)}</b></span>
          </div>
        </div>`;
      return q;
    } catch (e) {
      host.innerHTML = `<div class="qb-empty">시세 정보를 불러오지 못했습니다 (${esc(e.message)})</div>`;
      return null;
    }
  }

  /* ── 주기 선택 셀렉트 ──────────────────────────────
     TA 위젯 내장 주기 탭은 한국어 오역('1날')이 있어 끄고 자체 셀렉트 사용 */
  const TA_INTERVALS = [
    ['1m', '1분'], ['5m', '5분'], ['15m', '15분'], ['30m', '30분'],
    ['1h', '1시간'], ['2h', '2시간'], ['4h', '4시간'],
    ['1D', '1일'], ['1W', '1주'], ['1M', '1달'],
  ];
  function intervalSelect(cur, onPick) {
    const sel = document.createElement('select');
    sel.className = 'ivsel';
    sel.title = '주기 선택';
    TA_INTERVALS.forEach(([v, l]) => {
      const o = document.createElement('option');
      o.value = v; o.textContent = l;
      if (v === cur) o.selected = true;
      sel.appendChild(o);
    });
    sel.onchange = () => onPick(sel.value);
    return sel;
  }

  /* 기술적 분석 게이지 (내장 주기 탭 off — 주기는 intervalSelect로 제어) */
  function taWidget(elId, sym, interval) {
    tv(elId, 'technical-analysis', {
      colorTheme: 'dark', locale: 'kr', isTransparent: true,
      interval: interval || '1D', width: '100%', height: '100%', symbol: sym,
      showIntervalTabs: false, displayMode: 'single',
    });
  }

  /* ── 종목 상세 팝업 (공용: 핫 종목·섹터맵 등에서 사용) ── */
  function ensureSymbolModal() {
    if (document.getElementById('sym-modal')) return;
    const m = document.createElement('div');
    m.className = 'modal-overlay';
    m.id = 'sym-modal';
    m.hidden = true;
    m.innerHTML = `
      <div class="modal-panel">
        <div class="modal-hd">
          <b id="sm-title">—</b>
          <button class="btn-sm btn-ghost" id="sm-watch">+ 관심목록</button>
          <button class="btn-sm btn-ghost" id="sm-close">닫기 ESC</button>
        </div>
        <div class="modal-grid">
          <div class="mg-left panel"><div class="panel-bd" id="sm-chart"></div></div>
          <div class="mg-right">
            <div class="panel"><div class="panel-bd" id="sm-info"></div></div>
            <div class="panel" style="flex:1;min-height:0">
              <div class="panel-hd"><h2>기술적 분석</h2><span class="note" id="sm-iv"></span></div>
              <div class="panel-bd" id="sm-ta"></div>
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(m);
    const close = () => { m.hidden = true; };
    document.getElementById('sm-close').onclick = close;
    m.addEventListener('click', e => { if (e.target === m) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  }

  function openSymbolModal(sym, name) {
    ensureSymbolModal();
    const m = document.getElementById('sym-modal');
    m.hidden = false;
    document.getElementById('sm-title').textContent = `${name} · ${sym}`;

    const watchBtn = document.getElementById('sm-watch');
    const key = C.STORAGE.watchlist;
    const inList = () => store.get(key, C.DEFAULT_WATCHLIST.slice()).includes(sym);
    const syncBtn = () => { watchBtn.textContent = inList() ? '✓ 관심목록에 있음' : '+ 관심목록'; };
    syncBtn();
    watchBtn.onclick = () => {
      const w = store.get(key, C.DEFAULT_WATCHLIST.slice());
      if (!w.includes(sym)) { w.push(sym); store.set(key, w); }
      syncBtn();
    };

    /* 시세 박스 — 종목명이 확인되면 팝업 제목도 갱신 */
    renderQuoteBox('sm-info', sym, name).then(q => {
      if (q && q.desc && !m.hidden) {
        document.getElementById('sm-title').textContent = `${q.desc} · ${sym}`;
      }
    });
    tv('sm-chart', 'advanced-chart', {
      autosize: true, symbol: sym, interval: 'D', timezone: 'Asia/Seoul',
      theme: 'dark', style: '1', locale: 'kr', backgroundColor: '#0d1117',
      gridColor: 'rgba(42,52,65,0.5)', withdateranges: true,
      hide_side_toolbar: true, allow_symbol_change: false, calendar: false,
      support_host: 'https://www.tradingview.com',
    });
    const ivHost = document.getElementById('sm-iv');
    ivHost.innerHTML = '';
    ivHost.appendChild(intervalSelect('1D', v => taWidget('sm-ta', sym, v)));
    taWidget('sm-ta', sym, '1D');
  }

  function show(id) {
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + id));
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.page === id));
    if (!loaded[id]) {
      loaded[id] = true;
      const pg = pages.find(p => p.id === id);
      if (pg && pg.init) pg.init();
    }
  }

  /* ── 시계 + 장 운영 상태 (KRX / NYSE) ────────────── */
  function tzNow(tz) {
    const p = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour12: false, weekday: 'short',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date());
    const g = t => p.find(x => x.type === t).value;
    const h = +g('hour') % 24;
    return {
      wd: g('weekday'), mins: h * 60 + +g('minute'),
      str: `${String(h).padStart(2, '0')}:${g('minute')}:${g('second')}`,
    };
  }
  function updateClock() {
    const kr = tzNow('Asia/Seoul'), ny = tzNow('America/New_York');
    document.getElementById('clock').innerHTML =
      `<b>${kr.str}</b> KST &nbsp;·&nbsp; <b>${ny.str}</b> ET`;

    const wk = d => !['Sat', 'Sun'].includes(d);
    // KRX 09:00–15:30 (공휴일 미반영)
    const bK = document.getElementById('badge-krx');
    const krxOpen = wk(kr.wd) && kr.mins >= 540 && kr.mins < 930;
    bK.className = 'badge' + (krxOpen ? ' open' : '');
    bK.innerHTML = `<span class="dot"></span><b>KRX</b> ${krxOpen ? '정규장' : '장마감'}`;
    // NYSE 프리 04:00–09:30 / 정규 09:30–16:00 / 애프터 16:00–20:00
    const bN = document.getElementById('badge-nyse');
    let st = '장마감', cls = '';
    if (wk(ny.wd)) {
      if (ny.mins >= 570 && ny.mins < 960) { st = '정규장'; cls = ' open'; }
      else if (ny.mins >= 240 && ny.mins < 570) { st = '프리장'; cls = ' ext'; }
      else if (ny.mins >= 960 && ny.mins < 1200) { st = '애프터장'; cls = ' ext'; }
    }
    bN.className = 'badge' + cls;
    bN.innerHTML = `<span class="dot"></span><b>NYSE</b> ${st}`;
  }

  /* ── 부팅: nav/섹션 생성 → 시계 → 테이프 → 첫 페이지 ── */
  function boot() {
    pages.sort((a, b) => a.order - b.order);

    const nav = document.getElementById('nav');
    const main = document.getElementById('main');
    pages.forEach((pg, i) => {
      const b = document.createElement('button');
      b.className = 'tab';
      b.dataset.page = pg.id;
      b.innerHTML = `<span class="fk">${String(i + 1).padStart(2, '0')}</span>${pg.label}`;
      b.onclick = () => show(pg.id);
      nav.appendChild(b);

      const sec = document.createElement('section');
      sec.className = 'page';
      sec.id = 'page-' + pg.id;
      sec.innerHTML = pg.html;
      main.appendChild(sec);
    });

    // 숫자키 1~9로 탭 전환
    document.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT') return;
      const idx = +e.key - 1;
      if (idx >= 0 && idx < pages.length) show(pages[idx].id);
    });

    updateClock();
    setInterval(updateClock, 1000);

    /* displayMode는 'regular'(한 줄) 고정 — 'adaptive'는 좁은 화면에서 여러 줄로 쌓여
       46px짜리 #tape 밖으로 삐져나온다 (2026-08-03 390px 실측) */
    tv('tape', 'ticker-tape', {
      ...DARK, displayMode: 'regular', showSymbolLogo: true,
      symbols: C.TAPE_SYMBOLS,
    });

    /* 시장 폭 스트립 — js/breadth.js가 로드됐을 때만 (없으면 조용히 생략) */
    if (window.AppBreadth) window.AppBreadth.init();

    /* URL 해시로 시작 탭 지정 가능 (예: index.html#kr) */
    const initial = location.hash.slice(1);
    if (pages.length) show(pages.some(p => p.id === initial) ? initial : pages[0].id);

    /* ?sym=KRX:005930 → 종목 상세 팝업 바로 열기 (공유·렌더 검증용) */
    const qsym = new URLSearchParams(location.search).get('sym');
    if (qsym) openSymbolModal(qsym.toUpperCase(), qsym.toUpperCase());
  }

  return { registerPage, show, boot, tv, DARK, esc, mdLite, fmt, store,
           openSymbolModal, fetchQuote, fetchQuotes, scanRegion, fxUsdKrw,
           renderQuoteBox, intervalSelect, taWidget };
})();
