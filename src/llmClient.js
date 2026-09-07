'use strict';

/**
 * 사용자가 직접 등록한 LLM(OpenAI 호환 또는 Anthropic)을 호출하는 클라이언트.
 * main 프로세스에서만 사용한다 (API 키를 렌더러로 노출하지 않기 위함).
 * 이 파일이 유일하게 "의도적으로" 외부 네트워크를 호출하는 지점이다 -
 * main.js의 네트워크 허용목록은 여기서 만든 요청의 호스트만 통과시킨다.
 */

const DEFAULT_TIMEOUT_MS = 30000;

function withTimeout(promise, ms) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`LLM 응답 대기 시간 초과 (${ms / 1000}초)`)), ms);
    if (timer.unref) timer.unref(); // 이 타이머 하나만으로 프로세스/테스트 종료가 지연되지 않게
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

async function callOpenAICompatible(config, messages) {
  const baseUrl = (config.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  const res = await withTimeout(
    fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: config.model, messages, temperature: 0.3 }),
    }),
    config.timeoutMs || DEFAULT_TIMEOUT_MS,
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`LLM 호출 실패 (HTTP ${res.status}): ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('LLM 응답에서 내용을 찾을 수 없습니다 (choices[0].message.content 없음)');
  return content;
}

async function callAnthropic(config, messages) {
  const baseUrl = (config.baseUrl || 'https://api.anthropic.com/v1').replace(/\/$/, '');
  const systemMsg = messages.find((m) => m.role === 'system');
  const rest = messages.filter((m) => m.role !== 'system');
  const res = await withTimeout(
    fetch(`${baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.model,
        system: systemMsg ? systemMsg.content : undefined,
        messages: rest,
        max_tokens: config.maxTokens || 1500,
      }),
    }),
    config.timeoutMs || DEFAULT_TIMEOUT_MS,
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`LLM 호출 실패 (HTTP ${res.status}): ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  const content = data?.content?.[0]?.text;
  if (!content) throw new Error('LLM 응답에서 내용을 찾을 수 없습니다 (content[0].text 없음)');
  return content;
}

/**
 * @param {{provider: 'openai'|'anthropic'|'openai-compatible', apiKey: string, baseUrl?: string, model: string, timeoutMs?: number}} config
 * @param {{role: string, content: string}[]} messages
 */
async function callLLM(config, messages) {
  if (!config || !config.apiKey) throw new Error('LLM API 키가 등록되어 있지 않습니다. 설정에서 먼저 등록해주세요.');
  if (!config.model) throw new Error('LLM 모델명이 지정되지 않았습니다.');
  if (config.provider === 'anthropic') return callAnthropic(config, messages);
  return callOpenAICompatible(config, messages);
}

async function testConnection(config) {
  try {
    const reply = await callLLM(config, [{ role: 'user', content: '연결 테스트입니다. "OK"라고만 답해주세요.' }]);
    return { ok: true, reply };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/** config에서 실제로 요청이 나갈 호스트를 뽑아낸다 (main.js 네트워크 허용목록 등록용). */
function resolveHost(config) {
  const defaultUrl = config.provider === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.openai.com';
  try {
    return new URL(config.baseUrl || defaultUrl).host;
  } catch {
    return new URL(defaultUrl).host;
  }
}

module.exports = { callLLM, testConnection, resolveHost };
