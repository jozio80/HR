'use strict';

/** 앱 전역 설정(LLM 연결 정보 등)을 로컬 JSON 파일에 저장한다. positionStore.js와 동일한 패턴. */

const fs = require('node:fs/promises');
const path = require('node:path');

const DEFAULT_SETTINGS = {
  llm: { provider: 'openai', apiKey: '', baseUrl: '', model: 'gpt-4o-mini' },
};

async function readSettings(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed, llm: { ...DEFAULT_SETTINGS.llm, ...(parsed.llm || {}) } };
  } catch (err) {
    if (err.code === 'ENOENT') return { ...DEFAULT_SETTINGS, llm: { ...DEFAULT_SETTINGS.llm } };
    throw err;
  }
}

async function writeSettings(filePath, settings) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(settings, null, 2), 'utf-8');
}

async function updateLLMSettings(filePath, llmFields) {
  const current = await readSettings(filePath);
  const updated = { ...current, llm: { ...current.llm, ...llmFields } };
  await writeSettings(filePath, updated);
  return updated;
}

module.exports = { DEFAULT_SETTINGS, readSettings, writeSettings, updateLLMSettings };
