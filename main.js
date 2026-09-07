'use strict';

const { app, BrowserWindow, ipcMain, dialog, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { extractFromFile, SUPPORTED_EXTENSIONS } = require('./src/extractText');
const { rankResumes } = require('./src/scoring');

let mainWindow = null;

// 세션 저장 경로 (userData 안, 사용자 PC 로컬 디스크). 클라우드 동기화 폴더는 아니지만
// 혹시 Dropbox/OneDrive 등 동기화 폴더 안에 userData가 있는 특수 환경은 사용자 책임.
function getSessionsDir() {
  return path.join(app.getPath('userData'), 'sessions');
}

/**
 * 신뢰 확보 장치: 이 앱은 렌더러/메인 어디에서도 이력서 원문을 외부로 보내지 않는다.
 * 방어적으로, 세션 레벨에서 http/https 아웃바운드 요청 자체를 전부 차단한다.
 * (electron 자동 업데이트, 원격 폰트/이미지 로딩 같은 것도 전부 막힘 - 의도된 동작)
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
    width: 1280,
    height: 860,
    minWidth: 1000,
    minHeight: 640,
    title: '호롱 이력서 스크리너 (호롱랩스)',
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

// --- IPC handlers ---

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

ipcMain.handle('extract-and-score', async (_event, { jd, filePaths }) => {
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
  const ranked = rankResumes(jd, extracted);
  // filePath는 렌더러로 넘겨서 "상세보기"에서 원문 재조회에 쓴다 (텍스트 자체도 이미 로컬 메모리에만 존재).
  const rankedWithPath = ranked.map((r) => {
    const src = extracted.find((e) => e.fileName === r.fileName);
    return { ...r, filePath: src ? src.filePath : null };
  });
  return { ranked: rankedWithPath, errors, supportedExtensions: SUPPORTED_EXTENSIONS };
});

ipcMain.handle('get-resume-text', async (_event, filePath) => {
  const { text } = await extractFromFile(filePath);
  return text;
});

ipcMain.handle('export-csv', async (_event, { rows, defaultName }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '결과 내보내기',
    defaultPath: defaultName || '호롱랩스_이력서스크리닝_결과.csv',
    filters: [{ name: 'CSV', extensions: ['csv'] }],
  });
  if (result.canceled || !result.filePath) return { saved: false };
  await fs.writeFile(result.filePath, rows, 'utf-8');
  return { saved: true, filePath: result.filePath };
});

// --- 세션 저장/불러오기 (JD + 결과, 전부 userData 로컬 디스크에만 저장) ---

ipcMain.handle('save-session', async (_event, { name, data }) => {
  const dir = getSessionsDir();
  await fs.mkdir(dir, { recursive: true });
  const safeName = (name || `session-${Date.now()}`).replace(/[\\/:*?"<>|]/g, '_');
  const filePath = path.join(dir, `${safeName}.json`);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  return { savedPath: filePath };
});

ipcMain.handle('list-sessions', async () => {
  const dir = getSessionsDir();
  await fs.mkdir(dir, { recursive: true });
  const files = await fs.readdir(dir);
  return files.filter((f) => f.endsWith('.json'));
});

ipcMain.handle('load-session', async (_event, fileName) => {
  const dir = getSessionsDir();
  const filePath = path.join(dir, fileName);
  const raw = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(raw);
});
