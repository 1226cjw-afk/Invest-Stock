/* 06-b AI 리포트 보관함 — Claude Code 세션에서 저장한 분석 리포트 열람
   데이터: js/reports-data.js 의 window.AppReports (Claude Code가 자동 추가) */
(function () {

  function renderViewer(r) {
    const v = document.getElementById('report-view');
    let html = `<div class="report-meta">${App.esc(r.date)} · 대상: <b>${App.esc(r.target)}</b>` +
      (r.direction ? ` · ${App.esc(r.direction)}` : '') + `</div>`;
    html += App.mdLite(r.md);
    if (r.sources && r.sources.length) {
      html += '<div class="src"><h4>SOURCES · 검색 출처</h4>' +
        r.sources.map(s => `<a href="${App.esc(s.url)}" target="_blank">↗ ${App.esc(s.title || s.url)}</a>`).join('') +
        '</div>';
    }
    v.innerHTML = html;
  }

  App.registerPage({
    id: 'reports',
    label: 'AI 리포트',
    order: 65,
    html: `
      <div class="grid" id="reports-grid">
        <div class="panel symlist" id="report-list" style="max-height:calc(100vh - 230px)"></div>
        <div class="panel">
          <div class="panel-hd"><h2>저장된 분석 리포트</h2><span class="note" id="report-count"></span></div>
          <div id="report-view" class="report-body">
            <div class="placeholder">
              <span class="big">▤</span>
              아직 저장된 리포트가 없습니다.<br><br>
              이 폴더에서 <b style="color:var(--amber)">Claude Code</b>를 열고
              "오늘 코스피 왜 빠졌는지 분석해줘"처럼 물어보세요.<br>
              분석 결과가 자동으로 여기에 저장됩니다. (새로고침 필요)
            </div>
          </div>
        </div>
      </div>`,
    init() {
      const reports = window.AppReports || [];
      document.getElementById('report-count').textContent = reports.length + '건';
      const list = document.getElementById('report-list');

      if (!reports.length) {
        list.innerHTML = '<div class="group">REPORTS</div><div class="hint" style="padding:4px 14px">비어 있음</div>';
        return;
      }
      const g = document.createElement('div');
      g.className = 'group'; g.textContent = 'REPORTS';
      list.appendChild(g);

      reports.forEach((r, i) => {
        const b = document.createElement('button');
        b.className = 'symbtn';
        b.innerHTML = `${App.esc(r.target)}${r.direction ? ' ' + App.esc(r.direction) : ''}<small>${App.esc(r.date)}</small>`;
        b.onclick = () => {
          list.querySelectorAll('.symbtn').forEach(x => x.classList.remove('active'));
          b.classList.add('active');
          renderViewer(r);
        };
        list.appendChild(b);
        if (i === 0) { b.classList.add('active'); renderViewer(r); }
      });
    },
  });
})();
