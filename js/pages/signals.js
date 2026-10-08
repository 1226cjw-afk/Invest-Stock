/* 07 매매 시그널 — TradingView 기술적 분석 게이지 + 관심목록 보드
   - 주기 선택은 위젯 내장 탭 대신 자체 셀렉트(App.intervalSelect) 사용
     (내장 탭의 한국어 오역 '1날' 문제 + 표기 통일, 2026-07-11)
   - 종목 검색: 티커·코드 외에 한글 종목명도 지원 (스캐너 description match) */
(function () {
  const C = window.AppConfig;

  const getWatch = () => App.store.get(C.STORAGE.watchlist, C.DEFAULT_WATCHLIST.slice());
  const setWatch = w => App.store.set(C.STORAGE.watchlist, w);

  let curSym = C.DEFAULT_SIGNAL_SYMBOL;
  let curIv = '1D';
  const watchIv = {};   // 관심목록 카드별 주기 (세션 한정)

  function renderSelected(sym) {
    curSym = sym;
    document.getElementById('sig-title').textContent = sym + ' — 종합 시그널';
    App.renderQuoteBox('w-syminfo', sym, sym).then(q => {
      if (q && q.desc && curSym === sym) {
        document.getElementById('sig-title').textContent = `${q.desc} (${sym}) — 종합 시그널`;
      }
    });
    App.taWidget('w-ta-main', sym, curIv);
  }

  function renderWatch() {
    const grid = document.getElementById('watch-grid');
    grid.innerHTML = '';
    getWatch().forEach(sym => {
      const cell = document.createElement('div');
      cell.className = 'watch-cell panel';
      const x = document.createElement('button');
      x.className = 'watch-x'; x.textContent = '✕'; x.title = sym + ' 제거';
      x.onclick = () => { setWatch(getWatch().filter(s => s !== sym)); renderWatch(); };
      const hd = document.createElement('div');
      hd.className = 'panel-hd'; hd.innerHTML = `<h2>${App.esc(sym)}</h2>`;
      const bd = document.createElement('div');
      bd.className = 'panel-bd';
      bd.id = 'ta-' + sym.replace(/[^A-Za-z0-9]/g, '_');
      /* 평가를 받아오면 제목을 "종목명 + 심볼"로 (코드만으론 국내 종목을 알아보기 어렵다) */
      const named = t => {
        if (t && t.desc) hd.querySelector('h2').innerHTML = `${App.esc(t.desc)} <small class="wc-sym">${App.esc(sym)}</small>`;
      };
      const sel = App.intervalSelect(watchIv[sym] || '1D', v => {
        watchIv[sym] = v;
        App.taWidget(bd.id, sym, v);
      });
      sel.style.cssText = 'margin-left:auto;margin-right:26px';   // ✕ 버튼 자리 확보
      hd.appendChild(sel);
      cell.append(x, hd, bd);
      grid.appendChild(cell);
      App.taWidget(bd.id, sym, watchIv[sym] || '1D').then(named);
    });
  }

  /* ── 종목 검색 ─────────────────────────────────────
     1) 6자리 숫자 → KRX 코드  2) 거래소:티커 → 그대로
     3) 영문 → NASDAQ 티커로 간주  4) 그 외(한글 등) → 이름 검색 */
  function parseDirect(v) {
    v = v.trim();
    if (!v) return null;
    if (/^\d{6}$/.test(v)) return 'KRX:' + v;
    if (v.includes(':')) return v.toUpperCase();
    if (/^[A-Za-z.\-]+$/.test(v)) return 'NASDAQ:' + v.toUpperCase();
    return null;
  }

  async function searchByName(text) {
    /* ⚠ content-type 헤더 금지 (CORS preflight — sectors.js 참조) */
    const r = await fetch('https://scanner.tradingview.com/korea/scan', {
      method: 'POST',
      body: JSON.stringify({
        options: { lang: 'ko' },
        filter: [
          { left: 'type', operation: 'equal', right: 'stock' },
          { left: 'description', operation: 'match', right: text },
        ],
        columns: ['name', 'description', 'close', 'change'],
        sort: { sortBy: 'market_cap_basic', sortOrder: 'desc' },
        range: [0, 8],
      }),
    });
    if (!r.ok) throw new Error('스캐너 응답 오류 HTTP ' + r.status);
    return (await r.json()).data || [];
  }

  function hideSugg() {
    const box = document.getElementById('sig-sugg');
    box.style.display = 'none';
    box.innerHTML = '';
  }

  function showSuggestions(rows) {
    const box = document.getElementById('sig-sugg');
    box.innerHTML = '';
    if (!rows.length) {
      box.innerHTML = '<span class="hint" style="margin:0">검색 결과가 없습니다 — 이름 검색은 국내 종목만 지원합니다</span>';
    }
    rows.forEach(row => {
      const [, desc, , change] = row.d;
      const up = (change || 0) >= 0;
      const b = document.createElement('button');
      b.className = 'chip';
      b.innerHTML = `${App.esc(desc)} <small>${App.esc(row.s)}</small>` +
        `<b class="${up ? 'up' : 'dn'}">${up ? '+' : ''}${(change ?? 0).toFixed(1)}%</b>`;
      b.onclick = () => {
        document.getElementById('sig-input').value = row.s;
        hideSugg();
        renderSelected(row.s);
      };
      box.appendChild(b);
    });
    box.style.display = 'flex';
  }

  /* 입력값 → 심볼 확정. 이름 검색 결과가 여럿이면 후보를 띄우고 null 반환 */
  async function resolveInput() {
    const raw = document.getElementById('sig-input').value;
    const direct = parseDirect(raw);
    if (direct) { hideSugg(); return direct; }
    if (!raw.trim()) return null;
    try {
      const rows = await searchByName(raw.trim());
      if (rows.length === 1) {
        document.getElementById('sig-input').value = rows[0].s;
        hideSugg();
        return rows[0].s;
      }
      showSuggestions(rows);
    } catch (e) {
      showSuggestions([]);
    }
    return null;
  }

  App.registerPage({
    id: 'sig',
    label: '매매 시그널',
    order: 70,
    html: `
      <div class="panel">
        <div class="panel-hd">
          <h2>기술적 분석 매수/매도 시그널</h2>
          <span class="note">오실레이터 + 이동평균 종합 · 주기는 각 패널의 셀렉트로 전환 (1분~1달)</span>
        </div>
        <div class="sig-form">
          <input type="text" id="sig-input" placeholder="이름·코드·티커 (예: 삼성전자, 005930, NVDA)">
          <button class="btn-sm" id="sig-go">조회</button>
          <button class="btn-sm btn-ghost" id="sig-add">+ 관심목록에 추가</button>
          <span class="hint" style="margin:0">한국 종목은 이름·코드로 검색 (삼성전자 / 005930) · 미국은 티커 (NVDA) 또는 거래소:티커 (NYSE:KO)</span>
        </div>
        <div class="chips" id="sig-sugg" style="display:none;padding:0 14px 12px"></div>
      </div>

      <div id="sig-selected">
        <div class="panel h-info"><div class="panel-bd" id="w-syminfo"></div></div>
        <div class="panel h-ta">
          <div class="panel-hd"><h2 id="sig-title">—</h2><span class="note" id="sig-iv"></span></div>
          <div class="panel-bd" id="w-ta-main"></div>
        </div>
      </div>

      <div class="panel mt">
        <div class="panel-hd"><h2>관심목록 시그널 보드</h2><span class="note">종합 판단: 적극매수/매수/중립/매도/적극매도</span></div>
      </div>
      <div class="watch-grid" id="watch-grid"></div>`,
    init() {
      document.getElementById('sig-iv').appendChild(
        App.intervalSelect(curIv, v => { curIv = v; App.taWidget('w-ta-main', curSym, v); }));
      renderSelected(C.DEFAULT_SIGNAL_SYMBOL);
      renderWatch();
      const go = async () => {
        const s = await resolveInput();
        if (s) renderSelected(s);
      };
      document.getElementById('sig-go').onclick = go;
      document.getElementById('sig-input').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
      document.getElementById('sig-add').onclick = async () => {
        const s = await resolveInput();
        if (!s) return;
        const w = getWatch();
        if (!w.includes(s)) { w.push(s); setWatch(w); renderWatch(); }
      };
    },
  });
})();
