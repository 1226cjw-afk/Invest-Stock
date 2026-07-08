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
            <div class="panel" style="height:170px"><div class="panel-bd" id="sm-info"></div></div>
            <div class="panel" style="flex:1;min-height:0"><div class="panel-bd" id="sm-ta"></div></div>
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

    tv('sm-info', 'symbol-info', { ...DARK, symbol: sym, width: '100%' });
    tv('sm-chart', 'advanced-chart', {
      autosize: true, symbol: sym, interval: 'D', timezone: 'Asia/Seoul',
      theme: 'dark', style: '1', locale: 'kr', backgroundColor: '#0d1117',
      gridColor: 'rgba(42,52,65,0.5)', withdateranges: true,
      hide_side_toolbar: true, allow_symbol_change: false, calendar: false,
      support_host: 'https://www.tradingview.com',
    });
    tv('sm-ta', 'technical-analysis', {
      colorTheme: 'dark', locale: 'kr', isTransparent: true,
      interval: '1D', width: '100%', height: '100%', symbol: sym,
      showIntervalTabs: true, displayMode: 'single',
    });
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

    tv('tape', 'ticker-tape', {
      ...DARK, displayMode: 'adaptive', showSymbolLogo: true,
      symbols: C.TAPE_SYMBOLS,
    });

    /* URL 해시로 시작 탭 지정 가능 (예: index.html#kr) */
    const initial = location.hash.slice(1);
    if (pages.length) show(pages.some(p => p.id === initial) ? initial : pages[0].id);
  }

  return { registerPage, show, boot, tv, DARK, esc, mdLite, store, openSymbolModal };
})();
