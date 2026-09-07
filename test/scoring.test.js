'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  scoreResume,
  rankResumes,
  extractYears,
  extractEducation,
  extractContact,
  extractName,
  findMatches,
} = require('../src/scoring.js');

test('모든 필수 스킬이 일치하면 높은 점수를 준다', () => {
  const jd = { requiredSkills: ['React', 'TypeScript'], preferredSkills: [], minYears: null };
  const text = '저는 React와 TypeScript를 활용해 5년간 프론트엔드 개발을 했습니다.';
  const r = scoreResume(jd, text);
  assert.equal(r.matchedRequired.length, 2);
  assert.equal(r.missingRequired.length, 0);
  assert.ok(r.score >= 95, `score should be near 100, got ${r.score}`);
});

test('일부 필수 스킬이 누락되면 점수와 missing 목록에 반영된다', () => {
  const jd = { requiredSkills: ['React', 'TypeScript', 'GraphQL'], preferredSkills: [], minYears: null };
  const text = 'React 경험이 있습니다.';
  const r = scoreResume(jd, text);
  assert.deepEqual(r.matchedRequired, ['React']);
  assert.deepEqual(r.missingRequired, ['TypeScript', 'GraphQL']);
  assert.ok(r.score < 50, `score should be low, got ${r.score}`);
});

test('명시적 "N년" 표현으로 경력을 추정한다', () => {
  const { years, source } = extractYears('저는 총 8년의 경력을 가진 백엔드 개발자입니다.');
  assert.equal(years, 8);
  assert.equal(source, 'explicit');
});

test('근무기간 범위(YYYY.MM ~ YYYY.MM)를 합산해 경력을 추정한다', () => {
  const now = new Date('2026-01-01');
  const text = '경력사항\n2016.03 ~ 2020.02 A회사\n2020.03 ~ 2024.02 B회사';
  const { years, source } = extractYears(text, now);
  assert.equal(source, 'date-range');
  assert.equal(years, 7.8);
});

test('"현재"로 끝나는 근무기간은 now 기준으로 계산한다', () => {
  const now = new Date('2026-06-01');
  const { years, source } = extractYears('2020.06 ~ 현재 재직중', now);
  assert.equal(source, 'date-range');
  assert.equal(years, 6);
});

test('경력 정보가 전혀 없으면 unknown을 반환한다', () => {
  const { years, source } = extractYears('안녕하세요 지원합니다.');
  assert.equal(years, null);
  assert.equal(source, 'unknown');
});

test('최소 연차를 충족하면 연차 가중치를 만점 반영한다', () => {
  const jd = { requiredSkills: [], preferredSkills: [], minYears: 3 };
  const text = '경력 5년차 개발자입니다.';
  const r = scoreResume(jd, text);
  assert.equal(r.breakdown.yearsScore, r.breakdown.weights.years);
});

test('최소 연차 미달이면 비례 감점한다', () => {
  const jd = { requiredSkills: [], preferredSkills: [], minYears: 10 };
  const text = '경력 5년차 개발자입니다.';
  const r = scoreResume(jd, text);
  assert.ok(r.breakdown.yearsScore < r.breakdown.weights.years);
  assert.ok(r.breakdown.yearsScore > 0);
});

test('학력은 최고 단계(석사 > 학사)를 인식한다', () => {
  const e = extractEducation('OO대학교 학사 졸업 후 OO대학원 석사 졸업');
  assert.equal(e.level, '석사');
});

test('"전문학사"는 "학사"로 오인식하지 않는다', () => {
  const e = extractEducation('OO대학교 전자공학과 전문학사 졸업');
  assert.equal(e.level, '전문학사');
});

test('이메일/전화번호를 추출한다', () => {
  const c = extractContact('연락처: hong@example.com / 010-1234-5678');
  assert.equal(c.email, 'hong@example.com');
  assert.equal(c.phone, '010-1234-5678');
});

test('연락처가 없으면 null을 반환한다', () => {
  const c = extractContact('연락처 정보 없음');
  assert.equal(c.email, null);
  assert.equal(c.phone, null);
});

test('JD 항목이 비어있어도 에러 없이 점수를 계산한다 (가중치 재분배)', () => {
  const jd = {};
  const r = scoreResume(jd, '아무 내용');
  assert.ok(typeof r.score === 'number');
  assert.ok(!Number.isNaN(r.score));
});

test('빈 이력서 텍스트도 크래시 없이 0점 처리한다', () => {
  const jd = { requiredSkills: ['React'], preferredSkills: [], minYears: 3 };
  const r = scoreResume(jd, '');
  assert.equal(r.matchedRequired.length, 0);
  assert.equal(r.score, 0);
});

test('rankResumes는 점수 내림차순으로 정렬한다', () => {
  const jd = { requiredSkills: ['React', 'Node.js'], preferredSkills: [], minYears: null };
  const resumes = [
    { fileName: 'low.txt', text: 'React만 압니다.' },
    { fileName: 'high.txt', text: 'React와 Node.js 둘 다 능숙합니다.' },
  ];
  const ranked = rankResumes(jd, resumes);
  assert.equal(ranked[0].fileName, 'high.txt');
  assert.equal(ranked[1].fileName, 'low.txt');
  assert.ok(ranked[0].score >= ranked[1].score);
});

test('findMatches는 대소문자를 무시하고 부분일치한다', () => {
  const { matched, missing } = findMatches('저는 REACT 전문가입니다', ['react', 'vue']);
  assert.deepEqual(matched, ['react']);
  assert.deepEqual(missing, ['vue']);
});

test('"성명: 홍길동" 명시적 라벨에서 이름을 추출한다', () => {
  assert.equal(extractName('성명: 홍길동\n연락처: 010-1234-5678'), '홍길동');
});

test('"이름 : 김철수" 첨줄도 처리한다', () => {
  assert.equal(extractName('이름 : 김철수'), '김철수');
});

test('"홍길동 이력서" 문서제목형에서 이름을 추출한다', () => {
  assert.equal(extractName('홍길동 이력서\n연락처: hong@example.com'), '홍길동');
});

test('영문 "John Kim Resume" 패턴에서 이름을 추출한다', () => {
  assert.equal(extractName('John Kim Resume\nEmail: john@example.com'), 'John Kim');
});

test('첫줄이 순수 2~4자 한글 단어하나뿐이면 이름으로 추정한다', () => {
  assert.equal(extractName('김철수\n경력사항\n...'), '김철수');
});

test('"개발자 이력서" 같이 직무명이 이름으로 오인식되지 않는다', () => {
  assert.equal(extractName('개발자 이력서\n이름: 박영희'), '박영희');
});

test('이름 단서를 못 찾으면 null을 반환한다', () => {
  assert.equal(extractName('안녕하세요 지원합니다. 저는 5년차 개발자입니다.'), null);
});

test('이름 정보가 scoreResume 반환값에 candidateName으로 포함된다', () => {
  const jd = { requiredSkills: [], preferredSkills: [], minYears: null };
  const r = scoreResume(jd, '성명: 이영희\n경력 3년차 디자이너입니다.');
  assert.equal(r.candidateName, '이영희');
});
