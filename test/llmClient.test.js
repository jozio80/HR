'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { callLLM, testConnection, resolveHost } = require('../src/llmClient.js');

/** OpenAI 호환 chat/completions 형태로 응답하는 로컬 목 서버를 띄운다. */
function startOpenAIMockServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        handler(req, res, body ? JSON.parse(body) : {});
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

test('OpenAI 호환 API 호출 - 정상 응답을 파싱한다', async () => {
  const server = await startOpenAIMockServer((req, res, parsedBody) => {
    assert.equal(req.url, '/chat/completions');
    assert.equal(req.headers.authorization, 'Bearer test-key-123');
    assert.equal(parsedBody.model, 'gpt-4o-mini');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: '분석 결과: 적합' } }] }));
  });
  const { port } = server.address();
  try {
    const reply = await callLLM(
      { provider: 'openai', apiKey: 'test-key-123', model: 'gpt-4o-mini', baseUrl: `http://127.0.0.1:${port}` },
      [{ role: 'user', content: '테스트' }],
    );
    assert.equal(reply, '분석 결과: 적합');
  } finally {
    await closeServer(server);
  }
});

test('Anthropic API 호출 - system 메시지를 분리하고 content[0].text를 파싱한다', async () => {
  const server = await startOpenAIMockServer((req, res, parsedBody) => {
    assert.equal(req.url, '/messages');
    assert.equal(req.headers['x-api-key'], 'anthropic-key');
    assert.equal(parsedBody.system, '너는 채용 분석가야');
    assert.equal(parsedBody.messages.length, 1);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ content: [{ text: 'Claude 분석 결과' }] }));
  });
  const { port } = server.address();
  try {
    const reply = await callLLM(
      { provider: 'anthropic', apiKey: 'anthropic-key', model: 'claude-3-5-sonnet', baseUrl: `http://127.0.0.1:${port}` },
      [
        { role: 'system', content: '너는 채용 분석가야' },
        { role: 'user', content: '분석해줘' },
      ],
    );
    assert.equal(reply, 'Claude 분석 결과');
  } finally {
    await closeServer(server);
  }
});

test('API 키가 없으면 네트워크 호출 없이 즉시 에러를 던진다', async () => {
  await assert.rejects(() => callLLM({ provider: 'openai', model: 'gpt-4o-mini' }, []), /API 키가 등록되어 있지 않습니다/);
});

test('HTTP 에러 응답이면 상태코드와 함께 에러를 던진다', async () => {
  const server = await startOpenAIMockServer((req, res) => {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'invalid api key' }));
  });
  const { port } = server.address();
  try {
    await assert.rejects(
      () => callLLM({ provider: 'openai', apiKey: 'bad-key', model: 'gpt-4o-mini', baseUrl: `http://127.0.0.1:${port}` }, [{ role: 'user', content: 'x' }]),
      /HTTP 401/,
    );
  } finally {
    await closeServer(server);
  }
});

test('testConnection은 성공 시 ok:true를 반환한다', async () => {
  const server = await startOpenAIMockServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }));
  });
  const { port } = server.address();
  try {
    const result = await testConnection({ provider: 'openai', apiKey: 'k', model: 'gpt-4o-mini', baseUrl: `http://127.0.0.1:${port}` });
    assert.equal(result.ok, true);
    assert.equal(result.reply, 'OK');
  } finally {
    await closeServer(server);
  }
});

test('testConnection은 실패 시 ok:false와 에러 메시지를 반환한다 (크래시 없음)', async () => {
  const result = await testConnection({ provider: 'openai', apiKey: '', model: 'gpt-4o-mini' });
  assert.equal(result.ok, false);
  assert.match(result.error, /API 키/);
});

test('resolveHost는 baseUrl이 없으면 provider 기본 호스트를 반환한다', () => {
  assert.equal(resolveHost({ provider: 'openai' }), 'api.openai.com');
  assert.equal(resolveHost({ provider: 'anthropic' }), 'api.anthropic.com');
});

test('resolveHost는 커스텀 baseUrl의 호스트를 반환한다 (openai-compatible 프록시 등)', () => {
  assert.equal(resolveHost({ provider: 'openai-compatible', baseUrl: 'https://my-proxy.internal:8443/v1' }), 'my-proxy.internal:8443');
});
