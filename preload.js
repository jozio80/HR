'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('horong', {
  // 파일 선택
  selectResumeFiles: () => ipcRenderer.invoke('select-resume-files'),
  selectResumeFolder: () => ipcRenderer.invoke('select-resume-folder'),
  getResumeText: (filePath) => ipcRenderer.invoke('get-resume-text', filePath),

  // 내보내기
  exportCsv: (rows, defaultName) => ipcRenderer.invoke('export-csv', { rows, defaultName }),
  exportXlsx: (records, defaultName) => ipcRenderer.invoke('export-xlsx', { records, defaultName }),

  // 포지션 CRUD
  listPositions: () => ipcRenderer.invoke('list-positions'),
  getPosition: (id) => ipcRenderer.invoke('get-position', id),
  createPosition: (fields) => ipcRenderer.invoke('create-position', fields),
  editPositionFields: (id, fields) => ipcRenderer.invoke('edit-position-fields', { id, fields }),
  deletePosition: (id) => ipcRenderer.invoke('delete-position', id),

  // 1. 소싱
  updateSourcing: (positionId, channels, notes) => ipcRenderer.invoke('update-sourcing', { positionId, channels, notes }),

  // 2. 서류스크리닝
  screenCandidates: (positionId, filePaths) => ipcRenderer.invoke('screen-candidates', { positionId, filePaths }),
  setCandidateStage: (positionId, candidateId, stage) => ipcRenderer.invoke('set-candidate-stage', { positionId, candidateId, stage }),
  setCandidateNote: (positionId, candidateId, notes) => ipcRenderer.invoke('set-candidate-note', { positionId, candidateId, notes }),

  // 3. 면접
  generateInterviewQuestions: (positionId) => ipcRenderer.invoke('generate-interview-questions', positionId),
  setInterviewResult: (positionId, candidateId, result) => ipcRenderer.invoke('set-interview-result', { positionId, candidateId, result }),

  // 4. 합격통보
  generateOfferEmail: (positionId, candidateId, extra) => ipcRenderer.invoke('generate-offer-email', { positionId, candidateId, extra }),
  generateRejectionEmail: (positionId, candidateId, extra) => ipcRenderer.invoke('generate-rejection-email', { positionId, candidateId, extra }),

  // 5. 온보딩
  generateOnboardingChecklist: (positionId) => ipcRenderer.invoke('generate-onboarding-checklist', positionId),
  toggleOnboardingItem: (positionId, itemKey) => ipcRenderer.invoke('toggle-onboarding-item', { positionId, itemKey }),

  // 설정 (LLM 연결)
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveLLMSettings: (llmFields) => ipcRenderer.invoke('save-llm-settings', llmFields),
  testLLMConnection: () => ipcRenderer.invoke('test-llm-connection'),

  // 이력서 AI 분석
  analyzeCandidate: (positionId, candidateId) => ipcRenderer.invoke('analyze-candidate', { positionId, candidateId }),

  // 채용공고 URL 자동체크
  checkUrlReachable: (url) => ipcRenderer.invoke('check-url-reachable', url),
});
