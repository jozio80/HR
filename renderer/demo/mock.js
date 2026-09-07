'use strict';
/**
 * 브라우저 미리보기 전용 mock (실제 Electron 앱에서는 로드되지 않음).
 * main.js의 positionStore 기반 IPC 핸들러를 흉내내되, fs 대신 window.__DB__ 인메모리 배열을 쓴다.
 * 채점/생성 로직은 src/*.js 원본을 그대로 브라우저용으로 번들링한 것이라 실제 로직과 동일하게 동작한다.
 */
window.__SAMPLE_RESUMES__ = [
  {
    "fileName": "sample-resume-hong.pdf",
    "text": "\n\n홍길동 이력서\n연락처: hong@example.com / 010-1234-5678\n학력\nOO대학교 컴퓨터공학과 학사 졸업\n경력사항\n2016.03 ~ 2020.02 A테크 백엔드 개발자\n2020.03 ~ 2024.02 B소프트 시니어 백엔드 개발자\n총 8년간 백엔드 개발 경력이 있습니다.\n보유 기술\nJava, Spring Boot, MySQL, AWS, Kafka 활용 경험 다수",
    "filePath": "/Users/demo/Desktop/이력서/sample-resume-hong.pdf"
  },
  {
    "fileName": "sample-resume-kim.txt",
    "text": "김철수 이력서\n연락처: kim@example.com / 010-9999-8888\n\n학력\nOO대학교 전자공학과 전문학사 졸업\n\n경력사항\n경력 2년차 프론트엔드 개발자입니다.\n\n보유 기술\nHTML, CSS, React 기본 활용 가능\n",
    "filePath": "/Users/demo/Desktop/이력서/sample-resume-kim.txt"
  }
];
window.__DB__ = { positions: [] };

function listPositionsSync() {
  return window.__DB__.positions
    .slice()
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .map((p) => ({ id: p.id, title: p.title, candidateCount: p.candidates.length, updatedAt: p.updatedAt }));
}
function getPositionSync(id) {
  return window.__DB__.positions.find((p) => p.id === id) || null;
}
function updatePositionSync(id, patchFn) {
  const idx = window.__DB__.positions.findIndex((p) => p.id === id);
  if (idx === -1) throw new Error('포지션을 찾을 수 없습니다: ' + id);
  const updated = { ...patchFn(window.__DB__.positions[idx]), updatedAt: new Date().toISOString() };
  window.__DB__.positions[idx] = updated;
  return updated;
}

window.horong = {
  async selectResumeFiles() {
    return window.__SAMPLE_RESUMES__.map((r) => r.filePath);
  },
  async selectResumeFolder() {
    return { filePaths: window.__SAMPLE_RESUMES__.map((r) => r.filePath), folderPath: '/Users/demo/Desktop/이력서', truncated: false };
  },
  async getResumeText(filePath) {
    const r = window.__SAMPLE_RESUMES__.find((x) => x.filePath === filePath);
    return r ? r.text : '';
  },
  async exportCsv() { return { saved: false }; },
  async exportXlsx() { return { saved: false }; },

  async listPositions() { return listPositionsSync(); },
  async getPosition(id) { return getPositionSync(id); },
  async createPosition(fields) {
    const p = window.HorongStore.createPositionObject(fields);
    window.__DB__.positions.push(p);
    return p;
  },
  async editPositionFields(id, fields) {
    return updatePositionSync(id, (p) => window.HorongStore.editPositionFields(p, fields));
  },
  async deletePosition(id) {
    window.__DB__.positions = window.__DB__.positions.filter((p) => p.id !== id);
    return { deleted: true };
  },

  async updateSourcing(positionId, channels, notes) {
    return updatePositionSync(positionId, (p) => window.HorongStore.updateSourcing(p, { channels, notes }));
  },

  async screenCandidates(positionId, filePaths) {
    const position = getPositionSync(positionId);
    const resumes = filePaths.map((fp) => window.__SAMPLE_RESUMES__.find((r) => r.filePath === fp)).filter(Boolean);
    const jd = { title: position.title, requiredSkills: position.requiredSkills, preferredSkills: position.preferredSkills, minYears: position.minYears };
    const ranked = window.HorongScoring.rankResumes(jd, resumes);
    const rankedWithPath = ranked.map((r) => {
      const src = resumes.find((e) => e.fileName === r.fileName);
      return { ...r, filePath: src ? src.filePath : null };
    });
    const updated = updatePositionSync(positionId, (p) => window.HorongStore.addCandidates(p, rankedWithPath));
    return { position: updated, errors: [] };
  },
  async setCandidateStage(positionId, candidateId, stage) {
    return updatePositionSync(positionId, (p) => window.HorongStore.setCandidateStage(p, candidateId, stage));
  },
  async setCandidateNote(positionId, candidateId, notes) {
    return updatePositionSync(positionId, (p) => window.HorongStore.setCandidateNote(p, candidateId, notes));
  },

  async generateInterviewQuestions(positionId) {
    const position = getPositionSync(positionId);
    const jd = { title: position.title, requiredSkills: position.requiredSkills, preferredSkills: position.preferredSkills, minYears: position.minYears };
    const questions = window.HorongInterview.generateInterviewQuestions(jd);
    const updated = updatePositionSync(positionId, (p) => window.HorongStore.setInterviewQuestions(p, questions));
    return updated.interview.questions;
  },
  async setInterviewResult(positionId, candidateId, result) {
    return updatePositionSync(positionId, (p) => window.HorongStore.setInterviewResult(p, candidateId, result));
  },

  async generateOfferEmail(positionId, candidateId, extra) {
    const position = getPositionSync(positionId);
    const candidate = position.candidates.find((c) => c.id === candidateId);
    return window.HorongEmail.generateOfferEmail({
      candidateName: candidate?.candidateName, positionTitle: position.title,
      companyName: extra?.companyName, startDate: extra?.startDate, extraNote: extra?.extraNote,
    });
  },
  async generateRejectionEmail(positionId, candidateId, extra) {
    const position = getPositionSync(positionId);
    const candidate = position.candidates.find((c) => c.id === candidateId);
    return window.HorongEmail.generateRejectionEmail({
      candidateName: candidate?.candidateName, positionTitle: position.title,
      companyName: extra?.companyName, extraNote: extra?.extraNote,
    });
  },

  async generateOnboardingChecklist(positionId) {
    const position = getPositionSync(positionId);
    const checklist = window.HorongOnboarding.generateOnboardingChecklist({ title: position.title });
    const updated = updatePositionSync(positionId, (p) => window.HorongStore.setOnboardingChecklist(p, checklist));
    return updated.onboarding;
  },
  async toggleOnboardingItem(positionId, itemKey) {
    return updatePositionSync(positionId, (p) => window.HorongStore.toggleOnboardingItem(p, itemKey));
  },

  // --- 설정 (LLM), 미리보기에서는 인메모리에만 저장 ---
  async getSettings() {
    if (!window.__SETTINGS__) window.__SETTINGS__ = { llm: { provider: 'openai', apiKey: '', baseUrl: '', model: 'gpt-4o-mini' } };
    return window.__SETTINGS__;
  },
  async saveLLMSettings(fields) {
    const current = await this.getSettings();
    window.__SETTINGS__ = { ...current, llm: { ...current.llm, ...fields } };
    return window.__SETTINGS__;
  },
  async testLLMConnection() {
    const settings = await this.getSettings();
    if (!settings.llm.apiKey) return { ok: false, error: 'LLM API 키가 등록되어 있지 않습니다. 설정에서 먼저 등록해주세요.' };
    await new Promise((r) => setTimeout(r, 400));
    return { ok: true, reply: '(미리보기 모드 - 실제 호출 없이 성공으로 표시)' };
  },

  // --- 이력서 AI 분석: 미리보기에서는 실제 LLM을 호출하지 않고 마스킹 로직만 실제로 태워서 확인용 결과를 만든다 ---
  async analyzeCandidate(positionId, candidateId) {
    const position = getPositionSync(positionId);
    const candidate = position.candidates.find((c) => c.id === candidateId);
    const resume = window.__SAMPLE_RESUMES__.find((r) => r.fileName === candidate.fileName);
    await new Promise((r) => setTimeout(r, 600));
    const analysis = {
      fitScore: candidate.score,
      summary: `(미리보기) ${candidate.candidateName || candidate.fileName}님은 규칙기반 점수 ${candidate.score}점입니다. 실제 앱에서는 이 부분이 등록하신 LLM의 실제 분석 결과로 채워집니다.`,
      strengths: candidate.matchedRequired.map((s) => `${s} 실무 경험 보유`),
      concerns: candidate.missingRequired.map((s) => `${s} 경험 확인 필요`),
      recommendedQuestions: ['실제 프로젝트에서 어떤 역할을 맡았는지 설명해주세요.'],
      maskedFields: ['name', 'email', 'phone'],
      analyzedAt: new Date().toISOString(),
    };
    return updatePositionSync(positionId, (p) => window.HorongStore.setCandidateAnalysis(p, candidateId, analysis));
  },

  // --- URL 자동확인: 미리보기에서는 실제 네트워크 없이 URL 형태로만 판정 ---
  async checkUrlReachable(url) {
    await new Promise((r) => setTimeout(r, 500));
    if (!url || !/^https?:\/\//.test(url)) return { reachable: false, error: '올바른 URL 형식이 아닙니다' };
    if (url.includes('broken')) return { reachable: false, status: 404 };
    return { reachable: true, status: 200 };
  },
};
