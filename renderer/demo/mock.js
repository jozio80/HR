'use strict';
/**
 * 브라우저 미리보기 전용 mock. 실제 배포되는 Electron 앱에서는 preload.js가
 * 진짜 IPC(window.horong)를 제공하며, 이 파일은 로드되지 않는다.
 * 목적: 이 샌드박스의 Bash 툴이 macOS GUI 프로세스(WindowServer) 접근이 막혀 있어
 * 실제 Electron 창을 띄워 스크린샷을 찍을 수 없으므로, 동일한 렌더러 코드(app.js)를
 * 브라우저에서 그대로 실행해 UI를 시각 검증하기 위한 것. 채점 로직(HorongScoring)은
 * src/scoring.js 원본을 그대로 가져온 것이고, PDF 추출은 Node CLI에서 실제 PDF로 별도 검증함.
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

window.horong = {
  async selectResumeFiles() {
    return window.__SAMPLE_RESUMES__.map((r) => r.filePath);
  },
  async extractAndScore(jd, filePaths) {
    const resumes = filePaths.map((fp) => window.__SAMPLE_RESUMES__.find((r) => r.filePath === fp));
    const ranked = window.HorongScoring.rankResumes(jd, resumes);
    const rankedWithPath = ranked.map((r) => {
      const src = resumes.find((e) => e.fileName === r.fileName);
      return { ...r, filePath: src ? src.filePath : null };
    });
    return { ranked: rankedWithPath, errors: [] };
  },
  async getResumeText(filePath) {
    const r = window.__SAMPLE_RESUMES__.find((x) => x.filePath === filePath);
    return r ? r.text : '';
  },
  async exportCsv() {
    return { saved: false };
  },
  async saveSession() {
    return { savedPath: null };
  },
  async listSessions() {
    return [];
  },
  async loadSession() {
    return null;
  },
};
