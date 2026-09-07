'use strict';

const { app, BrowserWindow, ipcMain, dialog, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { extractFromFile, SUPPORTED_EXTENSIONS } = require('./src/extractText');
const { rankResumes } = require('./src/scoring');
const { generateInterviewQuestions } = require('./src/interviewQuestions');
const { generateOfferEmail, generateRejectionEmail } = require('./src/emailTemplates');
const { generateOnboardingChecklist } = require('./src/onboardingChecklist');
const store = require('./src/positionStore');

let mainWindow = null;

function getDbFilePath() {
  return path.join(app.getPath('userData'), 'positions.json');
}

/**
 * 신뢰 확보 장치: 이 앱은 렌더러/메인 어디에서도 이력서 원문이나 채용 데이터를 외부로 보내지 않는다.
 * 방어적으로, 세션 레벨에서 http/https 아웃바운드 요청 자체를 전부 차단한다.
 */
function blockAllNetworkRequests() {
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const url = details.url || '';
    if (url.startsWith('file:') || url.startsWith('devtools:') || url.startsWith('data:')) {
      callback({ cancel: false });
      return;
    }
    console.warn('[호롱랩스] 네트워크 요청 차단됨:', url);
    callback({ cancel: true });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1080,
    minHeight: 680,
    title: '호롱 채용 워크스페이스 (호롱랩스)',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  blockAllNetworkRequests();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- 파일 선택 (기존 그대로) ---

ipcMain.handle('select-resume-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '이력서 파일 선택 (여러 개 선택 가능)',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: '이력서 파일', extensions: ['pdf', 'docx', 'txt'] },
      { name: '모든 파일', extensions: ['*'] },
    ],
  });
  if (result.canceled) return [];
  return result.filePaths;
});

const MAX_FOLDER_SCAN_FILES = 500;
const MAX_FOLDER_SCAN_DEPTH = 4;

async function scanResumeFolder(dirPath, depth = 0, results = []) {
  if (depth > MAX_FOLDER_SCAN_DEPTH || results.length >= MAX_FOLDER_SCAN_FILES) return results;
  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      await scanResumeFolder(full, depth + 1, results);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (SUPPORTED_EXTENSIONS.includes(ext)) results.push(full);
    }
    if (results.length >= MAX_FOLDER_SCAN_FILES) break;
  }
  return results;
}

ipcMain.handle('select-resume-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '이력서 폴더 선택 (하위 폴더까지 자동으로 찾습니다)',
    properties: ['openDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return { filePaths: [], folderPath: null, truncated: false };
  }
  const folderPath = result.filePaths[0];
  const filePaths = await scanResumeFolder(folderPath);
  return { filePaths, folderPath, truncated: filePaths.length >= MAX_FOLDER_SCAN_FILES };
});

ipcMain.handle('get-resume-text', async (_event, filePath) => {
  const { text } = await extractFromFile(filePath);
  return text;
});

// --- 내보내기 ---

ipcMain.handle('export-csv', async (_event, { rows, defaultName }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '결과 내보내기',
    defaultPath: defaultName || '호롱랩스_결과.csv',
    filters: [{ name: 'CSV', extensions: ['csv'] }],
  });
  if (result.canceled || !result.filePath) return { saved: false };
  await fs.writeFile(result.filePath, rows, 'utf-8');
  return { saved: true, filePath: result.filePath };
});

ipcMain.handle('export-xlsx', async (_event, { records, defaultName }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '결과 엑셀로 내보내기',
    defaultPath: defaultName || '호롱랩스_결과.xlsx',
    filters: [{ name: 'Excel', extensions: ['xlsx'] }],
  });
  if (result.canceled || !result.filePath) return { saved: false };
  const XLSX = require('xlsx');
  const worksheet = XLSX.utils.json_to_sheet(records);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '결과');
  XLSX.writeFile(workbook, result.filePath);
  return { saved: true, filePath: result.filePath };
});

// --- 포지션 CRUD ---

ipcMain.handle('list-positions', async () => {
  return store.listPositions(getDbFilePath());
});

ipcMain.handle('get-position', async (_event, id) => {
  return store.getPosition(getDbFilePath(), id);
});

ipcMain.handle('create-position', async (_event, fields) => {
  return store.createPosition(getDbFilePath(), fields);
});

ipcMain.handle('edit-position-fields', async (_event, { id, fields }) => {
  return store.updatePosition(getDbFilePath(), id, (p) => store.editPositionFields(p, fields));
});

ipcMain.handle('delete-position', async (_event, id) => {
  await store.deletePosition(getDbFilePath(), id);
  return { deleted: true };
});

// --- 2. 서류스크리닝: 이력서 추출+채점 후 포지션에 저장 ---

ipcMain.handle('screen-candidates', async (_event, { positionId, filePaths }) => {
  const extracted = [];
  const errors = [];
  for (const fp of filePaths) {
    try {
      const { fileName, text } = await extractFromFile(fp);
      extracted.push({ fileName, text, filePath: fp });
    } catch (err) {
      errors.push({ filePath: fp, message: err.message });
    }
  }
  const position = await store.getPosition(getDbFilePath(), positionId);
  if (!position) throw new Error('포지션을 찾을 수 없습니다');
  const jd = { title: position.title, requiredSkills: position.requiredSkills, preferredSkills: position.preferredSkills, minYears: position.minYears };
  const ranked = rankResumes(jd, extracted);
  const rankedWithPath = ranked.map((r) => {
    const src = extracted.find((e) => e.fileName === r.fileName);
    return { ...r, filePath: src ? src.filePath : null };
  });
  const updated = await store.updatePosition(getDbFilePath(), positionId, (p) => store.addCandidates(p, rankedWithPath));
  return { position: updated, errors };
});

ipcMain.handle('set-candidate-stage', async (_event, { positionId, candidateId, stage }) => {
  return store.updatePosition(getDbFilePath(), positionId, (p) => store.setCandidateStage(p, candidateId, stage));
});

ipcMain.handle('set-candidate-note', async (_event, { positionId, candidateId, notes }) => {
  return store.updatePosition(getDbFilePath(), positionId, (p) => store.setCandidateNote(p, candidateId, notes));
});

// --- 1. 소싱 ---

ipcMain.handle('update-sourcing', async (_event, { positionId, channels, notes }) => {
  return store.updatePosition(getDbFilePath(), positionId, (p) => store.updateSourcing(p, { channels, notes }));
});

// --- 3. 면접 ---

ipcMain.handle('generate-interview-questions', async (_event, positionId) => {
  const position = await store.getPosition(getDbFilePath(), positionId);
  if (!position) throw new Error('포지션을 찾을 수 없습니다');
  const jd = { title: position.title, requiredSkills: position.requiredSkills, preferredSkills: position.preferredSkills, minYears: position.minYears };
  const questions = generateInterviewQuestions(jd);
  const updated = await store.updatePosition(getDbFilePath(), positionId, (p) => store.setInterviewQuestions(p, questions));
  return updated.interview.questions;
});

ipcMain.handle('set-interview-result', async (_event, { positionId, candidateId, result }) => {
  return store.updatePosition(getDbFilePath(), positionId, (p) => store.setInterviewResult(p, candidateId, result));
});

// --- 4. 합격통보 ---

ipcMain.handle('generate-offer-email', async (_event, { positionId, candidateId, extra }) => {
  const position = await store.getPosition(getDbFilePath(), positionId);
  const candidate = position?.candidates.find((c) => c.id === candidateId);
  return generateOfferEmail({
    candidateName: candidate?.candidateName,
    positionTitle: position?.title,
    companyName: extra?.companyName,
    startDate: extra?.startDate,
    extraNote: extra?.extraNote,
  });
});

ipcMain.handle('generate-rejection-email', async (_event, { positionId, candidateId, extra }) => {
  const position = await store.getPosition(getDbFilePath(), positionId);
  const candidate = position?.candidates.find((c) => c.id === candidateId);
  return generateRejectionEmail({
    candidateName: candidate?.candidateName,
    positionTitle: position?.title,
    companyName: extra?.companyName,
    extraNote: extra?.extraNote,
  });
});

// --- 5. 온보딩 ---

ipcMain.handle('generate-onboarding-checklist', async (_event, positionId) => {
  const position = await store.getPosition(getDbFilePath(), positionId);
  if (!position) throw new Error('포지션을 찾을 수 없습니다');
  const checklist = generateOnboardingChecklist({ title: position.title });
  const updated = await store.updatePosition(getDbFilePath(), positionId, (p) => store.setOnboardingChecklist(p, checklist));
  return updated.onboarding;
});

ipcMain.handle('toggle-onboarding-item', async (_event, { positionId, itemKey }) => {
  return store.updatePosition(getDbFilePath(), positionId, (p) => store.toggleOnboardingItem(p, itemKey));
});
