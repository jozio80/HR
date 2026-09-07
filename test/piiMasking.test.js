'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { maskPII, verifyNoResidualPII } = require('../src/piiMasking.js');

test('이메일을 [EMAIL]로 마스킹한다', () => {
  const { maskedText, maskedFields } = maskPII('연락처: hong@example.com 입니다.');
  assert.ok(!maskedText.includes('hong@example.com'));
  assert.match(maskedText, /\[EMAIL\]/);
  assert.ok(maskedFields.includes('email'));
});

test('전화번호를 [PHONE]으로 마스킹한다', () => {
  const { maskedText, maskedFields } = maskPII('연락처: 010-1234-5678');
  assert.ok(!maskedText.includes('010-1234-5678'));
  assert.match(maskedText, /\[PHONE\]/);
  assert.ok(maskedFields.includes('phone'));
});

test('구분자 없는 전화번호도 마스킹한다', () => {
  const { maskedText } = maskPII('010 1234 5678로 연락주세요');
  assert.match(maskedText, /\[PHONE\]/);
});

test('주민등록번호 패턴을 마스킹한다', () => {
  const { maskedText, maskedFields } = maskPII('생년월일 900101-1234567');
  assert.match(maskedText, /\[RRN\]/);
  assert.ok(maskedFields.includes('rrn'));
});

test('문서제목형 이름을 마스킹한다 ("홍길동 이력서" 패턴)', () => {
  const { maskedText, maskedFields } = maskPII('홍길동 이력서\n경력사항: 홍길동은 5년간 근무');
  assert.ok(!maskedText.includes('홍길동'));
  assert.match(maskedText, /\[NAME\]/);
  assert.ok(maskedFields.includes('name'));
});

test('이름 단서가 없으면 name 필드는 마스킹하지 않는다', () => {
  const { maskedFields } = maskPII('경력사항: 5년간 백엔드 개발');
  assert.ok(!maskedFields.includes('name'));
});

test('기술 스택 등 일반 텍스트는 그대로 보존한다', () => {
  const { maskedText } = maskPII('Java, Spring Boot, MySQL 활용 경험');
  assert.match(maskedText, /Java, Spring Boot, MySQL 활용 경험/);
});

test('여러 PII가 섞여 있어도 전부 마스킹한다', () => {
  const text = '홍길동 이력서\n연락처: hong@example.com / 010-1234-5678\n주민번호 900101-1234567';
  const { maskedText, maskedFields } = maskPII(text);
  assert.deepEqual(maskedFields.sort(), ['email', 'name', 'phone', 'rrn']);
  const check = verifyNoResidualPII(maskedText);
  assert.ok(check.clean, `잔여 PII 발견: ${check.leaks.join(', ')}`);
});

test('verifyNoResidualPII는 마스킹 누락 시 leaks를 보고한다', () => {
  const check = verifyNoResidualPII('연락처: hong@example.com');
  assert.equal(check.clean, false);
  assert.ok(check.leaks.includes('email'));
});

test('빈 텍스트는 크래시 없이 처리된다', () => {
  const { maskedText, maskedFields } = maskPII('');
  assert.equal(maskedText, '');
  assert.deepEqual(maskedFields, []);
});

test('같은 이메일이 여러 번 등장해도 전부 마스킹한다', () => {
  const { maskedText } = maskPII('연락처1: a@test.com, 연락처2: a@test.com');
  assert.ok(!maskedText.includes('a@test.com'));
  assert.equal((maskedText.match(/\[EMAIL\]/g) || []).length, 2);
});
