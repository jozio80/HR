'use strict';
window.HorongScoring = {};

/**
 * 호롱랩스 이력서 스크리너 - 순수 로직 모듈
 *
 * 원칙: 이 파일은 네트워크 호출을 절대 하지 않는다 (fetch/axios/http 금지).
 * 이력서 원문은 함수 인자로만 들어오고, 반환값 밖으로(디스크/네트워크) 나가지 않는다.
 * 채점은 규칙 기반(키워드 매칭 + 경력 연차 추정)으로, 왜 이 점수가 나왔는지
 * 매칭/누락 키워드로 100% 설명 가능해야 한다 (AI 채용 스크리닝의 편향 이슈를 피하기 위함).
 */

const EDUCATION_LEVELS = [
  { key: '박사', rank: 5, patterns: ['박사', 'phd', 'ph.d'] },
  { key: '석사', rank: 4, patterns: ['석사', '대학원 졸업', 'master'] },
  { key: '학사', rank: 3, patterns: ['학사', '대학교 졸업', '4년제', 'bachelor'] },
  { key: '전문학사', rank: 2, patterns: ['전문학사', '전문대', '2년제', '3년제'] },
  { key: '고졸', rank: 1, patterns: ['고등학교 졸업', '고졸'] },
];

function normalize(text) {
  return (text || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// 이름으로 오인하기 쉬운 직무/문서 단어 ("OO개발자 이력서" 같은 거짓양성 방지용 블록리스트)
const NAME_BLOCKLIST = new Set([
  '개발자', '디자이너', '기획자', '마케터', '엔지니어', '매니저', '팀장', '대리', '과장', '부장',
  '사원', '인턴', '신입', '경력', '지원자', '이력서', '자기소개서', '지원서', '포트폴리오',
  '백엔드', '프론트엔드', '총무', '영업', '상담', '생산', '품질',
]);

function cleanNameCandidate(raw) {
  const v = (raw || '').trim().replace(/\s+/g, ' ');
  if (!v || NAME_BLOCKLIST.has(v)) return null;
  return v;
}

/**
 * 이력서 텍스트에서 지원자 이름을 추정한다 (휴리스틱, 100% 확신 아님).
 * 우선순위: 1) "성명: 홍길동" 같은 명시적 라벨 2) "홍길동 이력서" 같은 문서제목형
 * 3) 영문 "John Kim Resume" 형 4) 첨줄이 순수 2~4자 한글 단어 하나뿐인 경우.
 * 이름이 아님 가능성이 높은 직무/문서 단어는 NAME_BLOCKLIST로 거러낸다.
 */
function extractName(text) {
  const raw = (text || '').trim();
  if (!raw) return null;

  const labelMatch = raw.match(/(?:성\s*명|이\s*름|지원자|성함|Name)\s*[:：]\s*([가-힣]{2,4}|[A-Za-z][A-Za-z .]{1,20})/);
  if (labelMatch) {
    const cleaned = cleanNameCandidate(labelMatch[1]);
    if (cleaned) return cleaned;
  }

  const titleMatch = raw.match(/^\s*([가-힣]{2,4})\s*[_\-(]?\s*(?:이력서|자기소개서|지원서|Resume|CV)/mi);
  if (titleMatch) {
    const cleaned = cleanNameCandidate(titleMatch[1]);
    if (cleaned) return cleaned;
  }

  const enTitleMatch = raw.match(/^\s*([A-Z][a-zA-Z]+\s[A-Z][a-zA-Z]+)\s*[_\-]?\s*(?:Resume|CV)\b/m);
  if (enTitleMatch) {
    const cleaned = cleanNameCandidate(enTitleMatch[1]);
    if (cleaned) return cleaned;
  }

  const firstLine = raw.split('\n').map((s) => s.trim()).find(Boolean);
  if (firstLine && /^[가-힣]{2,4}$/.test(firstLine)) {
    const cleaned = cleanNameCandidate(firstLine);
    if (cleaned) return cleaned;
  }

  return null;
}

/** 이력서 텍스트에서 이메일/전화번호를 추출한다 (로컬 표시용, 저장/전송하지 않음). */
function extractContact(text) {
  const t = text || '';
  const emailMatch = t.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const phoneMatch = t.match(/01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/);
  return {
    email: emailMatch ? emailMatch[0] : null,
    phone: phoneMatch ? phoneMatch[0].replace(/[.\s]/g, '-') : null,
  };
}

/**
 * 경력 연차를 추정한다. 두 가지 방법을 시도한다:
 * 1) "총 8년", "8년차", "경력 8년" 같은 명시적 표현
 * 2) "2016.03 ~ 2024.05", "2016-03 ~ 현재" 같은 근무기간 범위 합산
 * 둘 다 발견되면 더 큰 값을 신뢰 구간 상단으로, 명시적 표현을 우선한다.
 */
function extractYears(text, now = new Date()) {
  const t = text || '';

  const explicit = t.match(/(?:총\s*경력|경력)?\s*(\d{1,2})\s*년\s*(?:차|간)?/g);
  let explicitMax = null;
  if (explicit) {
    for (const m of explicit) {
      const num = parseInt(m.match(/(\d{1,2})/)[1], 10);
      if (num > 0 && num <= 50) {
        explicitMax = explicitMax === null ? num : Math.max(explicitMax, num);
      }
    }
  }

  const rangePattern = /(\d{4})[.\-\/](\d{1,2})\s*[~\-–]\s*(?:(\d{4})[.\-\/](\d{1,2})|현재|재직중|present)/gi;
  let totalMonths = 0;
  let rangeCount = 0;
  let m;
  while ((m = rangePattern.exec(t)) !== null) {
    const startY = parseInt(m[1], 10);
    const startM = parseInt(m[2], 10);
    const endY = m[3] ? parseInt(m[3], 10) : now.getFullYear();
    const endM = m[4] ? parseInt(m[4], 10) : now.getMonth() + 1;
    const months = (endY - startY) * 12 + (endM - startM);
    if (months > 0 && months < 600) {
      totalMonths += months;
      rangeCount += 1;
    }
  }
  const rangeYears = rangeCount > 0 ? Math.round((totalMonths / 12) * 10) / 10 : null;

  const best = explicitMax !== null ? explicitMax : rangeYears;
  return {
    years: best,
    source: explicitMax !== null ? 'explicit' : rangeYears !== null ? 'date-range' : 'unknown',
  };
}

/**
 * 이력서 텍스트에서 최고 학력을 추정한다.
 * 주의: "전문학사"는 문자열 안에 "학사"를 포함하므로, 단순 부분일치만 쓰면
 * 전문학사 졸업자가 학사로 오인식된다. 학사 패턴을 검사할 때는 "전문학사"
 * 표현을 제거한 텍스트를 기준으로 검사해 이 오탐을 막는다.
 */
function extractEducation(text) {
  const t = normalize(text);
  const tWithoutJunior = t.replace(/전문\s*학사/g, '').replace(/전문\s*대/g, '');
  let best = null;
  for (const level of EDUCATION_LEVELS) {
    for (const p of level.patterns) {
      const haystack = level.key === '학사' ? tWithoutJunior : t;
      if (haystack.includes(normalize(p))) {
        if (!best || level.rank > best.rank) best = level;
        break;
      }
    }
  }
  return best ? { level: best.key, rank: best.rank } : { level: null, rank: 0 };
}

/** 텍스트 안에서 키워드가 등장하는지 (대소문자 무시, 공백 정규화 후 부분일치). */
function findMatches(text, keywords) {
  const t = normalize(text);
  const matched = [];
  const missing = [];
  for (const kw of keywords || []) {
    const k = normalize(kw);
    if (!k) continue;
    if (t.includes(k)) matched.push(kw);
    else missing.push(kw);
  }
  return { matched, missing };
}

/**
 * 채용공고(JD) 기준으로 이력서 한 건을 채점한다.
 * @param {{title?:string, requiredSkills?:string[], preferredSkills?:string[], minYears?:number, educationLevel?:string}} jd
 * @param {string} resumeText
 * @param {{fileName?:string, now?:Date}} [meta]
 */
function scoreResume(jd, resumeText, meta = {}) {
  const requiredSkills = jd.requiredSkills || [];
  const preferredSkills = jd.preferredSkills || [];
  const minYears = typeof jd.minYears === 'number' ? jd.minYears : null;

  const { matched: matchedRequired, missing: missingRequired } = findMatches(resumeText, requiredSkills);
  const { matched: matchedPreferred, missing: missingPreferred } = findMatches(resumeText, preferredSkills);

  const yearsInfo = extractYears(resumeText, meta.now);
  const educationInfo = extractEducation(resumeText);
  const contact = extractContact(resumeText);

  // 가중치: 필수스킬 70 / 우대스킬 20 / 최소연차 충족 10
  // JD에 해당 항목이 비어있으면 그 항목 가중치를 나머지 항목에 재분배한다.
  const weights = { required: 70, preferred: 20, years: 10 };
  if (requiredSkills.length === 0) {
    weights.preferred += weights.required * (2 / 3);
    weights.years += weights.required * (1 / 3);
    weights.required = 0;
  }
  if (preferredSkills.length === 0) {
    weights.required += weights.preferred * 0.78;
    weights.years += weights.preferred * 0.22;
    weights.preferred = 0;
  }
  if (minYears === null) {
    weights.required += weights.years * 0.78;
    weights.preferred += weights.years * 0.22;
    weights.years = 0;
  }

  const requiredScore = requiredSkills.length > 0 ? (matchedRequired.length / requiredSkills.length) * weights.required : 0;
  const preferredScore = preferredSkills.length > 0 ? (matchedPreferred.length / preferredSkills.length) * weights.preferred : 0;

  let yearsScore = 0;
  if (minYears !== null && weights.years > 0) {
    if (yearsInfo.years === null) {
      yearsScore = 0; // 경력 연차를 추정 못하면 보수적으로 0점 처리, UI에서 "확인 필요"로 표시
    } else if (yearsInfo.years >= minYears) {
      yearsScore = weights.years;
    } else {
      yearsScore = Math.max(0, (yearsInfo.years / minYears)) * weights.years;
    }
  }

  const total = Math.round(requiredScore + preferredScore + yearsScore);
  const roundedWeights = {
    required: Math.round(weights.required),
    preferred: Math.round(weights.preferred),
    years: Math.round(weights.years),
  };

  const candidateName = extractName(resumeText);

  return {
    fileName: meta.fileName || null,
    candidateName,
    score: Math.max(0, Math.min(100, total)),
    breakdown: {
      requiredScore: Math.round(requiredScore),
      preferredScore: Math.round(preferredScore),
      yearsScore: Math.round(yearsScore),
      weights: roundedWeights,
    },
    matchedRequired,
    missingRequired,
    matchedPreferred,
    missingPreferred,
    estimatedYears: yearsInfo.years,
    yearsSource: yearsInfo.source,
    education: educationInfo.level,
    contact,
  };
}

/** 여러 이력서를 채점하고 점수 내림차순으로 정렬한다. */
function rankResumes(jd, resumes) {
  const scored = resumes.map((r) => scoreResume(jd, r.text, { fileName: r.fileName }));
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

Object.assign(window.HorongScoring, {
  scoreResume,
  rankResumes,
  extractYears,
  extractEducation,
  extractContact,
  extractName,
  findMatches,
  normalize,
});
