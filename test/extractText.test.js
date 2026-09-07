'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { extractFromFile } = require('../src/extractText.js');
const { scoreResume } = require('../src/scoring.js');

const fixture = (name) => path.join(__dirname, 'fixtures', name);

test('실제 PDF 이력서에서 텍스트를 추출하고 정상 채점된다', async () => {
  const { fileName, text } = await extractFromFile(fixture('sample-resume-hong.pdf'));
  assert.equal(fileName, 'sample-resume-hong.pdf');
  assert.match(text, /홍길동/);
  assert.match(text, /Java/);

  const jd = { requiredSkills: ['Java', 'Spring Boot'], preferredSkills: ['AWS'], minYears: 3 };
  const r = scoreResume(jd, text, { fileName });
  assert.equal(r.candidateName, '홍길동');
  assert.ok(r.score > 80, `PDF 이력서 점수가 예상보다 낮음: ${r.score}`);
});

test('실제 DOCX 이력서에서 텍스트를 추출하고 정상 채점된다 (mammoth)', async () => {
  const { fileName, text } = await extractFromFile(fixture('sample-resume-lee.docx'));
  assert.equal(fileName, 'sample-resume-lee.docx');
  assert.match(text, /이영희/);
  assert.match(text, /React/);

  const jd = { requiredSkills: ['React', 'TypeScript'], preferredSkills: ['GraphQL'], minYears: 3 };
  const r = scoreResume(jd, text, { fileName });
  assert.equal(r.candidateName, '이영희');
  assert.equal(r.matchedRequired.length, 2);
  assert.ok(r.score > 80, `DOCX 이력서 점수가 예상보다 낮음: ${r.score}`);
});

test('TXT 이력서도 동일 파이프라인으로 처리된다', async () => {
  const { fileName, text } = await extractFromFile(fixture('sample-resume-kim.txt'));
  assert.equal(fileName, 'sample-resume-kim.txt');
  const jd = { requiredSkills: ['Java'], preferredSkills: [], minYears: null };
  const r = scoreResume(jd, text, { fileName });
  assert.equal(r.candidateName, '김철수');
});

test('지원하지 않는 확장자는 명확한 에러를 던진다', async () => {
  await assert.rejects(
    () => extractFromFile(fixture('sample-resume-hong.pdf').replace('.pdf', '.hwp')),
    /지원하지 않는|ENOENT/,
  );
});
