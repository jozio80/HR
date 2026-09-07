'use strict';
window.HorongStore = {};

/**
 * "포지션"(채용건) 중심 로컬 데이터 저장소. JSON 파일 하나에 전부 저장한다
 * (SQLite 같은 네이티브 모듈을 피해서 배포 환경 이식성을 높임 - 데이터량도 개인 채용담당자
 * 수준이라 JSON으로 충분함). fs 기반 I/O 함수와, position 객체를 다루는 순수 함수를 분리해서
 * 순수 함수 쪽은 파일 없이도 단위 테스트가 가능하게 한다.
 */



const crypto = { randomUUID: () => 'id-' + Math.random().toString(36).slice(2) + Date.now() };

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


Object.assign(window.HorongStore, { newId, defaultChannels, createPositionObject, addCandidates, setCandidateStage, setCandidateNote, setInterviewResult, editPositionFields, updateSourcing, setInterviewQuestions, setOnboardingChecklist, toggleOnboardingItem, VALID_STAGES });
