/* ═══════════════════════════════════════════════════
   app.js — 초기화, 탭 전환, 검색, 모달, 다크모드
   ═══════════════════════════════════════════════════ */

// ── 전역 상태 ───────────────────────────────────────
let state = {
  month: 4,
  type: 'weekday',
  view: 'grid',       // 'grid' | 'list'
  query: '',
  timetable: null,
};

let searchTimer = null;

// ── 유틸 ────────────────────────────────────────────
function today() {
  return new Date();
}

function todayStr() {
  return today().toLocaleDateString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short'
  }).replace(/\. /g, '-').replace('.', '');
}

function setLoading(on) {
  document.getElementById('loading-overlay').style.display = on ? 'flex' : 'none';
}

// ── URL 파라미터 ────────────────────────────────────
function readUrlParams() {
  const params = new URLSearchParams(location.search);
  if (params.has('month')) state.month = parseInt(params.get('month')) || state.month;
  if (params.has('type'))  state.type  = params.get('type') || state.type;
  if (params.has('q'))     state.query = params.get('q');
  if (params.has('view'))  state.view  = params.get('view');
}

function pushUrl() {
  const params = new URLSearchParams();
  params.set('month', state.month);
  params.set('type', state.type);
  if (state.query) params.set('q', state.query);
  params.set('view', state.view);
  history.replaceState(null, '', '?' + params.toString());
}

// ── 탭 초기화 ───────────────────────────────────────
function initTabs(availableFiles) {
  const monthTabEl = document.getElementById('month-tabs');
  const typeTabEl  = document.getElementById('type-tabs');
  monthTabEl.innerHTML = '';
  typeTabEl.innerHTML  = '';

  // 오늘 날짜 기준으로 기본 월 설정
  const todayMonth = today().getMonth() + 1;
  const months = [4, 5, 6, 7, 8];
  const hasFile = (m, t) => availableFiles.some(f => f.month === m && f.type === t);

  // 현재 state.month가 파일이 없으면 가장 가까운 월로 변경
  if (!hasFile(state.month, state.type)) {
    const closest = months.find(m => hasFile(m, 'weekday') || hasFile(m, 'weekend'));
    if (closest) state.month = closest;
  }

  months.forEach(m => {
    const hasAny = hasFile(m, 'weekday') || hasFile(m, 'weekend');
    const btn = document.createElement('button');
    btn.className = `btn btn-sm ${m === state.month ? 'btn-primary' : 'btn-outline-secondary'}`;
    btn.textContent = `${m}월`;
    btn.disabled = !hasAny;
    btn.dataset.month = m;
    if (m === todayMonth) btn.innerHTML += ' <span class="badge bg-danger" style="font-size:0.55rem">오늘</span>';
    btn.addEventListener('click', () => switchMonth(m));
    monthTabEl.appendChild(btn);
  });

  ['weekday', 'weekend'].forEach(t => {
    const label = t === 'weekday' ? '평일' : '주말';
    const btn = document.createElement('button');
    btn.className = `btn btn-sm ${t === state.type ? 'btn-primary' : 'btn-outline-secondary'}`;
    btn.textContent = label;
    btn.disabled = !hasFile(state.month, t);
    btn.dataset.type = t;
    btn.addEventListener('click', () => switchType(t));
    typeTabEl.appendChild(btn);
  });
}

function refreshTabHighlight() {
  document.querySelectorAll('#month-tabs button').forEach(btn => {
    const m = parseInt(btn.dataset.month);
    btn.className = `btn btn-sm ${m === state.month ? 'btn-primary' : 'btn-outline-secondary'}`;
    if (btn.querySelector('.badge')) {
      const badge = btn.querySelector('.badge');
      btn.textContent = `${m}월 `;
      btn.appendChild(badge);
    }
  });
  document.querySelectorAll('#type-tabs button').forEach(btn => {
    btn.className = `btn btn-sm ${btn.dataset.type === state.type ? 'btn-primary' : 'btn-outline-secondary'}`;
  });
}

async function switchMonth(m) {
  state.month = m;
  refreshTabHighlight();
  await loadData();
}

async function switchType(t) {
  state.type = t;
  refreshTabHighlight();
  await loadData();
}

// ── 데이터 로드 ─────────────────────────────────────
async function loadData() {
  setLoading(true);
  try {
    const data = await Api.getTimetable(state.month, state.type);
    state.timetable = data;

    List.setCourses(data.courses);
    updateFilterOptions(data.courses);
    updateSummaryBanner(data.courses);
    render();
    pushUrl();
  } catch (e) {
    console.error(e);
    document.getElementById('grid-view').innerHTML =
      `<div class="empty-state text-danger">⚠️ 데이터를 불러오지 못했습니다.</div>`;
  } finally {
    setLoading(false);
  }
}

// ── 요약 배너 (F6) ──────────────────────────────────
function updateSummaryBanner(courses) {
  const active = courses.filter(c => c.진행상태 === '진행중').length;
  const todayStart = courses.filter(c => c.진행상태 === '오늘개강').length;
  const banner = document.getElementById('summary-banner');

  if (active === 0 && todayStart === 0) {
    banner.style.display = 'none';
    return;
  }
  banner.style.display = '';
  banner.innerHTML = `📌 현재 진행 중인 과정 <strong>${active}</strong>개
    ${todayStart > 0 ? `&nbsp;|&nbsp; 오늘 개강 <strong class="text-primary">${todayStart}</strong>개` : ''}`;
}

// ── 뷰 렌더링 ───────────────────────────────────────
function render() {
  if (!state.timetable) return;

  const sortBar = document.getElementById('sort-bar');

  if (state.view === 'grid') {
    document.getElementById('grid-view').style.display = '';
    document.getElementById('list-view').style.display = 'none';
    sortBar.style.display = 'none';
    Grid.render(state.timetable, openModal);
  } else {
    document.getElementById('grid-view').style.display = 'none';
    document.getElementById('list-view').style.display = '';
    sortBar.style.display = '';
    List.render(state.query, openModal);
  }
}

// ── 뷰 전환 버튼 ────────────────────────────────────
function initViewToggle() {
  document.getElementById('btn-grid').addEventListener('click', () => {
    state.view = 'grid';
    document.getElementById('btn-grid').classList.add('active');
    document.getElementById('btn-list').classList.remove('active');
    render();
    pushUrl();
  });
  document.getElementById('btn-list').addEventListener('click', () => {
    state.view = 'list';
    document.getElementById('btn-list').classList.add('active');
    document.getElementById('btn-grid').classList.remove('active');
    render();
    pushUrl();
  });
  // 초기 상태
  if (state.view === 'list') {
    document.getElementById('btn-list').classList.add('active');
    document.getElementById('btn-grid').classList.remove('active');
  } else {
    document.getElementById('btn-grid').classList.add('active');
    document.getElementById('btn-list').classList.remove('active');
  }
}

// ── 검색 (F3) ───────────────────────────────────────
function initSearch() {
  const input = document.getElementById('search-input');
  const clearBtn = document.getElementById('search-clear');

  input.value = state.query;

  input.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.query = input.value.trim();
      clearBtn.style.display = state.query ? '' : 'none';

      // 검색 시 목록 뷰로 자동 전환
      if (state.query.length >= 2 && state.view === 'grid') {
        state.view = 'list';
        document.getElementById('btn-list').classList.add('active');
        document.getElementById('btn-grid').classList.remove('active');
      }
      render();
      pushUrl();
    }, 300);
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    state.query = '';
    clearBtn.style.display = 'none';
    render();
    pushUrl();
  });

  clearBtn.style.display = state.query ? '' : 'none';
}

// ── 필터 (N1) ───────────────────────────────────────
function initFilters() {
  // 강사/강의실 필터는 데이터 로드 후 동적 생성
  document.getElementById('filter-reset').addEventListener('click', () => {
    document.getElementById('filter-teacher').value = '';
    document.getElementById('filter-room').value = '';
    applyFilters();
  });
  document.getElementById('filter-teacher').addEventListener('change', applyFilters);
  document.getElementById('filter-room').addEventListener('change', applyFilters);
}

function updateFilterOptions(courses) {
  const teachers = [...new Set(courses.map(c => c.강사).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
  const rooms = [...new Set(courses.map(c => c.room).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));

  const tSel = document.getElementById('filter-teacher');
  const rSel = document.getElementById('filter-room');
  const tVal = tSel.value, rVal = rSel.value;

  tSel.innerHTML = '<option value="">강사 전체</option>' +
    teachers.map(t => `<option value="${t}">${t}</option>`).join('');
  rSel.innerHTML = '<option value="">강의실 전체</option>' +
    rooms.map(r => `<option value="${r}">${r}</option>`).join('');

  tSel.value = tVal;
  rSel.value = rVal;
}

function applyFilters() {
  const teacher = document.getElementById('filter-teacher').value;
  const room = document.getElementById('filter-room').value;

  if (!state.timetable) return;
  let filtered = state.timetable.courses;
  if (teacher) filtered = filtered.filter(c => c.강사 === teacher);
  if (room)    filtered = filtered.filter(c => c.room === room);

  List.setCourses(filtered);
  if (state.view === 'list') List.render(state.query, openModal);

  // 그리드 뷰에서 강의실 필터: 해당 열만 표시
  if (state.view === 'grid' && room) {
    document.querySelectorAll('#timetable .th-room').forEach(th => {
      const col = th.cellIndex;
      const show = th.textContent.trim() === room;
      // 해당 열 토글
      document.querySelectorAll(`#timetable tr`).forEach(tr => {
        if (tr.cells[col]) tr.cells[col].style.display = show ? '' : 'none';
      });
    });
  } else if (state.view === 'grid') {
    document.querySelectorAll('#timetable td, #timetable th').forEach(el => {
      el.style.display = '';
    });
  }
}

// ── 정렬 (N2) ───────────────────────────────────────
function initSortButtons() {
  document.querySelectorAll('.sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.sort;
      const currentKey = btn.dataset.currentKey;
      const dir = (currentKey === key && btn.dataset.dir === '1') ? -1 : 1;

      document.querySelectorAll('.sort-btn').forEach(b => {
        b.dataset.currentKey = key;
        b.dataset.dir = '1';
        b.innerHTML = b.dataset.label;
      });

      btn.dataset.dir = dir;
      btn.innerHTML = btn.dataset.label + (dir === 1 ? ' ▲' : ' ▼');

      List.setSort(key, dir);
      if (state.view === 'list') List.render(state.query, openModal);
    });
  });
}

// ── 모달 (F4) ───────────────────────────────────────
function openModal(course) {
  const modal = document.getElementById('detail-modal');

  const status = course.진행상태 || '예정';
  const badgeMap = {
    '오늘개강': ['primary', '오늘개강'],
    '진행중':   ['success', '진행중'],
    '종료':     ['secondary', '종료'],
    '예정':     ['secondary', '예정'],
  };
  const [badgeCls, badgeLabel] = badgeMap[status] || ['secondary', '예정'];

  const pct = course.수강인원 ? Math.round((course.배정 / course.수강인원) * 100) : 0;
  const fillCls = pct >= 80 ? 'fill-high' : pct >= 50 ? 'fill-mid' : 'fill-low';

  function row(label, value) {
    if (!value && value !== 0) return '';
    return `<div class="d-flex gap-2 mb-2">
      <span class="modal-field-label">${label}</span>
      <span class="modal-field-value">${value}</span>
    </div>`;
  }

  document.getElementById('modal-body').innerHTML = `
    <div class="mb-3">
      <span class="badge bg-${badgeCls} me-2">${badgeLabel}</span>
      <strong style="font-size:1rem">${course.과정명}</strong>
    </div>
    <hr class="my-2">
    ${row('강의실', course.room)}
    ${row('강사', course.강사)}
    ${row('요일', course.요일)}
    ${row('수업시간', course.시작시간 && course.종료시간 ? `${course.시작시간} ~ ${course.종료시간}` : course.시작시간)}
    ${row('개강일', course.개강일)}
    ${row('종강일', course.종강일)}
    <hr class="my-2">
    ${row('정원', course.정원 ? `${course.정원}명 (수강인원 ${course.수강인원}명)` : null)}
    ${course.배정 !== undefined ? `
    <div class="d-flex gap-2 mb-2 align-items-center">
      <span class="modal-field-label">배정</span>
      <span class="modal-field-value me-2">${course.배정}명</span>
      <div class="modal-assign-bar">
        <div class="modal-assign-fill ${fillCls}" style="width:${pct}%"></div>
      </div>
      <span style="font-size:0.78rem;color:#6c757d">${pct}%</span>
    </div>` : ''}
    ${row('전체 출석율', course.전체출석율)}
    ${course.비고 ? `<hr class="my-2">${row('비고', course.비고)}` : ''}
  `;

  const bsModal = bootstrap.Modal.getOrCreate(modal);
  bsModal.show();
}

// ── 다크 모드 (N4) ──────────────────────────────────
function initDarkMode() {
  const btn = document.getElementById('btn-dark');
  const saved = localStorage.getItem('darkMode');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = saved !== null ? saved === 'true' : prefersDark;

  applyDark(isDark);

  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-bs-theme') === 'dark';
    applyDark(!current);
    localStorage.setItem('darkMode', !current);
  });
}

function applyDark(on) {
  document.documentElement.setAttribute('data-bs-theme', on ? 'dark' : 'light');
  document.getElementById('btn-dark').textContent = on ? '☀️' : '🌙';
}

// ── 메인 진입점 ─────────────────────────────────────
async function main() {
  // 오늘 날짜 표시
  document.getElementById('today-display').textContent = '오늘: ' + todayStr();

  // URL 파라미터 읽기
  readUrlParams();

  // 다크모드
  initDarkMode();

  // 파일 목록 로드 → 탭 초기화
  const files = await Api.getFiles();
  initTabs(files);
  initViewToggle();
  initSearch();
  initFilters();
  initSortButtons();

  // 데이터 로드
  await loadData();
}

// ── 업로드 모달 ─────────────────────────────────────
function initUpload() {
  const dropZone  = document.getElementById('drop-zone');
  const fileInput = document.getElementById('upload-file-input');
  const fileLabel = document.getElementById('selected-file');
  const resultEl  = document.getElementById('upload-result');
  const uploadBtn = document.getElementById('btn-do-upload');
  let selectedFile = null;

  // 드롭존 클릭
  dropZone.addEventListener('click', () => fileInput.click());

  // 파일 선택
  fileInput.addEventListener('change', () => {
    selectedFile = fileInput.files[0] || null;
    fileLabel.textContent = selectedFile ? `✅ ${selectedFile.name}` : '';
    resultEl.innerHTML = '';
  });

  // 드래그 앤 드롭
  dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.style.background = 'var(--bs-primary-bg-subtle)';
  });
  dropZone.addEventListener('dragleave', () => {
    dropZone.style.background = '';
  });
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.style.background = '';
    const f = e.dataTransfer.files[0];
    if (f) {
      selectedFile = f;
      fileLabel.textContent = `✅ ${f.name}`;
      resultEl.innerHTML = '';
    }
  });

  // 업로드 버튼
  uploadBtn.addEventListener('click', async () => {
    const month   = document.getElementById('upload-month').value;
    const typeKey = document.getElementById('upload-type').value;
    resultEl.innerHTML = '';

    if (!selectedFile) {
      resultEl.innerHTML = '<span class="text-danger">⚠️ 파일을 선택해주세요.</span>';
      return;
    }
    if (!month || !typeKey) {
      resultEl.innerHTML = '<span class="text-danger">⚠️ 월과 구분을 선택해주세요.</span>';
      return;
    }

    uploadBtn.disabled = true;
    uploadBtn.textContent = '업로드 중...';

    try {
      const res = await Api.upload(month, typeKey, selectedFile);

      if (res.error) {
        resultEl.innerHTML = `<span class="text-danger">❌ ${res.error}</span>`;
      } else {
        resultEl.innerHTML = `<span class="text-success">✅ ${res.file} 저장 완료 (과정 ${res.total}개 인식)</span>`;

        // 탭 목록 갱신 후 해당 월로 이동
        const files = await Api.getFiles();
        initTabs(files);
        updateFilterOptions(state.timetable?.courses || []);

        // 업로드한 월·구분으로 자동 전환
        state.month = parseInt(month);
        state.type  = typeKey;
        refreshTabHighlight();
        await loadData();

        // 2초 후 모달 자동 닫기
        setTimeout(() => {
          bootstrap.Modal.getInstance(document.getElementById('upload-modal'))?.hide();
          selectedFile = null;
          fileLabel.textContent = '';
          fileInput.value = '';
          resultEl.innerHTML = '';
        }, 2000);
      }
    } catch (e) {
      resultEl.innerHTML = `<span class="text-danger">❌ 업로드 실패: ${e.message}</span>`;
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.textContent = '업로드';
    }
  });

  // 모달 닫힐 때 초기화
  document.getElementById('upload-modal').addEventListener('hidden.bs.modal', () => {
    selectedFile = null;
    fileLabel.textContent = '';
    fileInput.value = '';
    resultEl.innerHTML = '';
  });
}

// ── 통계 대시보드 ───────────────────────────────────
function initStats() {
  document.getElementById('btn-stats').addEventListener('click', async () => {
    const modal = new bootstrap.Modal(document.getElementById('stats-modal'));
    const body  = document.getElementById('stats-body');
    body.innerHTML = '<div class="text-center py-4"><div class="spinner-border spinner-border-sm"></div> 불러오는 중...</div>';
    modal.show();

    try {
      const data = await Api.getStats(state.month, state.type);
      renderStats(data, body);
    } catch(e) {
      body.innerHTML = '<div class="text-danger p-3">⚠️ 데이터를 불러오지 못했습니다.</div>';
    }
  });
}

function renderStats(d, body) {
  const typeLabel = state.type === 'weekday' ? '평일' : '주말';

  // 진행 상태 카드
  const statusCards = [
    { key: '진행중',   label: '진행중',   cls: 'success' },
    { key: '오늘개강', label: '오늘개강', cls: 'primary' },
    { key: '예정',     label: '예정',     cls: 'secondary' },
    { key: '종료',     label: '종료',     cls: 'dark' },
  ].map(({ key, label, cls }) => `
    <div class="col-6 col-md-3">
      <div class="card text-center border-${cls}">
        <div class="card-body py-3">
          <div style="font-size:1.6rem;font-weight:700" class="text-${cls}">${d.status_count[key] || 0}</div>
          <div style="font-size:0.78rem" class="text-muted">${label}</div>
        </div>
      </div>
    </div>`).join('');

  // 강의실별 배정률 바
  const roomRows = d.room_stats.map(r => {
    const pct = r.배정률;
    const barCls = pct >= 80 ? 'bg-danger' : pct >= 50 ? 'bg-warning' : 'bg-success';
    return `
      <tr>
        <td style="font-size:0.82rem;white-space:nowrap">${r.room}</td>
        <td class="text-center">${r.과정수}</td>
        <td class="text-center">${r.배정} / ${r.수강인원}</td>
        <td style="min-width:100px">
          <div class="d-flex align-items-center gap-1">
            <div class="progress flex-grow-1" style="height:8px">
              <div class="progress-bar ${barCls}" style="width:${pct}%"></div>
            </div>
            <span style="font-size:0.72rem;width:32px">${pct}%</span>
          </div>
        </td>
      </tr>`;
  }).join('');

  // 강사별 강의 수
  const teacherRows = d.teacher_stats.slice(0, 15).map(t => `
    <tr>
      <td style="font-size:0.82rem">${t.강사}</td>
      <td class="text-center">${t.강의수}</td>
      <td>
        <div class="progress" style="height:6px">
          <div class="progress-bar bg-info" style="width:${Math.min(100, t.강의수 / (d.teacher_stats[0]?.강의수 || 1) * 100)}%"></div>
        </div>
      </td>
    </tr>`).join('');

  // 수강 독려 필요 과정
  const lowFillRows = d.low_fill_courses.length === 0
    ? '<tr><td colspan="5" class="text-center text-muted py-2">해당 없음</td></tr>'
    : d.low_fill_courses.map(c => {
        const pct = c.수강인원 ? Math.round((c.배정 / c.수강인원) * 100) : 0;
        return `
          <tr>
            <td style="font-size:0.8rem">${c.과정명}</td>
            <td style="font-size:0.8rem">${c.room}</td>
            <td class="text-center">${c.강사 || '-'}</td>
            <td class="text-center">${c.배정} / ${c.수강인원}</td>
            <td><span class="badge bg-danger">${pct}%</span></td>
          </tr>`;
      }).join('');

  body.innerHTML = `
    <h6 class="mb-3 text-muted">${state.month}월 ${typeLabel} — 전체 과정 <strong class="text-dark">${d.total}</strong>개</h6>

    <!-- 상태 요약 -->
    <div class="row g-2 mb-4">${statusCards}</div>

    <div class="row g-3">
      <!-- 강의실별 배정률 -->
      <div class="col-12 col-lg-7">
        <div class="card">
          <div class="card-header py-2" style="font-size:0.85rem;font-weight:600">🏫 강의실별 배정 현황</div>
          <div class="card-body p-0">
            <div style="max-height:260px;overflow-y:auto">
              <table class="table table-sm mb-0">
                <thead style="position:sticky;top:0;background:var(--bs-body-bg)">
                  <tr><th>강의실</th><th class="text-center">과정수</th><th class="text-center">배정/수강인원</th><th>배정률</th></tr>
                </thead>
                <tbody>${roomRows}</tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- 강사별 강의수 -->
      <div class="col-12 col-lg-5">
        <div class="card">
          <div class="card-header py-2" style="font-size:0.85rem;font-weight:600">👤 강사별 강의수 (상위 15명)</div>
          <div class="card-body p-0">
            <div style="max-height:260px;overflow-y:auto">
              <table class="table table-sm mb-0">
                <thead style="position:sticky;top:0;background:var(--bs-body-bg)">
                  <tr><th>강사</th><th class="text-center">강의수</th><th style="min-width:80px"></th></tr>
                </thead>
                <tbody>${teacherRows}</tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 수강 독려 필요 -->
    <div class="card mt-3">
      <div class="card-header py-2" style="font-size:0.85rem;font-weight:600">⚠️ 수강 독려 필요 과정 (배정률 50% 미만)</div>
      <div class="card-body p-0">
        <table class="table table-sm mb-0">
          <thead><tr><th>과정명</th><th>강의실</th><th class="text-center">강사</th><th class="text-center">배정/수강인원</th><th>배정률</th></tr></thead>
          <tbody>${lowFillRows}</tbody>
        </table>
      </div>
    </div>
  `;
}

// ── 강의실 빈 시간 보기 ─────────────────────────────
function initEmptyRooms() {
  document.getElementById('btn-empty-rooms').addEventListener('click', async () => {
    const modal = new bootstrap.Modal(document.getElementById('empty-rooms-modal'));
    const body  = document.getElementById('empty-rooms-body');
    const filterEl = document.getElementById('empty-room-filters');

    body.innerHTML = '<div class="text-center py-4"><div class="spinner-border spinner-border-sm"></div> 불러오는 중...</div>';
    filterEl.innerHTML = '';
    modal.show();

    try {
      const data = await Api.getEmptyRooms(state.month, state.type);
      renderEmptyRooms(data, body, filterEl);
    } catch(e) {
      body.innerHTML = '<div class="text-danger p-3">⚠️ 데이터를 불러오지 못했습니다.</div>';
    }
  });

  document.getElementById('empty-room-reset').addEventListener('click', () => {
    document.querySelectorAll('#empty-room-filters .btn').forEach(b => b.classList.remove('active', 'btn-warning'));
    document.querySelectorAll('#empty-rooms-body .room-tag').forEach(el => el.style.display = '');
    document.querySelectorAll('#empty-rooms-body .time-row').forEach(el => el.style.display = '');
  });
}

function renderEmptyRooms(data, body, filterEl) {
  const { empty_by_time, rooms } = data;

  if (!empty_by_time.length) {
    body.innerHTML = '<div class="empty-state">빈 강의실이 없습니다.</div>';
    return;
  }

  // 강의실 필터 버튼
  rooms.forEach(room => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-sm btn-outline-warning';
    btn.textContent = room;
    btn.addEventListener('click', () => {
      const active = btn.classList.toggle('active');
      btn.classList.toggle('btn-warning', active);
      btn.classList.toggle('btn-outline-warning', !active);

      const activeRooms = [...document.querySelectorAll('#empty-room-filters .btn.active')]
        .map(b => b.textContent);

      document.querySelectorAll('#empty-rooms-body .time-row').forEach(row => {
        if (activeRooms.length === 0) {
          row.style.display = '';
          row.querySelectorAll('.room-tag').forEach(t => t.style.display = '');
          return;
        }
        const visible = [...row.querySelectorAll('.room-tag')].filter(t => {
          const show = activeRooms.includes(t.dataset.room);
          t.style.display = show ? '' : 'none';
          return show;
        });
        row.style.display = visible.length ? '' : 'none';
      });
    });
    filterEl.appendChild(btn);
  });

  // 빈 시간대 테이블
  const html = empty_by_time.map(({ time, rooms: emptyRooms }) => `
    <div class="time-row d-flex align-items-start gap-2 py-2 border-bottom">
      <span class="badge bg-secondary" style="min-width:52px;font-size:0.78rem">${time}</span>
      <div class="d-flex flex-wrap gap-1">
        ${emptyRooms.map(r => `
          <span class="room-tag badge bg-warning text-dark" data-room="${r}">${r}</span>
        `).join('')}
      </div>
    </div>
  `).join('');

  body.innerHTML = `
    <div style="font-size:0.82rem;color:#6c757d" class="mb-2 px-1">
      총 <strong>${empty_by_time.length}</strong>개 시간대에 빈 강의실 있음
    </div>
    ${html}
  `;
}

// ── 엑셀 내보내기 ───────────────────────────────────
function initExport() {
  document.getElementById('btn-export').addEventListener('click', () => {
    const teacher = document.getElementById('filter-teacher').value;
    const room    = document.getElementById('filter-room').value;
    const query   = state.query;

    const params = new URLSearchParams({
      month: state.month,
      type:  state.type,
    });
    if (teacher) params.set('teacher', teacher);
    if (room)    params.set('room', room);
    if (query)   params.set('q', query);

    window.location.href = `/api/export?${params.toString()}`;
  });
}

document.addEventListener('DOMContentLoaded', () => {
  main();
  initUpload();
  initExport();
  initEmptyRooms();
  initStats();
});
