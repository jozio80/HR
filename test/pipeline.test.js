'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { generateInterviewQuestions } = require('../src/interviewQuestions.js');
const { generateOfferEmail, generateRejectionEmail } = require('../src/emailTemplates.js');
const { generateOnboardingChecklist } = require('../src/onboardingChecklist.js');

// --- interviewQuestions ---

test('필수 스킬마다 기술 질문이 하나씩 생성된다', () => {
  const jd = { title: '백엔드 개발자', requiredSkills: ['Java', 'Spring Boot'], preferredSkills: [], minYears: 3 };
  const r = generateInterviewQuestions(jd);
  assert.equal(r.technicalQuestions.length, 2);
  assert.ok(r.technicalQuestions[0].question.includes('Java'));
  assert.ok(Array.isArray(r.technicalQuestions[0].evaluationCriteria));
});

test('최소연차 5년 이상이면 리더십 질문이 추가된다', () => {
  const jd = { title: 'PM', requiredSkills: [], preferredSkills: [], minYears: 5 };
  const r = generateInterviewQuestions(jd);
  assert.ok(r.behavioralQuestions.some((q) => q.category === '리더십'));
});

test('최소연차 미지정이거나 5년 미만이면 리더십 질문이 없다', () => {
  const jd1 = { title: '주니어', requiredSkills: [], preferredSkills: [], minYears: 2 };
  const jd2 = { title: '주니어', requiredSkills: [], preferredSkills: [], minYears: null };
  assert.ok(!generateInterviewQuestions(jd1).behavioralQuestions.some((q) => q.category === '리더십'));
  assert.ok(!generateInterviewQuestions(jd2).behavioralQuestions.some((q) => q.category === '리더십'));
});

test('평가기준표(rubric) 가중치 합은 100이다', () => {
  const r = generateInterviewQuestions({ title: 'X', requiredSkills: [], preferredSkills: [], minYears: null });
  const total = r.rubric.reduce((sum, item) => sum + item.weight, 0);
  assert.equal(total, 100);
});

// --- emailTemplates ---

test('합격 메일에 지원자 이름과 직무가 들어간다', () => {
  const { subject, body } = generateOfferEmail({ candidateName: '홍길동', positionTitle: '백엔드 개발자', companyName: '호롱컴퍼니' });
  assert.match(subject, /백엔드 개발자/);
  assert.match(body, /홍길동님/);
  assert.match(body, /호롱컴퍼니/);
});

test('합격 메일에 입사예정일이 있으면 본문에 반영된다', () => {
  const { body } = generateOfferEmail({ candidateName: '홍길동', startDate: '2026-10-01' });
  assert.match(body, /2026-10-01/);
});

test('불합격 메일은 정중한 톤으로 회사명/직무가 들어간다', () => {
  const { subject, body } = generateRejectionEmail({ candidateName: '김철수', positionTitle: '프론트엔드 개발자', companyName: '호롱컴퍼니' });
  assert.match(subject, /프론트엔드 개발자/);
  assert.match(body, /김철수님/);
  assert.match(body, /감사/);
});

test('이름/회사명이 비어있어도 기본값으로 크래시 없이 생성된다', () => {
  const { body } = generateOfferEmail({});
  assert.match(body, /지원자님/);
});

// --- onboardingChecklist ---

test('일반 직무는 4단계 체크리스트를 생성한다', () => {
  const r = generateOnboardingChecklist({ title: '마케팅 매니저' });
  assert.equal(r.stages.length, 4);
  assert.ok(r.stages.every((s) => s.items.length > 0));
});

test('개발 직군이면 개발환경 세팅 항목이 추가된다', () => {
  const r = generateOnboardingChecklist({ title: '백엔드 개발자' });
  const firstDay = r.stages.find((s) => s.key === 'firstDay');
  assert.ok(firstDay.items.some((i) => i.includes('개발 환경')));
});

test('개발 직군이 아니면 개발환경 세팅 항목이 없다', () => {
  const r = generateOnboardingChecklist({ title: '인사 담당자' });
  const firstDay = r.stages.find((s) => s.key === 'firstDay');
  assert.ok(!firstDay.items.some((i) => i.includes('개발 환경')));
});
