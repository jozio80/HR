'use strict';
window.HorongInterview = {};

/**
 * 채용 조건(JD)을 기반으로 구조화 면접 질문지 + 평가기준표를 생성한다.
 * 네트워크 호출 없음, 순수 함수. 서류스크리닝에서 쓰는 것과 동일한 JD 입력(직무/필수·우대스킬/최소연차)을
 * 재사용해서, 스크리닝 통과자를 바로 면접 단계로 이어지게 한다.
 */

function generateInterviewQuestions(jd) {
  const title = (jd && jd.title) || '';
  const requiredSkills = (jd && jd.requiredSkills) || [];
  const preferredSkills = (jd && jd.preferredSkills) || [];
  const minYears = jd && typeof jd.minYears === 'number' ? jd.minYears : null;

  const technicalQuestions = requiredSkills.map((skill) => ({
    skill,
    question: `${skill}을(를) 실무 프로젝트에서 사용한 구체적인 경험을 설명해주세요.`,
    followUp: `${skill} 사용 중 겪었던 가장 어려운 문제와 해결 방법은 무엇이었나요?`,
    evaluationCriteria: ['구체적인 프로젝트 사례 제시 여부', '기술 원리에 대한 이해도', '문제 해결 과정의 논리성'],
  }));

  const preferredQuestions = preferredSkills.map((skill) => ({
    skill,
    question: `${skill} 관련 경험이나 학습 이력이 있다면 설명해주세요.`,
    evaluationCriteria: ['실무 적용 가능한 수준인지', '학습 의지와 태도'],
  }));

  const behavioralQuestions = [
    {
      category: '문제해결',
      question: '최근 진행한 프로젝트에서 가장 어려웠던 문제와 해결 과정을 설명해주세요.',
      evaluationCriteria: ['문제 정의 능력', '해결 과정의 논리성', '결과 검증 여부'],
    },
    {
      category: '협업',
      question: '팀원과 의견 차이가 있었던 경험과 이를 어떻게 조율했는지 말씀해주세요.',
      evaluationCriteria: ['갈등 해결 방식', '커뮤니케이션 태도'],
    },
    {
      category: '성장',
      question: '실패했던 경험과 그로부터 배운 점을 설명해주세요.',
      evaluationCriteria: ['자기성찰 능력', '개선 행동으로 이어졌는지'],
    },
    {
      category: '동기',
      question: `${title ? `'${title}'` : '이 직무'}에 지원한 이유와 본인의 강점을 연결지어 설명해주세요.`,
      evaluationCriteria: ['직무 이해도', '지원 동기의 진정성'],
    },
  ];

  if (minYears !== null && minYears >= 5) {
    behavioralQuestions.push({
      category: '리더십',
      question: '후배나 동료를 멘토링하거나 팀/프로젝트를 리드했던 경험이 있다면 설명해주세요.',
      evaluationCriteria: ['리더십 경험의 구체성', '팀 성과에 대한 기여도'],
    });
  }

  const rubric = [
    { item: '기술 역량', weight: 40 },
    { item: '문제 해결력', weight: 25 },
    { item: '커뮤니케이션', weight: 15 },
    { item: '컬처핏 / 동기', weight: 20 },
  ];

  return { title, technicalQuestions, preferredQuestions, behavioralQuestions, rubric };
}

Object.assign(window.HorongInterview, { generateInterviewQuestions });
