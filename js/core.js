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

  /* ── 기술적 분석 게이지 (자체 렌더) ─────────────────
     TradingView technical-analysis 위젯 대체 (2026-10-08): 위젯은 판정을 '셀/바이/뉴트럴'로
     음역해 보여주고, 관심목록 카드마다 iframe이 하나씩 붙어 무거웠다.
     스캐너의 Recommend.* 컬럼(-1~+1)이 위젯과 같은 평가값이며, 한 번의 요청으로 전 주기를 받는다.
     주기 접미사: 일봉은 없음, 나머지는 '|60' '|1W' 식 */
  const TA_SUFFIX = {
    '1m': '|1', '5m': '|5', '15m': '|15', '30m': '|30', '1h': '|60', '2h': '|120',
    '4h': '|240', '1D': '', '1W': '|1W', '1M': '|1M',
  };
  /* TradingView 기준 구간: ≥0.5 적극매수 · ≥0.1 매수 · (-0.1,0.1) 중립 · ≤-0.1 매도 · ≤-0.5 적극매도 */
  function taLevel(v) {
    if (v == null) return { label: '—', cls: 'na' };
    if (v >= 0.5) return { label: '적극 매수', cls: 'sbuy' };
    if (v >= 0.1) return { label: '매수', cls: 'buy' };
    if (v > -0.1) return { label: '중립', cls: 'neu' };
    if (v > -0.5) return { label: '매도', cls: 'sell' };
    return { label: '적극 매도', cls: 'ssell' };
  }

  const taCache = new Map();   // sym → {at, val} · 60초
  async function fetchTA(sym) {
    const hit = taCache.get(sym);
    if (hit && Date.now() - hit.at < 60000) return hit.val;
    const ivs = Object.keys(TA_SUFFIX);
    const columns = ['description'];
    ivs.forEach(iv => {
      const s = TA_SUFFIX[iv];
      columns.push('Recommend.All' + s, 'Recommend.MA' + s, 'Recommend.Other' + s);
    });
    /* ⚠ content-type 헤더 금지 — 단순 요청이어야 preflight 없이 통과 */
    const r = await fetch(`https://scanner.tradingview.com/${scanRegion(sym)}/scan`, {
      method: 'POST',
      body: JSON.stringify({ options: { lang: 'ko' }, symbols: { tickers: [sym] }, columns }),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = (await r.json()).data;
    if (!d || !d.length) throw new Error('평가 정보 없음');
    const row = d[0].d;
    const val = { desc: row[0], iv: {} };
    ivs.forEach((iv, i) => {
      val.iv[iv] = { all: row[1 + i * 3], ma: row[2 + i * 3], osc: row[3 + i * 3] };
    });
    taCache.set(sym, { at: Date.now(), val });
    return val;
  }

  /* 반원 게이지 SVG: 왼쪽 끝 -1(적극매도) ~ 오른쪽 끝 +1(적극매수) */
  function gaugeSvg(v) {
    const cx = 100, cy = 96, r = 78;
    const pt = (val, rad) => {
      const a = Math.PI * (1 - (val + 1) / 2);
      return [cx + rad * Math.cos(a), cy - rad * Math.sin(a)];
    };
    const seg = (a, b, cls) => {
      const [x1, y1] = pt(a, r), [x2, y2] = pt(b, r);
      return `<path class="tg-${cls}" d="M${x1.toFixed(1)} ${y1.toFixed(1)} A${r} ${r} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}"/>`;
    };
    const gap = 0.025;   // 구간 사이 틈
    const arcs = [[-1, -0.5, 'ssell'], [-0.5, -0.1, 'sell'], [-0.1, 0.1, 'neu'], [0.1, 0.5, 'buy'], [0.5, 1, 'sbuy']]
      .map(([a, b, c]) => seg(a + gap, b - gap, c)).join('');
    const nv = Math.max(-1, Math.min(1, v ?? 0));
    const [nx, ny] = pt(nv, r - 16);
    return `<svg class="ta-gauge" viewBox="0 0 200 104" aria-hidden="true">${arcs}` +
      (v == null ? '' : `<line class="tg-needle" x1="${cx}" y1="${cy}" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}"/>`) +
      `<circle class="tg-hub" cx="${cx}" cy="${cy}" r="5"/></svg>`;
  }

  const TA_SHORT = { '1m': '1분', '5m': '5분', '15m': '15분', '30m': '30분', '1h': '1시간',
                     '2h': '2시간', '4h': '4시간', '1D': '일', '1W': '주', '1M': '월' };

  /* elId에 게이지를 그리고 {desc, iv} 를 돌려준다 (실패 시 null).
     같은 칸에 연달아 호출되면 마지막 호출 결과만 반영 */
  async function taWidget(elId, sym, interval) {
    const host = document.getElementById(elId);
    if (!host) return null;
    interval = interval || '1D';
    const token = String(Math.random());
    host.dataset.taReq = token;
    if (!host.querySelector('.ta')) host.innerHTML = '<div class="qb-empty">기술적 평가 불러오는 중…</div>';
    let t;
    try { t = await fetchTA(sym); }
    catch (e) {
      if (host.dataset.taReq === token) {
        host.innerHTML = `<div class="qb-empty">기술적 평가를 불러오지 못했습니다 (${esc(e.message)})</div>`;
      }
      return null;
    }
    if (host.dataset.taReq !== token) return t;
    const cur = t.iv[interval] || {};
    const L = taLevel(cur.all), Lo = taLevel(cur.osc), Lm = taLevel(cur.ma);
    const sgn = v => v == null ? '' : (v > 0 ? '+' : '') + v.toFixed(2);
    const mtf = Object.keys(TA_SUFFIX).map(iv => {
      const lv = taLevel(t.iv[iv].all);
      return `<span class="ta-pill ${lv.cls}${iv === interval ? ' cur' : ''}" title="${TA_SHORT[iv]} · ${lv.label} ${sgn(t.iv[iv].all)}">` +
        `<i>${TA_SHORT[iv]}</i><b>${lv.label}</b></span>`;
    }).join('');
    host.innerHTML = `
      <div class="ta">
        <div class="ta-main">
          ${gaugeSvg(cur.all)}
          <div class="ta-verdict ${L.cls}">${L.label}<small>${sgn(cur.all)}</small></div>
        </div>
        <div class="ta-sub">
          <span>오실레이터 <b class="${Lo.cls}">${Lo.label}</b></span>
          <span>이동평균 <b class="${Lm.cls}">${Lm.label}</b></span>
        </div>
        <div class="ta-mtf">${mtf}</div>
      </div>`;
    return t;
  }

  /* ── 국내 차트 (네이버 금융 차트 이미지) ──────────────
     TradingView 무료 위젯은 KRX 심볼을 "TradingView에서만 제공되는 심볼"로 막는다
     (2026-10-08 확인 — advanced-chart · single-quote · ticker-tape 모두).
     브라우저에서 직접 부를 수 있는 국내 일봉 API도 없어서(야후·네이버 API 모두 CORS 헤더 없음)
     <img>로 받는 네이버 모바일 차트 이미지로 대체. 이미지는 CORS 대상이 아니다.
     URL: ssl.pstatic.net/imgfinance/chart/mobile/<기간>/<코드>_end.png (종목·지수 공통 658×408) */
  const NAVER_INDEX = { KOSPI: 'KOSPI', KOSDAQ: 'KOSDAQ', KOSPI200: 'KPI200' };
  const KRX_PERIODS = [['day', '당일'], ['candle/day', '일봉'], ['candle/week', '주봉'], ['candle/month', '월봉']];
  function naverCode(sym) {
    const t = sym.replace(/^KRX:/, '');
    if (NAVER_INDEX[t]) return { code: NAVER_INDEX[t], index: true };
    if (/^[0-9A-Z]{6}$/.test(t)) return { code: t, index: false };
    return null;
  }
  function krxChart(elId, sym, period) {
    const host = document.getElementById(elId);
    if (!host) return;
    const nc = naverCode(sym);
    if (!nc) {
      host.innerHTML = `<div class="qb-empty">${esc(sym)} — 이 국내 심볼은 차트를 지원하지 않습니다</div>`;
      return;
    }
    period = period || 'candle/day';
    const page = `https://m.stock.naver.com/domestic/${nc.index ? 'index' : 'stock'}/${nc.code}/total`;
    const stamp = Math.floor(Date.now() / 60000);   // 1분 단위 캐시 무효화
    host.innerHTML = `
      <div class="kc">
        <div class="kc-bar">
          ${KRX_PERIODS.map(([p, l]) => `<button class="kc-p${p === period ? ' active' : ''}" data-p="${p}">${l}</button>`).join('')}
          <a class="kc-src" href="${page}" target="_blank" rel="noopener">차트: 네이버 금융 ↗</a>
        </div>
        <div class="kc-img">
          <img src="https://ssl.pstatic.net/imgfinance/chart/mobile/${period}/${nc.code}_end.png?t=${stamp}" alt="${esc(sym)} 차트">
        </div>
      </div>`;
    host.querySelectorAll('.kc-p').forEach(b => { b.onclick = () => krxChart(elId, sym, b.dataset.p); });
    host.querySelector('img').onerror = () => {
      host.querySelector('.kc-img').innerHTML = '<div class="qb-empty">차트 이미지를 불러오지 못했습니다</div>';
    };
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
    /* 국내 종목은 위젯이 차트를 막으므로 네이버 이미지 차트 (krxChart 주석 참조) */
    if (sym.startsWith('KRX:')) krxChart('sm-chart', sym);
    else tv('sm-chart', 'advanced-chart', {
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
           renderQuoteBox, intervalSelect, taWidget, krxChart };
})();
