'use strict';

const state = {
  positions: [],
  currentPosition: null, // 서버(main)에서 받아온 전체 position 객체
  activeTab: 'jobpost',
  selectedFiles: [],
  editingPositionId: null, // null이면 "새 포지션" 모드
  companyName: '',
  pmRequiredSkills: [],
  pmPreferredSkills: [],
  pmMinYears: null,
  settings: null,
  urlCheckResults: {}, // { "channelName": { reachable, status, error } }
};

const COMMON_SKILLS = ['Java', 'Python', 'JavaScript', 'TypeScript', 'React', 'Node.js', 'Spring Boot', 'MySQL', 'AWS', 'Docker', 'Kubernetes', 'Git', 'SQL', 'Excel', 'Figma', '기획력', '커뮤니케이션'];
const MIN_YEARS_PRESETS = [
  { label: '무관', value: null },
  { label: '0년(신입)', value: 0 },
  { label: '1년+', value: 1 },
  { label: '2년+', value: 2 },
  { label: '3년+', value: 3 },
  { label: '5년+', value: 5 },
  { label: '7년+', value: 7 },
  { label: '10년+', value: 10 },
];

const $ = (sel) => document.querySelector(sel);

function escapeHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function parseKeywords(text) {
  return (text || '').split(',').map((s) => s.trim()).filter(Boolean);
}

const STAGE_LABEL = {
  screening: '서류심사',
  interview: '면접대상',
  offer: '합격(통보대기)',
  rejected: '불합격',
  hired: '입사확정',
};

// ============================================================
// 포지션 목록 (사이드바)
// ============================================================

async function refreshPositionList() {
  state.positions = await window.horong.listPositions();
  const list = $('#position-list');
  list.innerHTML = '';
  for (const p of state.positions) {
    const item = document.createElement('button');
    item.className = 'position-item' + (state.currentPosition && state.currentPosition.id === p.id ? ' active' : '');
    item.innerHTML = `
      <span class="position-item-title">${escapeHtml(p.title || '(제목 없음)')}</span>
      <span class="position-item-meta">지원자 ${p.candidateCount}명</span>
    `;
    item.addEventListener('click', () => selectPosition(p.id));
    list.appendChild(item);
  }
}

async function selectPosition(id) {
  state.currentPosition = await window.horong.getPosition(id);
  state.activeTab = 'jobpost';
  await refreshPositionList();
  renderPositionView();
}

function renderPositionView() {
  const p = state.currentPosition;
  $('#empty-workspace').classList.toggle('hidden', !!p);
  $('#position-view').classList.toggle('hidden', !p);
  if (!p) return;

  $('#position-title').textContent = p.title || '(제목 없음)';
  const parts = [];
  if (p.requiredSkills.length) parts.push(`필수: ${p.requiredSkills.join(', ')}`);
  if (p.preferredSkills.length) parts.push(`우대: ${p.preferredSkills.join(', ')}`);
  if (p.minYears !== null) parts.push(`최소 ${p.minYears}년`);
  $('#position-summary').textContent = parts.join(' · ') || '조건이 설정되지 않았습니다.';

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === state.activeTab);
  });
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.toggle('hidden', panel.id !== `tab-${state.activeTab}`);
  });

  renderJobPostTab();
  renderSourcingTab();
  renderScreeningTab();
  renderAnalysisTab();
  renderInterviewTab();
  renderOfferTab();
  renderOnboardingTab();
}

function switchTab(tab) {
  state.activeTab = tab;
  renderPositionView();
}

// ============================================================
// 포지션 생성/수정 모달
// ============================================================

function openPositionModal(position) {
  state.editingPositionId = position ? position.id : null;
  $('#position-modal-title').textContent = position ? '포지션 조건 수정' : '새 포지션';
  $('#pm-title').value = position ? position.title : '';
  state.pmRequiredSkills = position ? [...position.requiredSkills] : [];
  state.pmPreferredSkills = position ? [...position.preferredSkills] : [];
  state.pmMinYears = position ? position.minYears : null;
  renderChipPresets('#pm-required-presets', COMMON_SKILLS, state.pmRequiredSkills, (skill) => toggleChip('pmRequiredSkills', skill));
  renderChipPresets('#pm-preferred-presets', COMMON_SKILLS, state.pmPreferredSkills, (skill) => toggleChip('pmPreferredSkills', skill));
  renderChipList('#pm-required-chips', state.pmRequiredSkills, (skill) => toggleChip('pmRequiredSkills', skill));
  renderChipList('#pm-preferred-chips', state.pmPreferredSkills, (skill) => toggleChip('pmPreferredSkills', skill));
  renderYearsPresets();
  $('#position-modal').classList.remove('hidden');
}

function closePositionModal() {
  $('#position-modal').classList.add('hidden');
}

/** 공통 스킬 버튼 행: 클릭하면 바로 해당 배열에 토글되고(이미 있으면 제거), 선택 상태를 시각적으로 표시. */
function renderChipPresets(containerSel, presetList, selectedArr, onToggle) {
  const el = $(containerSel);
  el.innerHTML = presetList
    .map((skill) => `<button type="button" class="chip-preset-btn ${selectedArr.includes(skill) ? 'selected' : ''}" data-skill="${escapeHtml(skill)}">${escapeHtml(skill)}</button>`)
    .join('');
  el.querySelectorAll('.chip-preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => onToggle(btn.dataset.skill));
  });
}

/** 선택된 스킬을 칩(X 버튼 포함)으로 표시한다. */
function renderChipList(containerSel, selectedArr, onRemove) {
  const el = $(containerSel);
  if (selectedArr.length === 0) {
    el.innerHTML = '<span class="hint">아직 선택된 것이 없습니다.</span>';
    return;
  }
  el.innerHTML = selectedArr
    .map((skill) => `<span class="chip">${escapeHtml(skill)}<button type="button" class="chip-remove" data-skill="${escapeHtml(skill)}">✕</button></span>`)
    .join('');
  el.querySelectorAll('.chip-remove').forEach((btn) => {
    btn.addEventListener('click', () => onRemove(btn.dataset.skill));
  });
}

function toggleChip(stateKey, skill) {
  const arr = state[stateKey];
  const idx = arr.indexOf(skill);
  if (idx === -1) arr.push(skill);
  else arr.splice(idx, 1);
  const presetsSel = stateKey === 'pmRequiredSkills' ? '#pm-required-presets' : '#pm-preferred-presets';
  const chipsSel = stateKey === 'pmRequiredSkills' ? '#pm-required-chips' : '#pm-preferred-chips';
  renderChipPresets(presetsSel, COMMON_SKILLS, arr, (s) => toggleChip(stateKey, s));
  renderChipList(chipsSel, arr, (s) => toggleChip(stateKey, s));
}

function renderYearsPresets() {
  const el = $('#pm-years-presets');
  el.innerHTML = MIN_YEARS_PRESETS.map(
    (opt) => `<button type="button" class="chip-preset-btn ${state.pmMinYears === opt.value ? 'selected' : ''}" data-value="${opt.value === null ? '' : opt.value}">${opt.label}</button>`,
  ).join('');
  el.querySelectorAll('.chip-preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.pmMinYears = btn.dataset.value === '' ? null : Number(btn.dataset.value);
      renderYearsPresets();
    });
  });
}

function addCustomSkill(stateKey, inputSel) {
  const input = $(inputSel);
  const val = input.value.trim();
  if (!val) return;
  if (!state[stateKey].includes(val)) toggleChip(stateKey, val);
  input.value = '';
}

async function savePositionFromModal() {
  const fields = {
    title: $('#pm-title').value.trim(),
    requiredSkills: [...state.pmRequiredSkills],
    preferredSkills: [...state.pmPreferredSkills],
    minYears: state.pmMinYears,
  };
  if (state.editingPositionId) {
    state.currentPosition = await window.horong.editPositionFields(state.editingPositionId, fields);
  } else {
    const created = await window.horong.createPosition(fields);
    state.currentPosition = created;
  }
  closePositionModal();
  await refreshPositionList();
  renderPositionView();
}

async function deleteCurrentPosition() {
  if (!state.currentPosition) return;
  const ok = confirm(`"${state.currentPosition.title || '이 포지션'}"을(를) 삭제할까요? 지원자 데이터도 함께 삭제됩니다.`);
  if (!ok) return;
  await window.horong.deletePosition(state.currentPosition.id);
  state.currentPosition = null;
  await refreshPositionList();
  renderPositionView();
}

// ============================================================
// 1. 소싱 탭
// ============================================================

function urlCheckBadgeHtml(channelName) {
  const result = state.urlCheckResults[channelName];
  if (!result) return '';
  if (result.pending) return '<span class="url-check-badge pending">확인 중…</span>';
  if (result.reachable) return '<span class="url-check-badge ok">✓ 접속됨</span>';
  return `<span class="url-check-badge fail">✕ 확인 안 됨${result.error ? ` (${escapeHtml(result.error)})` : ''}</span>`;
}

function renderJobPostTab() {
  const p = state.currentPosition;
  const panel = $('#tab-jobpost');
  const channelsHtml = p.sourcing.channels
    .map(
      (ch, idx) => `
      <div class="channel-row">
        <label class="channel-check">
          <input type="checkbox" data-idx="${idx}" class="channel-posted" ${ch.posted ? 'checked' : ''} />
          ${escapeHtml(ch.name)}
        </label>
        <input type="text" data-idx="${idx}" class="channel-url" placeholder="공고 URL을 붙여넣으면 자동으로 살아있는지 확인합니다" value="${escapeHtml(ch.url)}" />
        <button type="button" class="secondary btn-check-url" data-idx="${idx}" data-name="${escapeHtml(ch.name)}">자동확인</button>
        ${urlCheckBadgeHtml(ch.name)}
      </div>`,
    )
    .join('');

  panel.innerHTML = `
    <div class="panel-card">
      <h3>1. 채용공고 등록 현황</h3>
      <p class="hint">각 채널에 공고를 올리고 URL을 붙여넣으면, 직접 체크하지 않아도 "자동확인" 버튼이 링크가 살아있는지 확인해줍니다 (공고 내용 자체를 읽어오는 건 아니고, 링크가 살아있는지만 확인합니다).</p>
      <div class="channel-list">${channelsHtml}</div>
      <button id="btn-save-jobpost" class="primary">저장</button>
      <span id="jobpost-save-status" class="status"></span>
    </div>
  `;

  panel.querySelector('#btn-save-jobpost').addEventListener('click', async () => {
    const channels = p.sourcing.channels.map((ch, idx) => ({
      name: ch.name,
      posted: panel.querySelector(`.channel-posted[data-idx="${idx}"]`).checked,
      url: panel.querySelector(`.channel-url[data-idx="${idx}"]`).value.trim(),
    }));
    state.currentPosition = await window.horong.updateSourcing(p.id, channels, p.sourcing.notes);
    panel.querySelector('#jobpost-save-status').textContent = '저장됨';
    await refreshPositionList();
  });

  panel.querySelectorAll('.btn-check-url').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const idx = btn.dataset.idx;
      const name = btn.dataset.name;
      const url = panel.querySelector(`.channel-url[data-idx="${idx}"]`).value.trim();
      if (!url) {
        state.urlCheckResults[name] = { reachable: false, error: 'URL을 먼저 입력해주세요' };
        renderJobPostTab();
        return;
      }
      state.urlCheckResults[name] = { pending: true };
      renderJobPostTab();
      const result = await window.horong.checkUrlReachable(url);
      state.urlCheckResults[name] = result;
      if (result.reachable) {
        const channels = p.sourcing.channels.map((ch, i) => ({
          name: ch.name,
          posted: i === Number(idx) ? true : panel.querySelector(`.channel-posted[data-idx="${i}"]`).checked,
          url: panel.querySelector(`.channel-url[data-idx="${i}"]`).value.trim(),
        }));
        state.currentPosition = await window.horong.updateSourcing(p.id, channels, p.sourcing.notes);
        await refreshPositionList();
      }
      renderJobPostTab();
    });
  });
}

function renderSourcingTab() {
  const p = state.currentPosition;
  const panel = $('#tab-sourcing');
  panel.innerHTML = `
    <div class="panel-card">
      <h3>2. 채용풀 직접 소싱</h3>
      <p class="hint">공고 게재와 별개로, 지인 추천·서치펌·커뮤니티 등 직접 후보자를 찾는 활동을 기록하세요.</p>
      <textarea id="sourcing-notes" rows="8" placeholder="예: OO커뮤니티에 공유함, 지인 추천 2명 컨택 예정, LinkedIn에서 직접 메시지 발송...">${escapeHtml(p.sourcing.notes)}</textarea>
      <button id="btn-save-sourcing" class="primary">저장</button>
      <span id="sourcing-save-status" class="status"></span>
    </div>
  `;

  panel.querySelector('#btn-save-sourcing').addEventListener('click', async () => {
    const notes = panel.querySelector('#sourcing-notes').value;
    state.currentPosition = await window.horong.updateSourcing(p.id, p.sourcing.channels, notes);
    panel.querySelector('#sourcing-save-status').textContent = '저장됨';
    await refreshPositionList();
  });
}

// ============================================================
// 2. 서류스크리닝 탭
// ============================================================

function scoreColor(score) {
  if (score >= 80) return 'var(--ok)';
  if (score >= 50) return 'var(--orange)';
  return 'var(--danger)';
}

function highlightKeywords(text, keywords) {
  const escaped = escapeHtml(text);
  const unique = [...new Set((keywords || []).filter(Boolean))].sort((a, b) => b.length - a.length);
  if (unique.length === 0) return escaped;
  const pattern = unique.map((kw) => kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const re = new RegExp(`(${pattern})`, 'gi');
  return escaped.replace(re, '<mark>$1</mark>');
}

function renderScreeningTab() {
  const p = state.currentPosition;
  const panel = $('#tab-screening');
  const fileListHtml = state.selectedFiles
    .map((fp) => {
      const name = fp.split(/[\\/]/).pop();
      return `<li>${escapeHtml(name)}</li>`;
    })
    .join('');

  const rows = p.candidates
    .map((r, idx) => {
      const stageOptions = Object.entries(STAGE_LABEL)
        .map(([key, label]) => `<option value="${key}" ${r.stage === key ? 'selected' : ''}>${label}</option>`)
        .join('');
      return `
        <tr>
          <td>#${idx + 1}</td>
          <td class="candidate-cell">
            <span class="candidate-name">${escapeHtml(r.candidateName || '(이름 미확인)')}</span>
            <span class="candidate-file">${escapeHtml(r.fileName)}</span>
          </td>
          <td>
            <div class="score-cell">
              <span class="score-num" style="color:${scoreColor(r.score)}">${r.score}</span>
              <div class="score-bar-track"><div class="score-bar-fill" style="width:${r.score}%; background:${scoreColor(r.score)}"></div></div>
            </div>
          </td>
          <td>${(r.matchedRequired || []).map((s) => `<span class="tag">✓ ${escapeHtml(s)}</span>`).join('')}${(r.missingRequired || []).map((s) => `<span class="tag missing">✕ ${escapeHtml(s)}</span>`).join('')}</td>
          <td>${r.estimatedYears === null ? '확인 필요' : `${r.estimatedYears}년`}</td>
          <td>
            <select class="stage-select" data-candidate="${r.id}">${stageOptions}</select>
          </td>
          <td><button class="detail-btn" data-candidate="${r.id}">상세보기</button></td>
        </tr>`;
    })
    .join('');

  panel.innerHTML = `
    <div class="panel-card">
      <h3>이력서 업로드</h3>
      <p class="hint">지원 형식: PDF · DOCX · TXT. 파일은 이 PC에서만 열리고 분석됩니다.</p>
      <div class="upload-actions">
        <button id="btn-select-files" class="primary">파일 선택…</button>
        <button id="btn-select-folder" class="primary">폴더 선택 (일괄)…</button>
      </div>
      <div class="file-list-header">
        <span>선택된 파일 ${state.selectedFiles.length}개</span>
        <button id="btn-clear-files" class="link-btn">목록 비우기</button>
      </div>
      <ul class="file-list">${fileListHtml}</ul>
      <button id="btn-run-screening" class="primary run-btn" ${state.selectedFiles.length === 0 ? 'disabled' : ''}>스크리닝 시작</button>
      <p id="screening-status" class="status"></p>
    </div>
    <div class="panel-card">
      <div class="results-header">
        <h3>지원자 목록 (${p.candidates.length}명, 점수 높은 순)</h3>
        <div class="export-group">
          <button id="btn-export-xlsx" class="secondary" ${p.candidates.length === 0 ? 'disabled' : ''}>엑셀로 내보내기</button>
          <button id="btn-export-csv" class="secondary" ${p.candidates.length === 0 ? 'disabled' : ''}>CSV로 내보내기</button>
        </div>
      </div>
      ${
        p.candidates.length === 0
          ? '<p class="empty-state">아직 지원자가 없습니다. 이력서를 업로드하고 스크리닝을 시작하세요.</p>'
          : `<table class="data-table"><thead><tr><th>순위</th><th>지원자</th><th>점수</th><th>필수매칭</th><th>추정경력</th><th>단계</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
      }
    </div>
  `;

  panel.querySelector('#btn-select-files').addEventListener('click', async () => {
    const files = await window.horong.selectResumeFiles();
    if (files.length) addFiles(files);
  });
  panel.querySelector('#btn-select-folder').addEventListener('click', async () => {
    const { filePaths, folderPath, truncated } = await window.horong.selectResumeFolder();
    if (!folderPath) return;
    if (filePaths.length) {
      addFiles(filePaths);
      panel.querySelector('#screening-status').textContent = truncated
        ? `폴더에서 ${filePaths.length}건까지만 불러왔습니다 (담기 개수 제한).`
        : `폴더에서 이력서 ${filePaths.length}건 찾음`;
    } else {
      panel.querySelector('#screening-status').textContent = '선택한 폴더에서 PDF/DOCX/TXT 파일을 찾지 못했습니다.';
    }
  });
  panel.querySelector('#btn-clear-files').addEventListener('click', () => {
    state.selectedFiles = [];
    renderScreeningTab();
  });
  panel.querySelector('#btn-run-screening').addEventListener('click', async () => {
    panel.querySelector('#screening-status').textContent = `${state.selectedFiles.length}건 분석 중… (전부 이 PC 안에서 처리됩니다)`;
    const { position, errors } = await window.horong.screenCandidates(p.id, state.selectedFiles);
    state.currentPosition = position;
    state.selectedFiles = [];
    await refreshPositionList();
    renderPositionView();
    $('#tab-screening').querySelector('#screening-status').textContent = errors.length
      ? `완료 (${errors.length}건 실패: ${errors.map((e) => e.message).join('; ')})`
      : '완료';
  });
  panel.querySelector('#btn-export-csv').addEventListener('click', async () => {
    const csv = toCsv(p.candidates);
    const res = await window.horong.exportCsv(csv, `${p.title || '결과'}_스크리닝결과.csv`);
    panel.querySelector('#screening-status').textContent = res.saved ? `저장됨: ${res.filePath}` : '내보내기 취소됨';
  });
  panel.querySelector('#btn-export-xlsx').addEventListener('click', async () => {
    const records = toRecords(p.candidates);
    const res = await window.horong.exportXlsx(records, `${p.title || '결과'}_스크리닝결과.xlsx`);
    panel.querySelector('#screening-status').textContent = res.saved ? `저장됨: ${res.filePath}` : '내보내기 취소됨';
  });
  panel.querySelectorAll('.stage-select').forEach((sel) => {
    sel.addEventListener('change', async (e) => {
      state.currentPosition = await window.horong.setCandidateStage(p.id, e.target.dataset.candidate, e.target.value);
      await refreshPositionList();
      renderPositionView();
    });
  });
  panel.querySelectorAll('.detail-btn').forEach((btn) => {
    btn.addEventListener('click', () => openCandidateDetail(btn.dataset.candidate));
  });
}

function addFiles(paths) {
  const set = new Set(state.selectedFiles);
  for (const p of paths) set.add(p);
  state.selectedFiles = Array.from(set);
  renderScreeningTab();
}

function toRecords(candidates) {
  return candidates.map((r, idx) => ({
    순위: idx + 1,
    지원자: r.candidateName || '',
    파일명: r.fileName,
    점수: r.score,
    단계: STAGE_LABEL[r.stage] || r.stage,
    필수매칭: (r.matchedRequired || []).join(' / '),
    필수누락: (r.missingRequired || []).join(' / '),
    우대매칭: (r.matchedPreferred || []).join(' / '),
    추정경력: r.estimatedYears === null ? '' : r.estimatedYears,
    학력: r.education || '',
    이메일: r.contact?.email || '',
    전화번호: r.contact?.phone || '',
  }));
}

function toCsv(candidates) {
  const records = toRecords(candidates);
  const header = Object.keys(records[0] || {});
  const lines = [header.join(',')];
  for (const rec of records) {
    lines.push(header.map((h) => `"${String(rec[h]).replace(/"/g, '""')}"`).join(','));
  }
  return '\uFEFF' + lines.join('\n');
}

async function openCandidateDetail(candidateId) {
  const p = state.currentPosition;
  const r = p.candidates.find((c) => c.id === candidateId);
  if (!r) return;
  $('#detail-filename').textContent = r.candidateName ? `${r.candidateName} (${r.fileName})` : r.fileName;
  const body = $('#detail-body');
  body.innerHTML = '<p class="hint">원문 불러오는 중…</p>';
  $('#detail-modal').classList.remove('hidden');

  const contactLine = [r.contact?.email, r.contact?.phone].filter(Boolean).join(' · ') || '연락처 자동 인식 안 됨';
  let rawText = '';
  let failed = false;
  try {
    rawText = r.filePath ? await window.horong.getResumeText(r.filePath) : '';
  } catch (e) {
    rawText = `원문을 다시 불러오지 못했습니다: ${e.message}`;
    failed = true;
  }
  const preview = (rawText || '').slice(0, 4000);
  const highlighted = failed ? escapeHtml(preview) : highlightKeywords(preview, [...(r.matchedRequired || []), ...(r.matchedPreferred || [])]);

  body.innerHTML = `
    <div class="detail-section">
      <h4>총점: ${r.score}점 (${STAGE_LABEL[r.stage] || r.stage})</h4>
      <p class="hint">필수 ${r.breakdown.requiredScore}/${r.breakdown.weights.required} · 우대 ${r.breakdown.preferredScore}/${r.breakdown.weights.preferred} · 연차 ${r.breakdown.yearsScore}/${r.breakdown.weights.years}</p>
    </div>
    <div class="detail-section">
      <h4>연락처</h4>
      <p>${contactLine}</p>
    </div>
    <div class="detail-section">
      <h4>메모</h4>
      <textarea id="candidate-notes" rows="3" placeholder="담당자 메모...">${escapeHtml(r.notes || '')}</textarea>
      <button id="btn-save-notes" class="secondary">메모 저장</button>
    </div>
    <div class="detail-section">
      <h4>원문 미리보기 <span class="hint">(매칭 키워드 강조)</span></h4>
      <div class="raw-text-preview">${highlighted || '(텍스트를 추출하지 못했습니다)'}</div>
    </div>
  `;
  body.querySelector('#btn-save-notes').addEventListener('click', async () => {
    const notes = body.querySelector('#candidate-notes').value;
    state.currentPosition = await window.horong.setCandidateNote(p.id, candidateId, notes);
    await refreshPositionList();
  });
}

// ============================================================
// 4. 이력서 분석 (AI) 탭
// ============================================================

function renderAnalysisTab() {
  const p = state.currentPosition;
  const panel = $('#tab-analysis');

  if (p.candidates.length === 0) {
    panel.innerHTML = `<div class="panel-card"><p class="empty-state">서류스크리닝 탭에서 이력서를 먼저 업로드해주세요.</p></div>`;
    return;
  }

  const llmReady = state.settings && state.settings.llm && state.settings.llm.apiKey;
  const noticeHtml = llmReady
    ? ''
    : `<div class="panel-card"><p class="hint">AI 분석을 쓰려면 먼저 <button class="link-btn" id="btn-goto-settings-from-analysis">LLM 설정</button>에서 본인의 API 키를 등록해주세요. 이력서 원문은 이름/연락처를 마스킹 처리한 뒤에만 전송됩니다.</p></div>`;

  const cardsHtml = p.candidates
    .map((c) => {
      const a = c.aiAnalysis;
      if (!a) {
        return `
          <div class="panel-card">
            <h4>${escapeHtml(c.candidateName || c.fileName)} <span class="hint">규칙기반 점수 ${c.score}점</span></h4>
            <button class="secondary btn-analyze" data-candidate="${c.id}" ${llmReady ? '' : 'disabled'}>AI 분석 실행</button>
          </div>`;
      }
      return `
        <div class="panel-card analysis-card">
          <h4>${escapeHtml(c.candidateName || c.fileName)} <span class="fit-score-badge">${a.fitScore ?? '-'}점</span></h4>
          <p>${escapeHtml(a.summary || '')}</p>
          <p class="hint">강점</p>
          <ul class="analysis-list">${(a.strengths || []).map((s) => `<li>${escapeHtml(s)}</li>`).join('') || '<li>-</li>'}</ul>
          <p class="hint">우려사항</p>
          <ul class="analysis-list">${(a.concerns || []).map((s) => `<li>${escapeHtml(s)}</li>`).join('') || '<li>-</li>'}</ul>
          <p class="hint">면접 추천 질문</p>
          <ul class="analysis-list">${(a.recommendedQuestions || []).map((s) => `<li>${escapeHtml(s)}</li>`).join('') || '<li>-</li>'}</ul>
          <span class="masked-note">개인정보 마스킹 후 전송됨 (${(a.maskedFields || []).join(', ') || '마스킹 대상 없음'})</span>
          <div><button class="secondary btn-analyze" data-candidate="${c.id}" ${llmReady ? '' : 'disabled'}>다시 분석</button></div>
        </div>`;
    })
    .join('');

  panel.innerHTML = `${noticeHtml}<div class="panel-card"><h3>지원자 AI 분석 (${p.candidates.length}명)</h3><p class="hint">규칙기반 점수(서류스크리닝 탭)는 무료이고 즉시 계산되는 1차 필터입니다. 여기서는 그 중 관심 가는 후보자만 골라 AI로 깊이 분석합니다 (호출당 비용이 발생합니다).</p></div>${cardsHtml}`;

  const gotoBtn = panel.querySelector('#btn-goto-settings-from-analysis');
  if (gotoBtn) gotoBtn.addEventListener('click', openSettingsModal);

  panel.querySelectorAll('.btn-analyze').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const candidateId = btn.dataset.candidate;
      btn.disabled = true;
      btn.textContent = '분석 중…';
      try {
        state.currentPosition = await window.horong.analyzeCandidate(p.id, candidateId);
        renderAnalysisTab();
      } catch (e) {
        btn.disabled = false;
        btn.textContent = '다시 시도';
        alert(`AI 분석 실패: ${e.message}`);
      }
    });
  });
}

// ============================================================
// 5. 면접 탭
// ============================================================

function renderInterviewTab() {
  const p = state.currentPosition;
  const panel = $('#tab-interview');
  const q = p.interview.questions;

  const questionsHtml = q
    ? `
      <div class="panel-card">
        <h3>기술 질문 (필수 스킬 기반)</h3>
        ${q.technicalQuestions.map((tq) => `
          <div class="question-block">
            <p class="question-main">${escapeHtml(tq.question)}</p>
            <p class="question-followup">↳ ${escapeHtml(tq.followUp)}</p>
            <p class="question-criteria">평가기준: ${tq.evaluationCriteria.map(escapeHtml).join(' / ')}</p>
          </div>`).join('') || '<p class="hint">필수 스킬이 설정되지 않았습니다.</p>'}
      </div>
      <div class="panel-card">
        <h3>우대 스킬 질문</h3>
        ${q.preferredQuestions.map((pq) => `
          <div class="question-block">
            <p class="question-main">${escapeHtml(pq.question)}</p>
            <p class="question-criteria">평가기준: ${pq.evaluationCriteria.map(escapeHtml).join(' / ')}</p>
          </div>`).join('') || '<p class="hint">우대 스킬이 설정되지 않았습니다.</p>'}
      </div>
      <div class="panel-card">
        <h3>공통 역량/컬처핏 질문</h3>
        ${q.behavioralQuestions.map((bq) => `
          <div class="question-block">
            <p class="question-tag">${escapeHtml(bq.category)}</p>
            <p class="question-main">${escapeHtml(bq.question)}</p>
            <p class="question-criteria">평가기준: ${bq.evaluationCriteria.map(escapeHtml).join(' / ')}</p>
          </div>`).join('')}
      </div>
      <div class="panel-card">
        <h3>평가기준표</h3>
        <table class="data-table"><thead><tr><th>항목</th><th>가중치</th></tr></thead><tbody>
          ${q.rubric.map((r) => `<tr><td>${escapeHtml(r.item)}</td><td>${r.weight}%</td></tr>`).join('')}
        </tbody></table>
        <button id="btn-regenerate-questions" class="secondary">다시 생성</button>
      </div>`
    : `<div class="panel-card">
        <h3>구조화 면접 질문지</h3>
        <p class="hint">채용 조건(직무/필수·우대 스킬/최소연차)을 기반으로 질문지와 평가기준표를 자동 생성합니다.</p>
        <button id="btn-generate-questions" class="primary">면접 질문지 생성</button>
      </div>`;

  const interviewCandidates = p.candidates.filter((c) => c.stage === 'interview');
  const candidatesHtml = interviewCandidates
    .map(
      (c) => `
      <div class="panel-card candidate-interview-card">
        <h4>${escapeHtml(c.candidateName || c.fileName)}</h4>
        <label>면접 결과
          <select class="interview-result-select" data-candidate="${c.id}">
            <option value="">선택 안 함</option>
            <option value="pass" ${c.interviewResult?.result === 'pass' ? 'selected' : ''}>합격</option>
            <option value="fail" ${c.interviewResult?.result === 'fail' ? 'selected' : ''}>불합격</option>
            <option value="hold" ${c.interviewResult?.result === 'hold' ? 'selected' : ''}>보류</option>
          </select>
        </label>
        <textarea class="interview-comment" data-candidate="${c.id}" rows="2" placeholder="면접 코멘트...">${escapeHtml(c.interviewResult?.comment || '')}</textarea>
        <button class="secondary btn-save-interview-result" data-candidate="${c.id}">저장 (합격/불합격 시 다음 단계로 자동 이동)</button>
      </div>`,
    )
    .join('');

  panel.innerHTML = `
    ${questionsHtml}
    <div class="panel-card">
      <h3>면접대상 지원자 (${interviewCandidates.length}명)</h3>
      ${interviewCandidates.length === 0 ? '<p class="empty-state">서류스크리닝 탭에서 지원자 단계를 "면접대상"으로 바꾸면 여기 나타납니다.</p>' : candidatesHtml}
    </div>
  `;

  const genBtn = panel.querySelector('#btn-generate-questions') || panel.querySelector('#btn-regenerate-questions');
  if (genBtn) {
    genBtn.addEventListener('click', async () => {
      await window.horong.generateInterviewQuestions(p.id);
      state.currentPosition = await window.horong.getPosition(p.id);
      renderPositionView();
    });
  }
  panel.querySelectorAll('.btn-save-interview-result').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const candidateId = btn.dataset.candidate;
      const resultSel = panel.querySelector(`.interview-result-select[data-candidate="${candidateId}"]`);
      const commentEl = panel.querySelector(`.interview-comment[data-candidate="${candidateId}"]`);
      const result = resultSel.value ? { result: resultSel.value, comment: commentEl.value } : null;
      let updated = await window.horong.setInterviewResult(p.id, candidateId, result);
      if (result?.result === 'pass') updated = await window.horong.setCandidateStage(p.id, candidateId, 'offer');
      if (result?.result === 'fail') updated = await window.horong.setCandidateStage(p.id, candidateId, 'rejected');
      state.currentPosition = updated;
      await refreshPositionList();
      renderPositionView();
    });
  });
}

// ============================================================
// 4. 합격통보 탭
// ============================================================

function renderOfferTab() {
  const p = state.currentPosition;
  const panel = $('#tab-offer');
  const offerCandidates = p.candidates.filter((c) => c.stage === 'offer');
  const rejectedCandidates = p.candidates.filter((c) => c.stage === 'rejected');

  const offerCardsHtml = offerCandidates
    .map(
      (c) => `
      <div class="panel-card">
        <h4>${escapeHtml(c.candidateName || c.fileName)} <span class="hint">합격</span></h4>
        <label>입사 예정일 <input type="text" class="offer-start-date" data-candidate="${c.id}" placeholder="예: 2026-10-01" /></label>
        <button class="secondary btn-gen-offer" data-candidate="${c.id}">합격 메일 생성</button>
        <div class="email-preview hidden" id="offer-preview-${c.id}"></div>
      </div>`,
    )
    .join('');

  const rejectedCardsHtml = rejectedCandidates
    .map(
      (c) => `
      <div class="panel-card">
        <h4>${escapeHtml(c.candidateName || c.fileName)} <span class="hint">불합격</span></h4>
        <button class="secondary btn-gen-rejection" data-candidate="${c.id}">불합격 메일 생성</button>
        <div class="email-preview hidden" id="rejection-preview-${c.id}"></div>
      </div>`,
    )
    .join('');

  panel.innerHTML = `
    <div class="panel-card">
      <h3>회사명</h3>
      <p class="hint">메일 초안에 들어갈 회사명입니다.</p>
      <input type="text" id="company-name-input" value="${escapeHtml(state.companyName)}" placeholder="예: 호롱컴퍼니" />
    </div>
    <div class="panel-card">
      <h3>합격 통보 대상 (${offerCandidates.length}명)</h3>
      ${offerCandidates.length === 0 ? '<p class="empty-state">면접 탭에서 결과를 "합격"으로 저장하면 여기 나타납니다.</p>' : offerCardsHtml}
    </div>
    <div class="panel-card">
      <h3>불합격 통보 대상 (${rejectedCandidates.length}명)</h3>
      ${rejectedCandidates.length === 0 ? '<p class="empty-state">면접 탭에서 결과를 "불합격"으로 저장하면 여기 나타납니다.</p>' : rejectedCardsHtml}
    </div>
  `;

  panel.querySelector('#company-name-input').addEventListener('change', (e) => {
    state.companyName = e.target.value;
  });

  panel.querySelectorAll('.btn-gen-offer').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const candidateId = btn.dataset.candidate;
      const startDate = panel.querySelector(`.offer-start-date[data-candidate="${candidateId}"]`).value;
      const { subject, body } = await window.horong.generateOfferEmail(p.id, candidateId, { companyName: state.companyName, startDate });
      showEmailPreview(`offer-preview-${candidateId}`, subject, body);
    });
  });
  panel.querySelectorAll('.btn-gen-rejection').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const candidateId = btn.dataset.candidate;
      const { subject, body } = await window.horong.generateRejectionEmail(p.id, candidateId, { companyName: state.companyName });
      showEmailPreview(`rejection-preview-${candidateId}`, subject, body);
    });
  });
}

function showEmailPreview(elId, subject, body) {
  const el = document.getElementById(elId);
  el.classList.remove('hidden');
  const fullText = `제목: ${subject}\n\n${body}`;
  el.innerHTML = `
    <p class="email-subject">제목: ${escapeHtml(subject)}</p>
    <pre class="email-body">${escapeHtml(body)}</pre>
    <button class="link-btn btn-copy-email">클립보드에 복사</button>
  `;
  el.querySelector('.btn-copy-email').addEventListener('click', async () => {
    await navigator.clipboard.writeText(fullText);
    el.querySelector('.btn-copy-email').textContent = '복사됨!';
  });
}

// ============================================================
// 5. 온보딩 탭
// ============================================================

function renderOnboardingTab() {
  const p = state.currentPosition;
  const panel = $('#tab-onboarding');
  const checklist = p.onboarding.checklist;
  const checkedSet = new Set(p.onboarding.checkedItems || []);
  const hiredCandidates = p.candidates.filter((c) => c.stage === 'hired');
  const offerCandidates = p.candidates.filter((c) => c.stage === 'offer');

  const stagesHtml = checklist
    ? checklist.stages
        .map(
          (stage) => `
        <div class="panel-card">
          <h3>${escapeHtml(stage.label)}</h3>
          <ul class="checklist">
            ${stage.items
              .map((item, idx) => {
                const key = `${stage.key}:${idx}`;
                const checked = checkedSet.has(key);
                return `<li><label><input type="checkbox" class="onboarding-item" data-key="${key}" ${checked ? 'checked' : ''} /> <span class="${checked ? 'checked-text' : ''}">${escapeHtml(item)}</span></label></li>`;
              })
              .join('')}
          </ul>
        </div>`,
        )
        .join('')
    : `<div class="panel-card">
        <h3>온보딩 체크리스트</h3>
        <p class="hint">직무 특성(개발/비개발 등)을 반영해 입사전/첫날/첫주/첫달 체크리스트를 생성합니다.</p>
        <button id="btn-generate-checklist" class="primary">체크리스트 생성</button>
      </div>`;

  const readyHtml = offerCandidates
    .map(
      (c) => `
      <div class="hire-row">
        <span>${escapeHtml(c.candidateName || c.fileName)} <span class="hint">(합격, 입사확정 대기)</span></span>
        <button class="secondary btn-mark-hired" data-candidate="${c.id}">입사확정으로 변경</button>
      </div>`,
    )
    .join('');

  const hiredHtml = hiredCandidates
    .map(
      (c) => `
      <div class="hire-card">
        <h4>${escapeHtml(c.candidateName || c.fileName)}</h4>
        <p class="hint">${[c.contact?.email, c.contact?.phone].filter(Boolean).join(' · ') || '연락처 미확인'}</p>
      </div>`,
    )
    .join('');

  panel.innerHTML = `
    ${stagesHtml}
    <div class="panel-card">
      <h3>입사확정 처리</h3>
      ${offerCandidates.length === 0 ? '<p class="empty-state">합격 통보 대상이 없습니다.</p>' : readyHtml}
    </div>
    <div class="panel-card">
      <h3>입사 확정자 (${hiredCandidates.length}명)</h3>
      ${hiredCandidates.length === 0 ? '<p class="empty-state">아직 없습니다.</p>' : hiredHtml}
    </div>
  `;

  const genBtn = panel.querySelector('#btn-generate-checklist');
  if (genBtn) {
    genBtn.addEventListener('click', async () => {
      await window.horong.generateOnboardingChecklist(p.id);
      state.currentPosition = await window.horong.getPosition(p.id);
      renderPositionView();
    });
  }
  panel.querySelectorAll('.onboarding-item').forEach((cb) => {
    cb.addEventListener('change', async () => {
      state.currentPosition = await window.horong.toggleOnboardingItem(p.id, cb.dataset.key);
      renderPositionView();
    });
  });
  panel.querySelectorAll('.btn-mark-hired').forEach((btn) => {
    btn.addEventListener('click', async () => {
      state.currentPosition = await window.horong.setCandidateStage(p.id, btn.dataset.candidate, 'hired');
      await refreshPositionList();
      renderPositionView();
    });
  });
}

// ============================================================
// 초기화 / 전역 이벤트
// ============================================================

// ============================================================
// 설정 (LLM 연결) 모달
// ============================================================

function openSettingsModal() {
  const llm = (state.settings && state.settings.llm) || { provider: 'openai', apiKey: '', baseUrl: '', model: 'gpt-4o-mini' };
  $('#settings-provider').value = llm.provider;
  $('#settings-baseurl').value = llm.baseUrl || '';
  $('#settings-apikey').value = llm.apiKey || '';
  $('#settings-model').value = llm.model || '';
  $('#settings-status').textContent = '';
  $('#settings-modal').classList.remove('hidden');
}

function closeSettingsModal() {
  $('#settings-modal').classList.add('hidden');
}

async function saveSettingsFromModal() {
  const fields = {
    provider: $('#settings-provider').value,
    baseUrl: $('#settings-baseurl').value.trim(),
    apiKey: $('#settings-apikey').value.trim(),
    model: $('#settings-model').value.trim(),
  };
  state.settings = await window.horong.saveLLMSettings(fields);
  $('#settings-status').textContent = '저장됨';
  if (state.currentPosition) renderAnalysisTab();
}

async function testLLMConnectionFromModal() {
  $('#settings-status').textContent = '연결 확인 중… (저장되지 않은 필드는 먼저 저장 후 테스트해주세요)';
  await saveSettingsFromModal();
  const result = await window.horong.testLLMConnection();
  $('#settings-status').textContent = result.ok ? `연결 성공 (응답: ${result.reply})` : `연결 실패: ${result.error}`;
}

function bindGlobalEvents() {
  $('#btn-new-position').addEventListener('click', () => openPositionModal(null));
  $('#btn-edit-position').addEventListener('click', () => openPositionModal(state.currentPosition));
  $('#btn-delete-position').addEventListener('click', deleteCurrentPosition);
  $('#btn-close-position-modal').addEventListener('click', closePositionModal);
  $('#btn-save-position').addEventListener('click', savePositionFromModal);
  $('#position-modal').addEventListener('click', (e) => {
    if (e.target.id === 'position-modal') closePositionModal();
  });

  $('#pm-required-add').addEventListener('click', () => addCustomSkill('pmRequiredSkills', '#pm-required-input'));
  $('#pm-preferred-add').addEventListener('click', () => addCustomSkill('pmPreferredSkills', '#pm-preferred-input'));
  $('#pm-required-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addCustomSkill('pmRequiredSkills', '#pm-required-input'); }
  });
  $('#pm-preferred-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addCustomSkill('pmPreferredSkills', '#pm-preferred-input'); }
  });

  $('#btn-close-detail-modal').addEventListener('click', () => $('#detail-modal').classList.add('hidden'));
  $('#detail-modal').addEventListener('click', (e) => {
    if (e.target.id === 'detail-modal') $('#detail-modal').classList.add('hidden');
  });

  $('#btn-open-settings').addEventListener('click', openSettingsModal);
  $('#btn-close-settings-modal').addEventListener('click', closeSettingsModal);
  $('#btn-save-settings').addEventListener('click', saveSettingsFromModal);
  $('#btn-test-llm').addEventListener('click', testLLMConnectionFromModal);
  $('#settings-modal').addEventListener('click', (e) => {
    if (e.target.id === 'settings-modal') closeSettingsModal();
  });

  $('#tab-nav').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (btn) switchTab(btn.dataset.tab);
  });
}

async function init() {
  bindGlobalEvents();
  state.settings = await window.horong.getSettings();
  await refreshPositionList();
  renderPositionView();
}

init();
