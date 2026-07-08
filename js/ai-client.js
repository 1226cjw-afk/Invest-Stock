/* ═══════════════════════════════════════════════════════════
   INVST://STOCK — Claude API 클라이언트 (웹 검색 기반 시장 분석)

   ⚠ 확장 시 주의: 지금은 로컬 개인용이라 브라우저에서 API를 직접
   호출하지만(anthropic-dangerous-direct-browser-access), 여러 사람이
   쓰는 웹 서비스로 배포할 때는 API 키가 노출되지 않도록
   반드시 자체 백엔드 프록시(예: POST /api/analyze)를 만들고
   AppConfig.AI.endpoint 를 그 주소로 바꾸세요. 이 파일의 다른
   부분(프롬프트·응답 파싱)은 그대로 재사용할 수 있습니다.
═══════════════════════════════════════════════════════════ */
window.AiClient = (function () {
  const C = () => window.AppConfig.AI;

  function buildPrompt(target, direction) {
    const today = new Date().toLocaleDateString('ko-KR', {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
    });
    const dirTxt = direction === 'auto'
      ? '최근 등락 방향(급등인지 급락인지)을 먼저 검색으로 확인한 뒤 그 이유를'
      : `${direction}한 이유를`;
    return `당신은 한국 개인투자자를 위한 시장 분석가입니다. 오늘은 ${today}입니다.
분석 대상: "${target}"

웹 검색을 사용해 오늘(휴장이면 가장 최근 거래일) 이 대상의 ${dirTxt} 조사하고, 아래 구조의 한국어 리포트를 작성하세요.

## 📌 핵심 요약
(3줄 이내. 등락률 수치 포함)
## 📊 무슨 일이 있었나
(오늘/최근 거래일의 실제 움직임을 수치와 함께)
## 🔍 원인 분석
(거시경제 / 뉴스·이벤트 / 실적 / 수급 등으로 구분해 근거와 함께)
## 🎯 영향받는 종목·섹터
(미국·한국 관련 종목을 모두 포함, 왜 영향을 받는지 한 줄씩)
## 🧭 향후 관전 포인트
(주목할 일정·경제지표·이벤트)

규칙:
- 수치는 반드시 검색으로 확인된 값만 사용하고, 확인이 안 되면 "미확인"으로 표기하세요.
- 추측과 확인된 사실을 구분해 표현하세요.
- 마지막 줄에 "※ 본 분석은 투자 참고용이며 매매 권유가 아닙니다."를 넣으세요.`;
  }

  /**
   * 급등락 원인 분석 실행
   * @returns {Promise<{text: string, citations: {url, title}[]}>}
   */
  async function analyze({ apiKey, target, direction, onStatus }) {
    const cfg = C();
    let messages = [{ role: 'user', content: buildPrompt(target, direction) }];
    let data = null;

    for (let i = 0; i < cfg.maxContinuations; i++) {
      const r = await fetch(cfg.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: cfg.model,
          max_tokens: cfg.maxTokens,
          thinking: { type: 'adaptive' },
          tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: cfg.maxWebSearches }],
          messages,
        }),
      });

      if (!r.ok) {
        let msg = 'HTTP ' + r.status;
        try { msg = (await r.json()).error?.message || msg; } catch (e) { /* ignore */ }
        if (r.status === 401) msg = 'API 키가 올바르지 않습니다. 키를 다시 확인하세요.';
        if (r.status === 429) msg = '요청 한도(rate limit)에 걸렸습니다. 잠시 후 다시 시도하세요.';
        throw new Error(msg);
      }
      data = await r.json();

      // 서버측 검색 루프 일시정지 → 그대로 이어서 재요청
      if (data.stop_reason === 'pause_turn') {
        messages = [messages[0], { role: 'assistant', content: data.content }];
        if (onStatus) onStatus('검색 계속 중…');
        continue;
      }
      break;
    }

    if (data.stop_reason === 'refusal') {
      throw new Error('모델이 이 요청에 대한 응답을 거절했습니다. 대상을 바꿔 다시 시도해 보세요.');
    }

    const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
    const citations = [];
    const seen = new Set();
    data.content.forEach(b => (b.citations || []).forEach(c => {
      if (c.url && !seen.has(c.url)) { seen.add(c.url); citations.push({ url: c.url, title: c.title }); }
    }));

    return { text, citations };
  }

  return { analyze, buildPrompt };
})();
