'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('horong', {
  selectResumeFiles: () => ipcRenderer.invoke('select-resume-files'),
  selectResumeFolder: () => ipcRenderer.invoke('select-resume-folder'),
  extractAndScore: (jd, filePaths) => ipcRenderer.invoke('extract-and-score', { jd, filePaths }),
  getResumeText: (filePath) => ipcRenderer.invoke('get-resume-text', filePath),
  exportCsv: (rows, defaultName) => ipcRenderer.invoke('export-csv', { rows, defaultName }),
  exportXlsx: (records, defaultName) => ipcRenderer.invoke('export-xlsx', { records, defaultName }),
  saveSession: (name, data) => ipcRenderer.invoke('save-session', { name, data }),
  listSessions: () => ipcRenderer.invoke('list-sessions'),
  loadSession: (fileName) => ipcRenderer.invoke('load-session', fileName),
});
