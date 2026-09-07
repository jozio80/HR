'use strict';

/**
 * 채용 포지션 정보를 바탕으로 온보딩 체크리스트를 생성한다. 순수 함수.
 * 입사전/첫날/첫주/첫달 4단계로 나누고, 직무명에 개발/엔지니어 관련 키워드가 있으면
 * 개발환경 세팅 항목을 추가한다 (규칙 기반, scoring.js와 동일한 방식).
 */

const DEV_TITLE_KEYWORDS = ['개발', '엔지니어', 'developer', 'engineer', '프로그래머'];

function isDevRole(title) {
  const t = (title || '').toLowerCase();
  return DEV_TITLE_KEYWORDS.some((kw) => t.includes(kw.toLowerCase()));
}

function generateOnboardingChecklist(jd) {
  const title = (jd && jd.title) || '';

  const beforeStart = [
    '근로계약서 서명 완료',
    '4대보험 취득 서류 접수',
    '급여계좌/신분증 사본 등 인사서류 수령',
    'PC/노트북 등 지급 장비 준비',
    '사내 이메일 계정 생성 요청',
    '좌석/사물함 배치',
  ];

  const firstDay = [
    '오리엔테이션 (회사 소개, 조직도, 사내 규정 안내)',
    '팀 소개 및 사수(멘토) 배정',
    '출입증/보안카드 발급',
    '장비 및 계정 전달, 로그인 확인',
    '점심 식사 등 팀원과의 자연스러운 인사 자리 마련',
  ];

  const firstWeek = [
    '주요 업무 툴 사용법 교육 (메신저, 협업툴, 결재시스템 등)',
    '담당 업무/프로젝트 온보딩 문서 전달',
    '매니저와 1:1 미팅 (역할 기대치 정렬)',
    '필요한 시스템 접근 권한 확인',
  ];

  const firstMonth = [
    '입사 30일 체크인 미팅 (적응 상황 점검)',
    '단기 목표 설정 (첫 분기 OKR/KPI 등)',
    '동료 피드백 수렴',
    '수습평가 일정 안내 (해당하는 경우)',
  ];

  if (isDevRole(title)) {
    beforeStart.push('개발 계정(Git/사내 저장소) 생성 요청');
    firstDay.push('개발 환경 세팅 (IDE, VPN, 로컬 빌드 확인)');
    firstWeek.push('코드 컨벤션/브랜치 전략 문서 전달, 첫 PR(또는 태스크) 배정');
  }

  return {
    title,
    stages: [
      { key: 'beforeStart', label: '입사 전', items: beforeStart },
      { key: 'firstDay', label: '첫날', items: firstDay },
      { key: 'firstWeek', label: '첫 주', items: firstWeek },
      { key: 'firstMonth', label: '첫 달', items: firstMonth },
    ],
  };
}

module.exports = { generateOnboardingChecklist };
