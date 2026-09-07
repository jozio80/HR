'use strict';

/**
 * 이력서 텍스트를 LLM(외부 API)으로 보내기 전에 개인정보를 마스킹한다.
 * 순수 함수, 네트워크 호출 없음. LLM 분석 파이프라인에서 반드시 이 함수를 거쳐야 한다.
 *
 * 마스킹 대상: 이메일, 전화번호, 주민등록번호 패턴, 이름(추정), 주소(도로명 패턴 일부).
 * 100% 완벽한 PII 탐지는 불가능하지만(자유서술형 텍스트 특성상), 정형 패턴은 전부 잡고
 * 이름은 scoring.js의 extractName과 동일한 방식으로 찾아 치환한다.
 */

const { extractName } = require('./scoring');

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/g;
// 주민등록번호: 6자리-7자리 (뒷자리 첫 숫자 1-4 범위로 내국인/외국인 패턴만 느슨하게 매칭)
const RRN_RE = /\d{6}[-\s]?[1-4]\d{6}/g;
// 도로명주소 패턴(대략): "OO시/도 ... OO로/길 숫자"
const ADDRESS_RE = /[가-힣]{2,}(?:특별시|광역시|도|시)\s?[가-힣]{2,}(?:구|군|시)?\s?[가-힣0-9]{1,}(?:로|길)\s?\d{1,4}[가-힣0-9\-\s]{0,10}/g;

function maskPII(text, options = {}) {
  if (!text) return { maskedText: text || '', maskedFields: [] };

  let masked = text;
  const maskedFields = [];

  // 이름: 명시적 라벨/문서제목형만 안전하게 치환 (scoring.js의 extractName 재사용)
  const name = extractName(text);
  if (name) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nameRe = new RegExp(escaped, 'g');
    const before = masked;
    masked = masked.replace(nameRe, '[NAME]');
    if (masked !== before) maskedFields.push('name');
  }

  if (EMAIL_RE.test(masked)) {
    masked = masked.replace(EMAIL_RE, '[EMAIL]');
    maskedFields.push('email');
  }
  EMAIL_RE.lastIndex = 0;

  if (PHONE_RE.test(masked)) {
    masked = masked.replace(PHONE_RE, '[PHONE]');
    maskedFields.push('phone');
  }
  PHONE_RE.lastIndex = 0;

  if (RRN_RE.test(masked)) {
    masked = masked.replace(RRN_RE, '[RRN]');
    maskedFields.push('rrn');
  }
  RRN_RE.lastIndex = 0;

  if (!options.keepAddress && ADDRESS_RE.test(masked)) {
    masked = masked.replace(ADDRESS_RE, '[ADDRESS]');
    maskedFields.push('address');
  }
  ADDRESS_RE.lastIndex = 0;

  return { maskedText: masked, maskedFields: [...new Set(maskedFields)] };
}

/** 마스킹이 실제로 이메일/전화번호를 놓치지 않았는지 사후 검증한다 (전송 직전 최종 방어선). */
function verifyNoResidualPII(maskedText) {
  const leaks = [];
  if (EMAIL_RE.test(maskedText)) leaks.push('email');
  EMAIL_RE.lastIndex = 0;
  if (PHONE_RE.test(maskedText)) leaks.push('phone');
  PHONE_RE.lastIndex = 0;
  if (RRN_RE.test(maskedText)) leaks.push('rrn');
  RRN_RE.lastIndex = 0;
  return { clean: leaks.length === 0, leaks };
}

module.exports = { maskPII, verifyNoResidualPII };
