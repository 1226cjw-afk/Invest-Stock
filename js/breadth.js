/* ═══════════════════════════════════════════════════════════
   INVST://STOCK — 시장 폭(Market Breadth) 스트립
   헤더 티커 테이프 바로 아래, 모든 탭에서 항상 보이는 전역 요약 줄.

   "지수가 몇 % 빠졌다"만으로는 시장이 고르게 밀렸는지 몇 종목만 무너졌는지 알 수 없다.
   상승/하락 종목 수와 거래대금이 그 차이를 한 줄로 보여준다.

   집계 방식: 지수 구성종목을 통째로 받아(등락률 · 거래대금) 브라우저에서 센다.
   스캐너에 "상승 종목 수" 같은 집계 API가 없고, totalCount로 세면
   시장 4 × 방향 3 = 12회 요청이 필요한데 이 방식은 시장당 1회로 끝난다.
   설정(갱신 주기 · 지수 목록 · 온도 구간)은 전부 config.js의 BREADTH.
═══════════════════════════════════════════════════════════ */
window.AppBreadth = (function () {
  const C = window.AppConfig;
  const B = C.BREADTH;

  const stats = {};        // key → {up, flat, dn, value, limitUp, limitDn, n} | null(실패)
  let stamp = '';
  let busy = false;
  let started = false;

  /* ── 지수 하나의 구성종목을 받아 집계 ───────────── */
  async function fetchOne(m) {
    /* ⚠ content-type 헤더 금지 — 스캐너 CORS 허용 목록에 없어 preflight에서 거부됨 */
    const r = await fetch(`https://scanner.tradingview.com/${m.scan}/scan`, {
      method: 'POST',
      body: JSON.stringify({
        symbols: { groups: [{ type: 'index', values: [m.index] }] },
        columns: ['change', 'Value.Traded'],
        range: [0, B.maxRows],
      }),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const rows = (await r.json()).data || [];
    const s = { up: 0, flat: 0, dn: 0, value: 0, limitUp: 0, limitDn: 0, n: 0 };
    rows.forEach(x => {
      const chg = x.d[0];
      if (chg == null) return;   // 거래정지 등으로 등락률이 없는 종목은 모수에서 제외
      s.n++;
      /* 0.0001% 미만은 보합으로 — 부동소수 오차로 ▲0.00%가 찍히는 것을 막는다 */
      if (chg > 0.0001) s.up++;
      else if (chg < -0.0001) s.dn++;
      else s.flat++;
      if (chg >= B.limitPct) s.limitUp++;
      else if (chg <= -B.limitPct) s.limitDn++;
      s.value += x.d[1] || 0;
    });
    return s;
  }

  /* ── 지역별 시장 온도 = 상승 ÷ (상승+하락) × 100 ── */
  function tempOf(region) {
    let up = 0, dn = 0;
    B.markets.filter(m => m.region === region).forEach(m => {
      const s = stats[m.key];
      if (s) { up += s.up; dn += s.dn; }
    });
    if (!up && !dn) return null;
    const score = Math.round((up / (up + dn)) * 100);
    const band = B.temp.find(t => score >= t[0]) || B.temp[B.temp.length - 1];
    return { score, label: band[1], cls: band[2], up, dn };
  }

  /* ── 렌더 ────────────────────────────────────────── */
  function segHtml(m) {
    const s = stats[m.key];
    if (!s) {
      return `<button class="bd-seg" disabled>
        <span class="bd-row"><span class="bd-name">${App.esc(m.label)}</span>
          <span class="bd-cnt dim">${stats[m.key] === null ? '조회 실패' : '집계 중…'}</span></span>
        <span class="bd-bar"><i class="b-fl" style="width:100%"></i></span>
        <span class="bd-sub">—</span></button>`;
    }
    const tot = s.up + s.flat + s.dn || 1;
    const pct = n => (n / tot * 100).toFixed(2) + '%';
    const sub = [`대금 ${App.fmt.cap(s.value, m.cur)}`];
    if (m.limits) {
      /* 상·하한가는 있을 때만 — 0을 늘 띄우면 줄만 길어진다 */
      if (s.limitUp) sub.push(`<i class="up">상한 ${s.limitUp}</i>`);
      if (s.limitDn) sub.push(`<i class="dn">하한 ${s.limitDn}</i>`);
    }
    const title = `${m.label} 구성종목 ${s.n}개 — 상승 ${s.up} · 보합 ${s.flat} · 하락 ${s.dn}\n`
      + `거래대금 합계 ${App.fmt.cap(s.value, m.cur)}\n눌러서 핫 종목에서 보기`;
    return `<button class="bd-seg" data-key="${App.esc(m.key)}" title="${App.esc(title)}">
      <span class="bd-row">
        <span class="bd-name">${App.esc(m.label)}<em>${s.n}</em></span>
        <span class="bd-cnt"><i class="up">▲${s.up.toLocaleString()}</i>` +
        `<i class="fl">${s.flat}</i><i class="dn">▼${s.dn.toLocaleString()}</i></span>
      </span>
      <span class="bd-bar">
        <i class="b-up" style="width:${pct(s.up)}"></i>` +
        `<i class="b-fl" style="width:${pct(s.flat)}"></i>` +
        `<i class="b-dn" style="width:${pct(s.dn)}"></i>
      </span>
      <span class="bd-sub">${sub.join(' · ')}</span>
    </button>`;
  }

  function tempHtml(rg) {
    const t = tempOf(rg.key);
    if (!t) {
      return `<div class="bd-temp"><span class="bd-tlabel">${App.esc(rg.label)} 온도</span>
        <span class="bd-tval"><b>—</b></span><span class="bd-gauge"></span></div>`;
    }
    const title = `${rg.label} 시장 온도 ${t.score} (${t.label})\n`
      + `상승 ${t.up} ÷ (상승 ${t.up} + 하락 ${t.dn}) × 100\n`
      + '75↑ 과열 · 60↑ 강세 · 40↑ 중립 · 25↑ 약세 · 그 아래 공포';
    return `<div class="bd-temp t-${t.cls}" title="${App.esc(title)}">
      <span class="bd-tlabel">${App.esc(rg.label)} 온도</span>
      <span class="bd-tval"><b>${t.score}</b><span>${App.esc(t.label)}</span></span>
      <span class="bd-gauge"><i style="left:${t.score}%"></i></span>
    </div>`;
  }

  function render() {
    const host = document.getElementById('breadth');
    if (!host) return;
    const parts = [];
    B.regions.forEach(rg => {
      B.markets.filter(m => m.region === rg.key).forEach(m => parts.push(segHtml(m)));
      parts.push(tempHtml(rg));
    });
    host.innerHTML = parts.join('') +
      `<button class="bd-refresh" id="bd-refresh" title="지수 구성종목을 다시 집계합니다">
        <span>${busy ? '집계 중' : '⟳ 갱신'}</span><span class="bd-rtime">${App.esc(stamp || '—')}</span>
      </button>`;

    /* 세그먼트 클릭 → 핫 종목 탭을 그 지수로 열기 */
    host.querySelectorAll('.bd-seg[data-key]').forEach(btn => {
      const m = B.markets.find(x => x.key === btn.dataset.key);
      btn.onclick = () => { if (m && window.AppHot) window.AppHot.goto(m.hot.mkt, m.hot.uni); };
    });
    document.getElementById('bd-refresh').onclick = () => load();
  }

  /* ── 로드 (시장별 개별 try/catch — 하나가 죽어도 나머지는 표시) ── */
  async function load() {
    if (busy) return;
    busy = true;
    render();
    await Promise.all(B.markets.map(async m => {
      try { stats[m.key] = await fetchOne(m); }
      catch (e) { stats[m.key] = null; }
    }));
    stamp = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    busy = false;
    render();
  }

  function init() {
    if (started) return;
    started = true;
    render();
    load();
    /* 탭이 화면에 보일 때만 갱신 — 한 번에 ~165KB이라 백그라운드에서 돌릴 이유가 없다 */
    setInterval(() => { if (!document.hidden) load(); }, B.refreshSec * 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
  }

  return { init, load };
})();
