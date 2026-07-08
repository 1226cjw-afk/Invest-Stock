/* 06 급등락 AI 분석 — Claude + 웹 검색으로 원인 리포트 생성 */
(function () {
  const C = window.AppConfig;
  let target = C.AI_TARGETS[0];
  let direction = 'auto';

  function currentTarget() {
    return document.getElementById('ai-custom').value.trim() || target;
  }

  function renderLinks() {
    const q = encodeURIComponent(currentTarget());
    document.getElementById('ai-links').innerHTML = `
      <a class="qlink" target="_blank" href="https://search.naver.com/search.naver?where=news&sort=1&query=${q}">네이버 뉴스 검색</a>
      <a class="qlink" target="_blank" href="https://news.google.com/search?q=${q}&hl=ko&gl=KR">구글 뉴스 검색</a>
      <a class="qlink" target="_blank" href="https://finance.naver.com/">네이버 금융</a>
      <a class="qlink" target="_blank" href="https://kr.investing.com/economic-calendar/">인베스팅 경제캘린더</a>
      <a class="qlink" target="_blank" href="https://finviz.com/news.ashx">Finviz 뉴스</a>`;
  }

  async function run() {
    const key = document.getElementById('ai-key').value.trim();
    const result = document.getElementById('ai-result');
    const status = document.getElementById('ai-status');
    const btn = document.getElementById('ai-run');

    if (!key) {
      result.innerHTML = '<div class="err">API 키를 먼저 입력하세요. 키가 없다면 아래 <b>수동 검색 바로가기</b> 링크로 뉴스를 직접 확인할 수 있습니다.</div>';
      return;
    }
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>웹 검색 + 분석 중… (1~3분 소요)';
    status.textContent = '분석 중';
    result.innerHTML = '<div class="placeholder"><span class="big">◌</span>Claude가 최신 뉴스를 검색하고 원인을 분석하고 있습니다…</div>';

    try {
      const { text, citations } = await AiClient.analyze({
        apiKey: key,
        target: currentTarget(),
        direction,
        onStatus: s => { status.textContent = s; },
      });

      let html = App.mdLite(text);
      if (citations.length) {
        html += '<div class="src"><h4>SOURCES · 검색 출처</h4>' +
          citations.slice(0, 12).map(c =>
            `<a href="${App.esc(c.url)}" target="_blank">↗ ${App.esc(c.title || c.url)}</a>`).join('') +
          '</div>';
      }
      result.innerHTML = html;
      status.textContent = '완료 · ' + new Date().toLocaleTimeString('ko-KR');
    } catch (e) {
      result.innerHTML = `<div class="err"><b>분석 실패:</b> ${App.esc(e.message)}<br><br>
        네트워크/CORS 문제라면 페이지를 로컬 서버로 열어보세요 (README 참고).
        급하면 왼쪽 하단 <b>수동 검색 바로가기</b>로 직접 뉴스를 확인할 수 있습니다.</div>`;
      status.textContent = '오류';
    } finally {
      btn.disabled = false;
      btn.innerHTML = '▶ AI 원인 분석 실행';
    }
  }

  App.registerPage({
    id: 'ai',
    label: '급등락 AI 분석',
    order: 60,
    html: `
      <div class="grid">
        <div class="panel">
          <div class="panel-hd"><h2>분석 설정</h2><span class="tag">AI</span></div>

          <div class="field">
            <label>분석 대상</label>
            <div class="chips" id="ai-targets"></div>
            <div style="margin-top:8px">
              <input type="text" id="ai-custom" placeholder="직접 입력 (예: 미국 반도체 섹터, 테슬라, 원달러 환율)">
            </div>
          </div>

          <div class="field">
            <label>변동 방향</label>
            <div class="chips" id="ai-dirs">
              <span class="chip dir active" data-dir="auto">자동 판단</span>
              <span class="chip dir" data-dir="급등">급등 ▲</span>
              <span class="chip dir" data-dir="급락">급락 ▼</span>
            </div>
          </div>

          <div class="field">
            <label>Anthropic API 키 <span style="color:#3d4653">(웹 검색 기반 분석에 필요)</span></label>
            <input type="password" id="ai-key" placeholder="sk-ant-api03-...">
            <div class="hint">
              키는 이 브라우저의 localStorage에만 저장되며 Anthropic API 호출에만 사용됩니다.
              키가 없으면 <a href="https://platform.claude.com/" target="_blank">platform.claude.com</a>에서 발급하세요.
              분석 1회당 소액의 API 비용이 발생합니다.
            </div>
          </div>

          <button class="btn-main" id="ai-run">▶ AI 원인 분석 실행</button>

          <div class="field" style="border-top:1px solid var(--line);border-bottom:none">
            <label>수동 검색 바로가기</label>
            <div class="quicklinks" id="ai-links"></div>
          </div>
        </div>

        <div class="col">
          <div class="panel">
            <div class="panel-hd"><h2>분석 리포트</h2><span class="note" id="ai-status">대기 중</span></div>
            <div id="ai-result">
              <div class="placeholder">
                <span class="big">⌁</span>
                왼쪽에서 대상을 고르고 <b style="color:var(--amber)">AI 원인 분석 실행</b>을 누르면<br>
                Claude가 웹 검색으로 오늘 급등·급락의 원인을 조사해 리포트를 작성합니다.<br>
                지수·섹터·개별 종목·환율 모두 분석 가능합니다.
              </div>
            </div>
          </div>
          <div class="panel" style="height:340px">
            <div class="panel-hd"><h2>실시간 시장 뉴스 피드</h2></div>
            <div class="panel-bd" id="w-news2"></div>
          </div>
        </div>
      </div>`,
    init() {
      // 대상 프리셋 칩
      const box = document.getElementById('ai-targets');
      C.AI_TARGETS.forEach((t, i) => {
        const c = document.createElement('span');
        c.className = 'chip' + (i === 0 ? ' active' : '');
        c.textContent = t;
        c.onclick = () => {
          box.querySelectorAll('.chip').forEach(x => x.classList.remove('active'));
          c.classList.add('active');
          target = t;
          document.getElementById('ai-custom').value = '';
          renderLinks();
        };
        box.appendChild(c);
      });
      document.getElementById('ai-custom').addEventListener('input', renderLinks);

      // 방향 칩
      document.querySelectorAll('#ai-dirs .chip').forEach(c => c.onclick = () => {
        document.querySelectorAll('#ai-dirs .chip').forEach(x => x.classList.remove('active'));
        c.classList.add('active');
        direction = c.dataset.dir;
      });

      // API 키 저장
      const keyEl = document.getElementById('ai-key');
      keyEl.value = App.store.getRaw(C.STORAGE.apiKey);
      keyEl.addEventListener('change', () => App.store.setRaw(C.STORAGE.apiKey, keyEl.value.trim()));

      document.getElementById('ai-run').onclick = run;
      renderLinks();

      App.tv('w-news2', 'timeline', {
        ...App.DARK, feedMode: 'market', market: 'stock',
        displayMode: 'compact', width: '100%', height: '100%',
      });
    },
  });
})();
