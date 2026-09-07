'use strict';

/**
 * 이력서 AI 분석용 프롬프트 구성 + LLM 응답 파싱. 순수 함수, 네트워크 호출 없음.
 * buildResumeAnalysisMessages는 반드시 piiMasking.maskPII를 거친 텍스트만 LLM에 보낸다 -
 * 이 파일이 "개인정보 마스킹 후 전송"이라는 보안 원칙을 강제하는 지점이다.
 */

const { maskPII } = require('./piiMasking');

function buildResumeAnalysisMessages(jd, resumeText) {
  const { maskedText, maskedFields } = maskPII(resumeText);

  const system = [
    '너는 채용 담당자를 돕는 이력서 분석 어시스턴트다.',
    '지원자의 개인정보(이름/연락처 등)는 이미 마스킹되어 전달된다. 마스킹된 부분을 추측하거나 복원하려 하지 마라.',
    '채용 조건과 이력서 내용을 비교해 적합도를 분석하고, 반드시 아래 JSON 형식으로만 답하라. JSON 외의 다른 텍스트(설명, 인사말, 코드블록 표시)는 절대 추가하지 마라.',
    '{"fitScore": 0-100 사이 정수, "summary": "2-3문장 요약", "strengths": ["강점1","강점2"], "concerns": ["우려사항1","우려사항2"], "recommendedQuestions": ["면접에서 확인하면 좋을 질문1","질문2"]}',
  ].join('\n');

  const user = [
    '[채용 조건]',
    `직무: ${jd.title || '미지정'}`,
    `필수 스킬: ${(jd.requiredSkills || []).join(', ') || '없음'}`,
    `우대 스킬: ${(jd.preferredSkills || []).join(', ') || '없음'}`,
    `최소 경력: ${jd.minYears !== null && jd.minYears !== undefined ? `${jd.minYears}년` : '무관'}`,
    '',
    '[이력서 내용 (개인정보는 마스킹 처리됨)]',
    maskedText,
  ].join('\n');

  return { messages: [{ role: 'system', content: system }, { role: 'user', content: user }], maskedFields };
}

function parseAnalysisResponse(raw) {
  const cleaned = (raw || '')
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/, '')
    .replace(/```\s*$/, '');
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`LLM 응답을 JSON으로 파싱하지 못했습니다: ${err.message}`);
  }
  const fitScore = Number(parsed.fitScore);
  return {
    fitScore: Number.isFinite(fitScore) ? Math.max(0, Math.min(100, Math.round(fitScore))) : null,
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths.filter((s) => typeof s === 'string') : [],
    concerns: Array.isArray(parsed.concerns) ? parsed.concerns.filter((s) => typeof s === 'string') : [],
    recommendedQuestions: Array.isArray(parsed.recommendedQuestions) ? parsed.recommendedQuestions.filter((s) => typeof s === 'string') : [],
  };
}

module.exports = { buildResumeAnalysisMessages, parseAnalysisResponse };
