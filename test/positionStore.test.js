'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const store = require('../src/positionStore.js');

async function tempDbPath() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'horong-test-'));
  return path.join(dir, 'positions.json');
}

// --- 순수 함수 ---

test('createPositionObject는 기본 소싱 채널 5개를 포함한다', () => {
  const p = store.createPositionObject({ title: '백엔드 개발자', requiredSkills: ['Java'], preferredSkills: [], minYears: 3 });
  assert.equal(p.sourcing.channels.length, 5);
  assert.equal(p.candidates.length, 0);
  assert.equal(p.interview.questions, null);
});

test('addCandidates는 파일명 기준 중복을 건너뛴다', () => {
  let p = store.createPositionObject({ title: 'X' });
  p = store.addCandidates(p, [{ fileName: 'a.pdf', score: 80 }, { fileName: 'b.pdf', score: 60 }]);
  p = store.addCandidates(p, [{ fileName: 'a.pdf', score: 80 }, { fileName: 'c.pdf', score: 90 }]);
  assert.equal(p.candidates.length, 3);
  assert.deepEqual(p.candidates.map((c) => c.fileName).sort(), ['a.pdf', 'b.pdf', 'c.pdf']);
});

test('addCandidates는 점수 내림차순으로 정렬한다', () => {
  let p = store.createPositionObject({ title: 'X' });
  p = store.addCandidates(p, [{ fileName: 'low.pdf', score: 20 }, { fileName: 'high.pdf', score: 90 }]);
  assert.equal(p.candidates[0].fileName, 'high.pdf');
});

test('setCandidateStage는 잘못된 단계값에 에러를 던진다', () => {
  let p = store.createPositionObject({ title: 'X' });
  p = store.addCandidates(p, [{ fileName: 'a.pdf', score: 80 }]);
  assert.throws(() => store.setCandidateStage(p, p.candidates[0].id, 'invalid-stage'));
});

test('setCandidateStage/setCandidateNote/setInterviewResult가 해당 후보만 수정한다', () => {
  let p = store.createPositionObject({ title: 'X' });
  p = store.addCandidates(p, [{ fileName: 'a.pdf', score: 80 }, { fileName: 'b.pdf', score: 70 }]);
  const [a, b] = p.candidates;
  p = store.setCandidateStage(p, a.id, 'interview');
  p = store.setCandidateNote(p, a.id, '1차 통화함');
  p = store.setInterviewResult(p, a.id, { result: 'pass', comment: '좋음' });
  const updatedA = p.candidates.find((c) => c.id === a.id);
  const updatedB = p.candidates.find((c) => c.id === b.id);
  assert.equal(updatedA.stage, 'interview');
  assert.equal(updatedA.notes, '1차 통화함');
  assert.equal(updatedA.interviewResult.result, 'pass');
  assert.equal(updatedB.stage, 'screening');
  assert.equal(updatedB.notes, '');
});

test('editPositionFields는 JD 필드만 교체하고 나머지는 유지한다', () => {
  let p = store.createPositionObject({ title: '구버전', requiredSkills: ['Java'], preferredSkills: [], minYears: 3 });
  p = store.addCandidates(p, [{ fileName: 'a.pdf', score: 80 }]);
  const edited = store.editPositionFields(p, { title: '신버전', requiredSkills: ['Python'] });
  assert.equal(edited.title, '신버전');
  assert.deepEqual(edited.requiredSkills, ['Python']);
  assert.equal(edited.candidates.length, 1); // 지원자 데이터는 그대로
  assert.equal(edited.minYears, 3); // 안 건드린 필드는 유지
});

test('setCandidateAnalysis는 해당 후보자에만 AI 분석 결과를 저장한다', () => {
  let p = store.createPositionObject({ title: 'X' });
  p = store.addCandidates(p, [{ fileName: 'a.pdf', score: 80 }, { fileName: 'b.pdf', score: 70 }]);
  const [a, b] = p.candidates;
  p = store.setCandidateAnalysis(p, a.id, { fitScore: 90, summary: '적합' });
  const updatedA = p.candidates.find((c) => c.id === a.id);
  const updatedB = p.candidates.find((c) => c.id === b.id);
  assert.equal(updatedA.aiAnalysis.fitScore, 90);
  assert.equal(updatedB.aiAnalysis, undefined);
});

test('toggleOnboardingItem은 체크/언체크를 토글한다', () => {
  let p = store.createPositionObject({ title: 'X' });
  p = store.toggleOnboardingItem(p, 'firstDay:0');
  assert.deepEqual(p.onboarding.checkedItems, ['firstDay:0']);
  p = store.toggleOnboardingItem(p, 'firstDay:0');
  assert.deepEqual(p.onboarding.checkedItems, []);
});

// --- 파일 I/O ---

test('createPosition -> listPositions -> getPosition 왕복 확인', async () => {
  const dbPath = await tempDbPath();
  const created = await store.createPosition(dbPath, { title: '프론트엔드 개발자', requiredSkills: ['React'], preferredSkills: [], minYears: 2 });
  const list = await store.listPositions(dbPath);
  assert.equal(list.length, 1);
  assert.equal(list[0].id, created.id);
  assert.equal(list[0].candidateCount, 0);

  const fetched = await store.getPosition(dbPath, created.id);
  assert.equal(fetched.title, '프론트엔드 개발자');
});

test('updatePosition은 patchFn 결과를 저장하고 updatedAt을 갱신한다', async () => {
  const dbPath = await tempDbPath();
  const created = await store.createPosition(dbPath, { title: 'X' });
  await new Promise((r) => setTimeout(r, 5));
  const updated = await store.updatePosition(dbPath, created.id, (p) => store.addCandidates(p, [{ fileName: 'a.pdf', score: 50 }]));
  assert.equal(updated.candidates.length, 1);
  assert.notEqual(updated.updatedAt, created.updatedAt);
});

test('updatePosition은 존재하지 않는 id면 에러를 던진다', async () => {
  const dbPath = await tempDbPath();
  await assert.rejects(() => store.updatePosition(dbPath, 'no-such-id', (p) => p));
});

test('deletePosition 후에는 목록에서 사라진다', async () => {
  const dbPath = await tempDbPath();
  const created = await store.createPosition(dbPath, { title: 'X' });
  await store.deletePosition(dbPath, created.id);
  const list = await store.listPositions(dbPath);
  assert.equal(list.length, 0);
});

test('listPositions는 최근 수정순으로 정렬한다', async () => {
  const dbPath = await tempDbPath();
  const p1 = await store.createPosition(dbPath, { title: '먼저생성' });
  await new Promise((r) => setTimeout(r, 5));
  const p2 = await store.createPosition(dbPath, { title: '나중생성' });
  await new Promise((r) => setTimeout(r, 5));
  await store.updatePosition(dbPath, p1.id, (p) => p); // p1을 마지막에 갱신해서 다시 최신으로 만듦
  const list = await store.listPositions(dbPath);
  assert.equal(list[0].id, p1.id); // p1이 가장 최근에 갱신됐으니 맨 위
  assert.equal(list[1].id, p2.id);
});

test('readDb는 파일이 없으면 빈 positions 배열을 반환한다', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'horong-test-'));
  const db = await store.readDb(path.join(dir, 'nonexistent.json'));
  assert.deepEqual(db, { positions: [] });
});
