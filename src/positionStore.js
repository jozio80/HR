'use strict';

/**
 * "포지션"(채용건) 중심 로컬 데이터 저장소. JSON 파일 하나에 전부 저장한다
 * (SQLite 같은 네이티브 모듈을 피해서 배포 환경 이식성을 높임 - 데이터량도 개인 채용담당자
 * 수준이라 JSON으로 충분함). fs 기반 I/O 함수와, position 객체를 다루는 순수 함수를 분리해서
 * 순수 함수 쪽은 파일 없이도 단위 테스트가 가능하게 한다.
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

function newId() {
  return crypto.randomUUID();
}

function defaultChannels() {
  return ['사람인', '잡코리아', '원티드', '링크드인', '로켓펀치'].map((name) => ({ name, posted: false, url: '' }));
}

// --- 순수 함수 (position 객체를 받아 변형된 새 객체를 돌려줌, I/O 없음) ---

function createPositionObject({ title, requiredSkills, preferredSkills, minYears }) {
  const now = new Date().toISOString();
  return {
    id: newId(),
    title: title || '',
    requiredSkills: requiredSkills || [],
    preferredSkills: preferredSkills || [],
    minYears: typeof minYears === 'number' ? minYears : null,
    createdAt: now,
    updatedAt: now,
    sourcing: { channels: defaultChannels(), notes: '' },
    candidates: [],
    interview: { questions: null },
    onboarding: { checklist: null, checkedItems: [] },
  };
}

/** 채점된 이력서(rankResumes 결과)를 포지션에 추가한다. 파일명 기준 중복은 건너뛴다. */
function addCandidates(position, scoredCandidates) {
  const existing = new Set(position.candidates.map((c) => c.fileName));
  const additions = (scoredCandidates || [])
    .filter((c) => !existing.has(c.fileName))
    .map((c) => ({ ...c, id: newId(), stage: 'screening', notes: '', interviewResult: null }));
  const merged = [...position.candidates, ...additions].sort((a, b) => b.score - a.score);
  return { ...position, candidates: merged };
}

const VALID_STAGES = ['screening', 'interview', 'offer', 'rejected', 'hired'];

function setCandidateStage(position, candidateId, stage) {
  if (!VALID_STAGES.includes(stage)) throw new Error(`잘못된 단계: ${stage}`);
  const candidates = position.candidates.map((c) => (c.id === candidateId ? { ...c, stage } : c));
  return { ...position, candidates };
}

function setCandidateNote(position, candidateId, notes) {
  const candidates = position.candidates.map((c) => (c.id === candidateId ? { ...c, notes } : c));
  return { ...position, candidates };
}

function setInterviewResult(position, candidateId, result) {
  const candidates = position.candidates.map((c) => (c.id === candidateId ? { ...c, interviewResult: result } : c));
  return { ...position, candidates };
}

/** LLM 기반 이력서 AI 분석 결과를 후보자에 저장한다. */
function setCandidateAnalysis(position, candidateId, analysis) {
  const candidates = position.candidates.map((c) => (c.id === candidateId ? { ...c, aiAnalysis: analysis } : c));
  return { ...position, candidates };
}

/** JD 핵심 필드(직무명/필수·우대스킬/최소연차)만 교체한다. 나머지(소싱/지원자/면접/온보딩)는 그대로 유지. */
function editPositionFields(position, fields) {
  return {
    ...position,
    title: fields.title !== undefined ? fields.title : position.title,
    requiredSkills: fields.requiredSkills !== undefined ? fields.requiredSkills : position.requiredSkills,
    preferredSkills: fields.preferredSkills !== undefined ? fields.preferredSkills : position.preferredSkills,
    minYears: fields.minYears !== undefined ? fields.minYears : position.minYears,
  };
}

function updateSourcing(position, { channels, notes }) {
  return {
    ...position,
    sourcing: {
      channels: channels || position.sourcing.channels,
      notes: notes !== undefined ? notes : position.sourcing.notes,
    },
  };
}

function setInterviewQuestions(position, questions) {
  return { ...position, interview: { ...position.interview, questions } };
}

function setOnboardingChecklist(position, checklist) {
  return { ...position, onboarding: { ...position.onboarding, checklist, checkedItems: [] } };
}

function toggleOnboardingItem(position, itemKey) {
  const set = new Set(position.onboarding.checkedItems || []);
  if (set.has(itemKey)) set.delete(itemKey);
  else set.add(itemKey);
  return { ...position, onboarding: { ...position.onboarding, checkedItems: Array.from(set) } };
}

// --- 파일 I/O ---

async function readDb(dbFilePath) {
  try {
    const raw = await fs.readFile(dbFilePath, 'utf-8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data.positions)) return { positions: [] };
    return data;
  } catch (err) {
    if (err.code === 'ENOENT') return { positions: [] };
    throw err;
  }
}

async function writeDb(dbFilePath, data) {
  await fs.mkdir(path.dirname(dbFilePath), { recursive: true });
  await fs.writeFile(dbFilePath, JSON.stringify(data, null, 2), 'utf-8');
}

async function listPositions(dbFilePath) {
  const db = await readDb(dbFilePath);
  return db.positions
    .slice()
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .map((p) => ({ id: p.id, title: p.title, candidateCount: p.candidates.length, updatedAt: p.updatedAt }));
}

async function getPosition(dbFilePath, id) {
  const db = await readDb(dbFilePath);
  return db.positions.find((p) => p.id === id) || null;
}

async function createPosition(dbFilePath, fields) {
  const db = await readDb(dbFilePath);
  const pos = createPositionObject(fields);
  db.positions.push(pos);
  await writeDb(dbFilePath, db);
  return pos;
}

/** patchFn(position) => new position 형태의 순수 함수를 받아 저장까지 처리한다. */
async function updatePosition(dbFilePath, id, patchFn) {
  const db = await readDb(dbFilePath);
  const idx = db.positions.findIndex((p) => p.id === id);
  if (idx === -1) throw new Error(`포지션을 찾을 수 없습니다: ${id}`);
  const updated = { ...patchFn(db.positions[idx]), updatedAt: new Date().toISOString() };
  db.positions[idx] = updated;
  await writeDb(dbFilePath, db);
  return updated;
}

async function deletePosition(dbFilePath, id) {
  const db = await readDb(dbFilePath);
  db.positions = db.positions.filter((p) => p.id !== id);
  await writeDb(dbFilePath, db);
}

module.exports = {
  newId,
  defaultChannels,
  createPositionObject,
  addCandidates,
  setCandidateStage,
  setCandidateNote,
  setInterviewResult,
  setCandidateAnalysis,
  editPositionFields,
  updateSourcing,
  setInterviewQuestions,
  setOnboardingChecklist,
  toggleOnboardingItem,
  readDb,
  writeDb,
  listPositions,
  getPosition,
  createPosition,
  updatePosition,
  deletePosition,
  VALID_STAGES,
};
