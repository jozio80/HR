'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const { buildResumeAnalysisMessages, parseAnalysisResponse } = require('../src/resumeAnalysis.js');
const settingsStore = require('../src/settingsStore.js');

// --- buildResumeAnalysisMessages ---

test('프롬프트에 마스킹된 이력서 텍스트만 포함되고 원본 개인정보는 없다', () => {
  const jd = { title: '백엔드 개발자', requiredSkills: ['Java'], preferredSkills: [], minYears: 3 };
  const resumeText = '홍길동 이력서\n연락처: hong@example.com / 010-1234-5678\nJava 5년 경력';
  const { messages, maskedFields } = buildResumeAnalysisMessages(jd, resumeText);
  const userMsg = messages.find((m) => m.role === 'user').content;
  assert.ok(!userMsg.includes('hong@example.com'));
  assert.ok(!userMsg.includes('010-1234-5678'));
  assert.ok(!userMsg.includes('홍길동'));
  assert.match(userMsg, /Java 5년 경력/);
  assert.deepEqual(maskedFields.sort(), ['email', 'name', 'phone']);
});

test('system 메시지는 JSON 형식 응답을 명시적으로 지시한다', () => {
  const { messages } = buildResumeAnalysisMessages({ title: 'X' }, '내용');
  const sys = messages.find((m) => m.role === 'system').content;
  assert.match(sys, /JSON/);
  assert.match(sys, /fitScore/);
});

test('JD 필드가 비어있어도 크래시 없이 프롬프트를 만든다', () => {
  const { messages } = buildResumeAnalysisMessages({}, '이력서 내용');
  assert.equal(messages.length, 2);
});

// --- parseAnalysisResponse ---

test('정상 JSON 응답을 파싱한다', () => {
  const raw = JSON.stringify({
    fitScore: 85,
    summary: '적합한 후보입니다.',
    strengths: ['Java 숙련'],
    concerns: ['클라우드 경험 부족'],
    recommendedQuestions: ['AWS 사용 경험은?'],
  });
  const result = parseAnalysisResponse(raw);
  assert.equal(result.fitScore, 85);
  assert.equal(result.summary, '적합한 후보입니다.');
  assert.deepEqual(result.strengths, ['Java 숙련']);
});

test('```json 코드블록으로 감싸진 응답도 파싱한다', () => {
  const raw = '```json\n{"fitScore": 70, "summary": "s", "strengths": [], "concerns": [], "recommendedQuestions": []}\n```';
  const result = parseAnalysisResponse(raw);
  assert.equal(result.fitScore, 70);
});

test('fitScore가 범위를 벗어나면 0-100으로 clamp한다', () => {
  const raw = JSON.stringify({ fitScore: 150, summary: '', strengths: [], concerns: [], recommendedQuestions: [] });
  assert.equal(parseAnalysisResponse(raw).fitScore, 100);
  const raw2 = JSON.stringify({ fitScore: -20, summary: '', strengths: [], concerns: [], recommendedQuestions: [] });
  assert.equal(parseAnalysisResponse(raw2).fitScore, 0);
});

test('fitScore가 숫자가 아니면 null로 처리한다 (크래시 없음)', () => {
  const raw = JSON.stringify({ fitScore: 'N/A', summary: 's' });
  const result = parseAnalysisResponse(raw);
  assert.equal(result.fitScore, null);
});

test('JSON이 아닌 응답은 명확한 에러를 던진다', () => {
  assert.throws(() => parseAnalysisResponse('이건 그냥 텍스트입니다'), /JSON으로 파싱하지 못했습니다/);
});

test('strengths가 배열이 아니면 빈 배열로 방어한다', () => {
  const raw = JSON.stringify({ fitScore: 50, summary: '', strengths: '문자열', concerns: null, recommendedQuestions: undefined });
  const result = parseAnalysisResponse(raw);
  assert.deepEqual(result.strengths, []);
  assert.deepEqual(result.concerns, []);
  assert.deepEqual(result.recommendedQuestions, []);
});

// --- settingsStore ---

async function tempSettingsPath() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'horong-settings-test-'));
  return path.join(dir, 'settings.json');
}

test('설정 파일이 없으면 기본값을 반환한다', async () => {
  const filePath = await tempSettingsPath();
  const settings = await settingsStore.readSettings(filePath);
  assert.equal(settings.llm.provider, 'openai');
  assert.equal(settings.llm.apiKey, '');
});

test('updateLLMSettings로 저장한 값이 readSettings로 다시 읽힌다', async () => {
  const filePath = await tempSettingsPath();
  await settingsStore.updateLLMSettings(filePath, { provider: 'anthropic', apiKey: 'sk-test', model: 'claude-3-5-sonnet' });
  const settings = await settingsStore.readSettings(filePath);
  assert.equal(settings.llm.provider, 'anthropic');
  assert.equal(settings.llm.apiKey, 'sk-test');
  assert.equal(settings.llm.model, 'claude-3-5-sonnet');
});

test('updateLLMSettings는 지정하지 않은 필드를 유지한다', async () => {
  const filePath = await tempSettingsPath();
  await settingsStore.updateLLMSettings(filePath, { apiKey: 'key1', model: 'model1' });
  await settingsStore.updateLLMSettings(filePath, { apiKey: 'key2' });
  const settings = await settingsStore.readSettings(filePath);
  assert.equal(settings.llm.apiKey, 'key2');
  assert.equal(settings.llm.model, 'model1');
});
