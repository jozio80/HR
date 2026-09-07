'use strict';
window.HorongEmail = {};

/**
 * 합격/불합격 통보 메일 초안을 생성한다. 순수 함수, 발송 기능은 없음
 * (메일 발송을 하려면 회사 메일 시스템과 네트워크 연동이 필요한데, 이 앱의
 * "네트워크 완전 차단" 원칙과 충돌하므로 의도적으로 텍스트 생성까지만 한다).
 */

function fallback(value, alt) {
  return value && String(value).trim() ? String(value).trim() : alt;
}

function generateOfferEmail({ candidateName, positionTitle, companyName, startDate, extraNote } = {}) {
  const name = fallback(candidateName, '지원자');
  const company = fallback(companyName, '저희 회사');
  const title = fallback(positionTitle, '해당 포지션');
  const subject = `[${company}] ${title} 최종 합격 안내드립니다`;

  const lines = [
    `${name}님, 안녕하세요.`,
    '',
    `${company} ${title} 포지션에 최종 합격하셨음을 안내드립니다. 진심으로 축하드립니다.`,
    '',
    startDate ? `입사 예정일은 ${startDate}로 안내드리며, 상세 일정은 별도로 안내드리겠습니다.` : '입사 일정은 협의 후 별도로 안내드리겠습니다.',
    '',
    '처우 및 근로조건 관련 상세 내용은 개별 안내드릴 예정이며, 궁금하신 점이 있으시면 언제든 편하게 문의해주세요.',
  ];
  if (extraNote) lines.push('', extraNote);
  lines.push('', '다시 한번 축하드리며, 함께하게 되어 기쁩니다.', '', `${company} 드림`);

  return { subject, body: lines.join('\n') };
}

function generateRejectionEmail({ candidateName, positionTitle, companyName, extraNote } = {}) {
  const name = fallback(candidateName, '지원자');
  const company = fallback(companyName, '저희 회사');
  const title = fallback(positionTitle, '해당 포지션');
  const subject = `[${company}] ${title} 지원 결과 안내드립니다`;

  const lines = [
    `${name}님, 안녕하세요.`,
    '',
    `${company} ${title} 포지션에 지원해주셔서 진심으로 감사드립니다.`,
    '',
    '신중히 검토한 결과, 이번 채용에서는 함께하지 못하게 되었음을 안내드리게 되어 아쉬운 마음을 전합니다.',
    '',
    '귀한 시간을 내어 지원해주신 점 다시 한번 감사드리며, 앞으로 좋은 기회로 다시 뵙기를 바랍니다.',
  ];
  if (extraNote) lines.push('', extraNote);
  lines.push('', '건승을 기원합니다.', '', `${company} 드림`);

  return { subject, body: lines.join('\n') };
}

Object.assign(window.HorongEmail, { generateOfferEmail, generateRejectionEmail });
