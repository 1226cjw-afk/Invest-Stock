/* 02·03 섹터 히트맵
   - 미국: TradingView embed 위젯 (정상 동작)
   - 국내: TradingView embed 위젯이 한국 데이터셋을 지원하지 않아(SPX500 폴백,
     2026-07-08 headless 렌더 테스트로 확인) 스캐너 API + 자체 트리맵으로 구현.
     색상은 한국 관례(빨강=상승, 파랑=하락). 타일 클릭 → 공용 상세 팝업 */
(function () {
  const C = window.AppConfig;

  /* ══════════ 미국: embed 위젯 ══════════ */
  function usHeatmap(dataSource) {
    App.tv('w-heat-us', 'stock-heatmap', {
      locale: 'kr', colorTheme: 'dark',
      dataSource, grouping: 'sector',
      blockSize: 'market_cap_basic', blockColor: 'change',
      exchanges: [], hasTopBar: false, isDataSetEnabled: false,
      isZoomEnabled: true, hasSymbolTooltip: true, isMonoSize: false,
      width: '100%', height: '100%',
    });
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
    init() {
      const wrap = document.getElementById('us-sets');
      C.HEATMAP_SETS.us.forEach(([id, label], i) => {
        const b = document.createElement('button');
        b.className = 'ctl' + (i === 0 ? ' active' : '');
        b.textContent = label;
        b.onclick = () => {
          wrap.querySelectorAll('.ctl').forEach(x => x.classList.remove('active'));
          b.classList.add('active');
          usHeatmap(id);
        };
        wrap.appendChild(b);
      });
      usHeatmap(C.HEATMAP_SETS.us[0][0]);
    },
  });

  /* ══════════ 국내: 스캐너 API + 자체 트리맵 ══════════ */
  let krIndex = null;
  let krData = null;     // 마지막 조회 데이터 (리사이즈 시 재배치용)

  /* 확대/이동 상태.
     CSS transform 으로 늘리는 대신 W*zoom × H*zoom 캔버스에 트리맵을 다시 계산한다 →
     확대하면 타일 면적이 실제로 커지므로 글자가 안 깨지고, 작아서 이름이 없던
     종목에 이름·등락률이 새로 나타난다. */
  const ZOOM_MIN = 1, ZOOM_MAX = 8;
  let view = { zoom: 1, panX: 0, panY: 0 };

  async function fetchKr(indexSym) {
    /* ⚠ content-type 헤더를 넣으면 안 됨: 스캐너 서버의 CORS 허용 헤더 목록에
       content-type이 없어 preflight에서 거부됨. 헤더 없이 보내면(단순 요청)
       preflight 자체가 없어서 file://와 localhost 모두 통과 (2026-07-08 확인) */
    const r = await fetch('https://scanner.tradingview.com/korea/scan', {
      method: 'POST',
      body: JSON.stringify({
        options: { lang: 'ko' },
        symbols: { groups: [{ type: 'index', values: [indexSym] }] },
        columns: ['name', 'description', 'close', 'change', 'market_cap_basic', 'sector'],
        sort: { sortBy: 'market_cap_basic', sortOrder: 'desc' },
        range: [0, C.KR_HEATMAP.maxStocks],
      }),
    });
    if (!r.ok) throw new Error('스캐너 응답 오류 HTTP ' + r.status);
    return (await r.json()).data || [];
  }

  /* squarified treemap (Bruls et al. 근사) — items: [{value,...}] 내림차순 */
  function squarify(items, rect) {
    const out = [];
    let { x, y, w, h } = rect;
    const total = items.reduce((s, i) => s + i.value, 0);
    if (total <= 0 || w <= 0 || h <= 0) return out;
    const scaled = items.map(it => ({ it, area: it.value * w * h / total }));

    let row = [];
    const rowSum = r => r.reduce((a, e) => a + e.area, 0);
    function worst(r, len) {
      const s = rowSum(r), s2 = s * s, l2 = len * len;
      let mx = 0, mn = Infinity;
      r.forEach(e => { mx = Math.max(mx, e.area); mn = Math.min(mn, e.area); });
      return Math.max(l2 * mx / s2, s2 / (l2 * mn));
    }
    function layoutRow(r) {
      const s = rowSum(r);
      if (w < h) {                       // 가로 행
        const rh = s / w; let rx = x;
        r.forEach(e => { const rw = e.area / rh; out.push({ x: rx, y, w: rw, h: rh, it: e.it }); rx += rw; });
        y += rh; h -= rh;
      } else {                           // 세로 열
        const rw = s / h; let ry = y;
        r.forEach(e => { const rh2 = e.area / rw; out.push({ x, y: ry, w: rw, h: rh2, it: e.it }); ry += rh2; });
        x += rw; w -= rw;
      }
    }
    scaled.forEach(e => {
      const len = Math.max(1, Math.min(w, h));
      if (row.length && worst(row.concat(e), len) > worst(row, len)) { layoutRow(row); row = [e]; }
      else row.push(e);
    });
    if (row.length) layoutRow(row);
    return out;
  }

  /* 등락률 → 색 (한국 관례: 빨강=상승, 파랑=하락) */
  function tileColor(chg) {
    const m = C.KR_HEATMAP.colorMax;
    const t = Math.min(Math.abs(chg || 0) / m, 1);
    if (Math.abs(chg || 0) < 0.05) return 'hsl(213 12% 22%)';
    return chg > 0
      ? `hsl(353 ${55 + 20 * t}% ${20 + 22 * t}%)`
      : `hsl(212 ${55 + 20 * t}% ${22 + 20 * t}%)`;
  }

  function shortName(desc, name) {
    return (desc || name || '').replace(/보통주$/, '').trim();
  }

  function renderTreemap() {
    const host = document.getElementById('w-heat-kr');
    if (!host || !krData) return;
    const W = host.clientWidth, H = host.clientHeight;
    if (W < 50 || H < 50) return;

    clampPan(W, H);
    const CW = W * view.zoom, CH = H * view.zoom;   // 확대된 가상 캔버스 크기
    host.innerHTML = '';
    const canvas = document.createElement('div');
    canvas.className = 'tm-canvas';
    canvas.style.cssText =
      `left:${-view.panX}px;top:${-view.panY}px;width:${CW}px;height:${CH}px`;

    /* 섹터별 그룹 (시총 합 기준) */
    const groups = new Map();
    krData.forEach(row => {
      const [name, desc, close, change, cap, sector] = row.d;
      if (!cap) return;
      const key = sector || 'Miscellaneous';
      if (!groups.has(key)) groups.set(key, { sector: key, value: 0, stocks: [] });
      const g = groups.get(key);
      g.value += cap;
      g.stocks.push({ sym: row.s, name: shortName(desc, name), close, change: change || 0, value: cap });
    });
    const sectors = [...groups.values()].sort((a, b) => b.value - a.value);

    const HEADER = 17;
    squarify(sectors, { x: 0, y: 0, w: CW, h: CH }).forEach(sr => {
      const g = sr.it;
      const sec = document.createElement('div');
      sec.className = 'tm-sector';
      sec.style.cssText = `left:${sr.x}px;top:${sr.y}px;width:${sr.w}px;height:${sr.h}px`;

      /* 섹터 헤더 (시총가중 평균 등락률) */
      const wavg = g.stocks.reduce((s, st) => s + st.change * st.value, 0) / g.value;
      const label = document.createElement('div');
      label.className = 'tm-label';
      const koName = C.KR_HEATMAP.sectorKo[g.sector] || g.sector;
      if (sr.w > 70 && sr.h > 40) {
        label.innerHTML = `${App.esc(koName)} <b class="${wavg >= 0 ? 'up' : 'dn'}">${wavg >= 0 ? '+' : ''}${wavg.toFixed(1)}%</b>`;
      }
      sec.appendChild(label);

      /* 섹터 내부 종목 타일 */
      const inner = { x: 0, y: HEADER, w: sr.w, h: Math.max(0, sr.h - HEADER) };
      g.stocks.sort((a, b) => b.value - a.value);
      squarify(g.stocks, inner).forEach(tr => {
        const st = tr.it;
        const tile = document.createElement('div');
        tile.className = 'tm-tile';
        tile.style.cssText =
          `left:${tr.x}px;top:${tr.y}px;width:${tr.w}px;height:${tr.h}px;background:${tileColor(st.change)}`;
        const area = tr.w * tr.h;
        const pct = (st.change >= 0 ? '+' : '') + st.change.toFixed(2) + '%';
        if (area > 5200 && tr.w > 58) {
          const fs = Math.max(10, Math.min(17, Math.sqrt(area) / 9));
          tile.innerHTML = `<span style="font-size:${fs}px">${App.esc(st.name)}</span><small>${pct}</small>`;
        } else if (area > 1800 && tr.w > 40) {
          tile.innerHTML = `<span style="font-size:10px">${App.esc(st.name)}</span>`;
        }
        tile.title = `${st.name} (${st.sym})\n현재가 ${Math.round(st.close).toLocaleString('ko-KR')}원 · ${pct}`;
        /* 드래그로 지도를 옮긴 직후의 클릭은 팝업을 열지 않는다 */
        tile.onclick = () => { if (!suppressClick) App.openSymbolModal(st.sym, st.name); };
        sec.appendChild(tile);
      });
      canvas.appendChild(sec);
    });
    host.appendChild(canvas);
  }

  /* ── 확대/이동 ─────────────────────────────────────
     휠·핀치 = 확대, 드래그 = 이동. 확대 배율이 바뀌면 트리맵을 다시 계산한다. */
  let suppressClick = false;
  let raf = null;

  function clampPan(W, H) {
    const CW = W * view.zoom, CH = H * view.zoom;
    view.panX = Math.max(0, Math.min(view.panX, CW - W));
    view.panY = Math.max(0, Math.min(view.panY, CH - H));
  }

  function scheduleRender() {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = null; renderTreemap(); });
  }

  /* (localX, localY) 지점을 화면상 제자리에 고정한 채 factor 배 확대 */
  function zoomAt(localX, localY, factor) {
    const host = document.getElementById('w-heat-kr');
    if (!host) return false;
    const z0 = view.zoom;
    const z1 = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z0 * factor));
    if (z1 === z0) return false;
    const k = z1 / z0;
    view.zoom = z1;
    view.panX = (view.panX + localX) * k - localX;
    view.panY = (view.panY + localY) * k - localY;
    clampPan(host.clientWidth, host.clientHeight);
    return true;
  }

  function zoomCenter(factor) {
    const host = document.getElementById('w-heat-kr');
    if (host && zoomAt(host.clientWidth / 2, host.clientHeight / 2, factor)) renderTreemap();
  }

  function resetView() {
    view = { zoom: 1, panX: 0, panY: 0 };
    renderTreemap();
  }

  function bindZoom(host) {
    const local = e => {
      const r = host.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };

    host.addEventListener('wheel', e => {
      if (!krData) return;
      e.preventDefault();                       // 페이지 스크롤 대신 지도 확대
      const [x, y] = local(e);
      if (zoomAt(x, y, e.deltaY < 0 ? 1.18 : 1 / 1.18)) scheduleRender();
    }, { passive: false });

    /* 더블클릭 확대는 넣지 않는다 — 첫 클릭이 이미 상세 팝업을 열어버려 충돌한다.
       배율 조절은 휠·핀치와 ＋ / － 버튼으로 한다. */

    /* 포인터 이벤트로 마우스 드래그와 두 손가락 핀치를 함께 처리 */
    const pts = new Map();          // pointerId → 마지막 좌표
    let pinchDist = 0, moved = 0;
    const spread = () => {
      const [a, b] = [...pts.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };

    host.addEventListener('pointerdown', e => {
      host.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved = 0;
      suppressClick = false;
      if (pts.size === 2) pinchDist = spread();
    });

    host.addEventListener('pointermove', e => {
      const p = pts.get(e.pointerId);
      if (!p || !krData) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;

      if (pts.size === 1) {
        moved += Math.abs(dx) + Math.abs(dy);
        /* 확대 상태에서 10px 넘게 끈 경우에만 이동으로 판정.
           원본 배율에서는 어차피 움직일 곳이 없으므로, 손이 조금 흔들린 탭은 그대로 살린다. */
        if (view.zoom > 1 && moved > 10) {
          suppressClick = true;
          view.panX -= dx; view.panY -= dy;
          clampPan(host.clientWidth, host.clientHeight);
          scheduleRender();
        }
      } else if (pts.size === 2) {
        const d = spread();
        if (pinchDist > 0 && d > 0) {
          suppressClick = true;
          const [a, b] = [...pts.values()];
          const r = host.getBoundingClientRect();
          if (zoomAt((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, d / pinchDist)) scheduleRender();
        }
        pinchDist = d;
      }
    });

    const end = e => { pts.delete(e.pointerId); if (pts.size < 2) pinchDist = 0; };
    host.addEventListener('pointerup', end);
    host.addEventListener('pointercancel', end);
  }

  async function loadKr(indexSym) {
    const host = document.getElementById('w-heat-kr');
    host.innerHTML = '<div class="placeholder"><span class="big">◌</span>불러오는 중…</div>';
    try {
      krIndex = indexSym;
      krData = await fetchKr(indexSym);
      view = { zoom: 1, panX: 0, panY: 0 };   // 지수를 바꾸면 확대 상태 초기화
      renderTreemap();
      document.getElementById('kr-stamp').textContent =
        `시총 상위 ${krData.length}종목 · 갱신 ${new Date().toLocaleTimeString('ko-KR')}` +
        ` · 휠·핀치로 확대, 드래그로 이동 · 타일 탭 = 상세 보기`;
    } catch (e) {
      host.innerHTML = `<div class="err"><b>데이터를 불러오지 못했습니다:</b> ${App.esc(e.message)}<br>
        잠시 후 <b>⟳ 새로고침</b>을 눌러 다시 시도하세요.</div>`;
    }
  }

  App.registerPage({
    id: 'kr',
    label: '국내 섹터맵',
    order: 30,
    html: `
      <div class="panel h-full">
        <div class="panel-hd"><h2>국내 주식 섹터 히트맵</h2>
          <span class="note" id="kr-stamp">블록 크기 = 시가총액 · 빨강 = 상승 · 파랑 = 하락</span></div>
        <div class="controls" id="kr-sets"></div>
        <div class="panel-bd tm-host" id="w-heat-kr"></div>
      </div>`,
    init() {
      const host = document.getElementById('w-heat-kr');
      bindZoom(host);
      const wrap = document.getElementById('kr-sets');
      C.KR_HEATMAP.indexes.forEach(([sym, label], i) => {
        const b = document.createElement('button');
        b.className = 'ctl' + (i === 0 ? ' active' : '');
        b.textContent = label;
        b.onclick = () => {
          wrap.querySelectorAll('.ctl').forEach(x => x.classList.remove('active'));
          b.classList.add('active');
          loadKr(sym);
        };
        wrap.appendChild(b);
      });
      const sep = document.createElement('span');
      sep.className = 'ctl-sep';
      wrap.appendChild(sep);

      /* 확대 버튼 — 휠·핀치를 모르는 경우와 모바일 접근성용 */
      [['＋', () => zoomCenter(1.5)],
       ['－', () => zoomCenter(1 / 1.5)],
       ['⤢ 초기화', resetView]].forEach(([label, fn]) => {
        const b = document.createElement('button');
        b.className = 'ctl';
        b.textContent = label;
        b.onclick = fn;
        wrap.appendChild(b);
      });

      const refresh = document.createElement('button');
      refresh.className = 'ctl';
      refresh.textContent = '⟳ 새로고침';
      refresh.onclick = () => { if (krIndex) loadKr(krIndex); };
      wrap.appendChild(refresh);

      /* 창 크기 변경 시 재배치 (데이터 재조회 없음) */
      let t = null;
      window.addEventListener('resize', () => {
        clearTimeout(t);
        t = setTimeout(renderTreemap, 200);
      });

      loadKr(C.KR_HEATMAP.indexes[0][0]);
    },
  });
})();
