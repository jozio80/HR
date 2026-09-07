'use strict';

const state = {
  selectedFiles: [],
  lastResults: [],
};

const $ = (sel) => document.querySelector(sel);

function parseKeywords(text) {
  return (text || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function readJdFromForm() {
  const title = $('#jd-title').value.trim();
  const requiredSkills = parseKeywords($('#jd-required').value);
  const preferredSkills = parseKeywords($('#jd-preferred').value);
  const yearsRaw = $('#jd-years').value;
  const minYears = yearsRaw === '' ? null : Number(yearsRaw);
  return { title, requiredSkills, preferredSkills, minYears };
}

function addFiles(paths) {
  const set = new Set(state.selectedFiles);
  for (const p of paths) set.add(p);
  state.selectedFiles = Array.from(set);
  renderFileList();
}

function renderFileList() {
  const list = $('#file-list');
  list.innerHTML = '';
  for (const fp of state.selectedFiles) {
    const li = document.createElement('li');
    const name = fp.split(/[\\/]/).pop();
    const dir = fp.slice(0, fp.length - name.length);
    const nameSpan = document.createElement('span');
    nameSpan.textContent = name;
    const pathSpan = document.createElement('span');
    pathSpan.className = 'file-path';
    pathSpan.textContent = dir;
    li.appendChild(nameSpan);
    li.appendChild(pathSpan);
    list.appendChild(li);
  }
  $('#file-count-label').textContent = `선택된 파일 ${state.selectedFiles.length}개`;
  $('#btn-run').disabled = state.selectedFiles.length === 0;
}

function scoreColor(score) {
  if (score >= 80) return '#6ea86a';
  if (score >= 50) return '#e8a13a';
  return '#d9634b';
}

function renderResults(ranked) {
  state.lastResults = ranked;
  const body = $('#results-body');
  body.innerHTML = '';
  $('#empty-state').style.display = ranked.length === 0 ? 'block' : 'none';
  $('#btn-export').disabled = ranked.length === 0;

  ranked.forEach((r, idx) => {
    const tr = document.createElement('tr');

    const tdRank = document.createElement('td');
    tdRank.textContent = `#${idx + 1}`;
    tr.appendChild(tdRank);

    const tdName = document.createElement('td');
    tdName.className = 'candidate-cell';
    const nameEl = document.createElement('span');
    nameEl.className = 'candidate-name';
    nameEl.textContent = r.candidateName || '(이름 미확인)';
    const fileEl = document.createElement('span');
    fileEl.className = 'candidate-file';
    fileEl.textContent = r.fileName;
    tdName.appendChild(nameEl);
    tdName.appendChild(fileEl);
    tr.appendChild(tdName);

    const tdScore = document.createElement('td');
    const scoreCell = document.createElement('div');
    scoreCell.className = 'score-cell';
    const track = document.createElement('div');
    track.className = 'score-bar-track';
    const fill = document.createElement('div');
    fill.className = 'score-bar-fill';
    fill.style.width = `${r.score}%`;
    fill.style.background = scoreColor(r.score);
    track.appendChild(fill);
    const num = document.createElement('span');
    num.className = 'score-num';
    num.textContent = r.score;
    scoreCell.appendChild(num);
    scoreCell.appendChild(track);
    tdScore.appendChild(scoreCell);
    tr.appendChild(tdScore);

    const tdReq = document.createElement('td');
    tdReq.appendChild(tagGroup(r.matchedRequired, 'matched'));
    if (r.missingRequired.length) tdReq.appendChild(tagGroup(r.missingRequired, 'missing'));
    tr.appendChild(tdReq);

    const tdPref = document.createElement('td');
    tdPref.appendChild(tagGroup(r.matchedPreferred, 'matched'));
    tr.appendChild(tdPref);

    const tdYears = document.createElement('td');
    tdYears.textContent = r.estimatedYears === null ? '확인 필요' : `${r.estimatedYears}년`;
    tr.appendChild(tdYears);

    const tdEdu = document.createElement('td');
    tdEdu.textContent = r.education || '-';
    tr.appendChild(tdEdu);

    const tdDetail = document.createElement('td');
    const btn = document.createElement('button');
    btn.className = 'detail-btn';
    btn.textContent = '상세보기';
    btn.addEventListener('click', () => openDetail(r));
    tdDetail.appendChild(btn);
    tr.appendChild(tdDetail);

    body.appendChild(tr);
  });
}

function tagGroup(items, kind) {
  const span = document.createElement('span');
  for (const item of items) {
    const tag = document.createElement('span');
    tag.className = kind === 'missing' ? 'tag missing' : 'tag';
    tag.textContent = kind === 'missing' ? `✕ ${item}` : `✓ ${item}`;
    span.appendChild(tag);
  }
  return span;
}

async function openDetail(r) {
  $('#detail-filename').textContent = r.candidateName ? `${r.candidateName} (${r.fileName})` : r.fileName;
  const body = $('#detail-body');
  body.innerHTML = '<p class="hint">원문 불러오는 중…</p>';
  $('#detail-modal').classList.remove('hidden');

  const contactLine = [r.contact?.email, r.contact?.phone].filter(Boolean).join(' · ') || '연락처 자동 인식 안 됨';

  let rawText = '';
  try {
    rawText = r.filePath ? await window.horong.getResumeText(r.filePath) : '';
  } catch (e) {
    rawText = `(원문을 다시 불러오지 못했습니다: ${e.message})`;
  }

  body.innerHTML = `
    <div class="detail-section">
      <h4>총점: ${r.score}점</h4>
      <p class="hint">필수 ${r.breakdown.requiredScore}/${r.breakdown.weights.required} · 우대 ${r.breakdown.preferredScore}/${r.breakdown.weights.preferred} · 연차 ${r.breakdown.yearsScore}/${r.breakdown.weights.years}</p>
    </div>
    <div class="detail-section">
      <h4>연락처 (자동 인식, 이 PC 안에서만 표시됨)</h4>
      <p>${contactLine}</p>
    </div>
    <div class="detail-section">
      <h4>매칭된 필수 스킬</h4>
      <div>${r.matchedRequired.map((s) => `<span class="tag">✓ ${s}</span>`).join('') || '없음'}</div>
    </div>
    <div class="detail-section">
      <h4>누락된 필수 스킬</h4>
      <div>${r.missingRequired.map((s) => `<span class="tag missing">✕ ${s}</span>`).join('') || '없음'}</div>
    </div>
    <div class="detail-section">
      <h4>원문 미리보기</h4>
      <div class="raw-text-preview">${escapeHtml(rawText).slice(0, 4000) || '(텍스트를 추출하지 못했습니다)'}</div>
    </div>
  `;
}

function escapeHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function toCsv(ranked) {
  const header = ['순위', '지원자', '파일명', '점수', '필수매칭', '필수누락', '우대매칭', '추정경력', '학력', '이메일', '전화번호'];
  const lines = [header.join(',')];
  ranked.forEach((r, idx) => {
    const row = [
      idx + 1,
      r.candidateName || '',
      r.fileName,
      r.score,
      r.matchedRequired.join(' / '),
      r.missingRequired.join(' / '),
      r.matchedPreferred.join(' / '),
      r.estimatedYears === null ? '' : r.estimatedYears,
      r.education || '',
      r.contact?.email || '',
      r.contact?.phone || '',
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`);
    lines.push(row.join(','));
  });
  return '\uFEFF' + lines.join('\n'); // BOM: 엑셀에서 한글 깨짐 방지
}

async function refreshSessionList() {
  const select = $('#session-select');
  const names = await window.horong.listSessions();
  select.innerHTML = '<option value="">저장된 조건 불러오기…</option>';
  for (const n of names) {
    const opt = document.createElement('option');
    opt.value = n;
    opt.textContent = n.replace(/\.json$/, '');
    select.appendChild(opt);
  }
}

function bindEvents() {
  $('#btn-select-files').addEventListener('click', async () => {
    const files = await window.horong.selectResumeFiles();
    if (files.length) addFiles(files);
  });

  $('#btn-select-folder').addEventListener('click', async () => {
    const { filePaths, folderPath, truncated } = await window.horong.selectResumeFolder();
    if (!folderPath) return;
    if (filePaths.length) {
      addFiles(filePaths);
      const dirName = folderPath.split(/[\\/]/).pop();
      $('#run-status').textContent = truncated
        ? `"${dirName}" 폴더에서 ${filePaths.length}건까지만 불러왔습니다 (담기 개수 제한). 하위 폴더를 나눠서 다시 시도해주세요.`
        : `"${dirName}" 폴더에서 이력서 ${filePaths.length}건 찾음`;
    } else {
      $('#run-status').textContent = `선택한 폴더에서 PDF/DOCX/TXT 파일을 찾지 못했습니다.`;
    }
  });

  $('#btn-clear-files').addEventListener('click', () => {
    state.selectedFiles = [];
    renderFileList();
    $('#run-status').textContent = '';
  });

  $('#btn-run').addEventListener('click', async () => {
    const jd = readJdFromForm();
    $('#run-status').textContent = `${state.selectedFiles.length}건 분석 중… (전부 이 PC 안에서 처리됩니다)`;
    $('#btn-run').disabled = true;
    try {
      const { ranked, errors } = await window.horong.extractAndScore(jd, state.selectedFiles);
      renderResults(ranked);
      $('#run-status').textContent = errors.length
        ? `완료 (${ranked.length}건 성공, ${errors.length}건 실패: ${errors.map((e) => e.message).join('; ')})`
        : `완료 (${ranked.length}건 분석됨)`;
    } catch (e) {
      $('#run-status').textContent = `오류: ${e.message}`;
    } finally {
      $('#btn-run').disabled = false;
    }
  });

  $('#btn-export').addEventListener('click', async () => {
    const csv = toCsv(state.lastResults);
    const res = await window.horong.exportCsv(csv, '호롱랩스_이력서스크리닝_결과.csv');
    $('#run-status').textContent = res.saved ? `저장됨: ${res.filePath}` : '내보내기 취소됨';
  });

  $('#btn-close-modal').addEventListener('click', () => $('#detail-modal').classList.add('hidden'));
  $('#detail-modal').addEventListener('click', (e) => {
    if (e.target.id === 'detail-modal') $('#detail-modal').classList.add('hidden');
  });

  $('#btn-save-session').addEventListener('click', async () => {
    const jd = readJdFromForm();
    const name = jd.title || `조건-${new Date().toISOString().slice(0, 10)}`;
    await window.horong.saveSession(name, { jd });
    await refreshSessionList();
    $('#run-status').textContent = `"${name}" 조건 저장됨`;
  });

  $('#session-select').addEventListener('change', async (e) => {
    const val = e.target.value;
    if (!val) return;
    const data = await window.horong.loadSession(val);
    if (data?.jd) {
      $('#jd-title').value = data.jd.title || '';
      $('#jd-required').value = (data.jd.requiredSkills || []).join(', ');
      $('#jd-preferred').value = (data.jd.preferredSkills || []).join(', ');
      $('#jd-years').value = data.jd.minYears ?? '';
    }
  });
}

bindEvents();
renderFileList();
refreshSessionList();
