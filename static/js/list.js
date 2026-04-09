const List = (() => {
  let _allCourses = [];
  let _sortKey = '개강일';
  let _sortDir = 1; // 1=asc, -1=desc

  function _badgeHtml(status) {
    const map = {
      '오늘개강': ['badge-today',  '오늘개강'],
      '진행중':   ['badge-active', '진행중'],
      '종료':     ['badge-ended',  '종료'],
      '예정':     ['badge-planned','예정'],
    };
    const [cls, label] = map[status] || ['badge-planned', '예정'];
    return `<span class="badge ${cls}" style="font-size:0.7rem">${label}</span>`;
  }

  function _highlight(text, query) {
    if (!query || !text) return text || '';
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return String(text).replace(new RegExp(escaped, 'gi'), m => `<mark>${m}</mark>`);
  }

  function _assignBar(배정, 수강인원) {
    if (!수강인원) return '';
    const pct = Math.round((배정 / 수강인원) * 100);
    const cls = pct >= 80 ? 'fill-high' : pct >= 50 ? 'fill-mid' : 'fill-low';
    return `
      <div style="display:flex;align-items:center;gap:6px;margin-top:5px">
        <div class="card-assign-bar" style="flex:1">
          <div class="card-assign-fill ${cls}" style="width:${pct}%"></div>
        </div>
        <span style="font-size:0.72rem;color:#6c757d;white-space:nowrap">배정 ${배정}/${수강인원} (${pct}%)</span>
      </div>`;
  }

  function _cardHtml(c, query) {
    const hl = t => _highlight(t, query);
    const opacityStyle = c.진행상태 === '종료' ? 'opacity:0.65' : '';
    return `
      <div class="course-card mb-2" data-course='${JSON.stringify(c).replace(/'/g, "&#39;")}' style="${opacityStyle}">
        <div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:4px">
          ${_badgeHtml(c.진행상태)}
          <div class="card-course-name">${hl(c.과정명)}</div>
        </div>
        <div class="card-meta">
          <span>🏫 ${hl(c.room)}</span>
          ${c.강사 ? `<span>👤 ${hl(c.강사)}</span>` : ''}
          ${c.요일 ? `<span>📅 ${c.요일}</span>` : ''}
          ${(c.개강일 || c.종강일) ? `<br><span>🗓 ${c.개강일 || '?'} ~ ${c.종강일 || '?'}</span>` : ''}
          ${c.시작시간 ? `<span>⏰ ${c.시작시간}${c.종료시간 ? ' ~ ' + c.종료시간 : ''}</span>` : ''}
        </div>
        ${_assignBar(c.배정 || 0, c.수강인원)}
      </div>`;
  }

  function _sorted(courses) {
    return [...courses].sort((a, b) => {
      const va = a[_sortKey] || '';
      const vb = b[_sortKey] || '';
      if (typeof va === 'number') return (va - vb) * _sortDir;
      return va.localeCompare(vb, 'ko') * _sortDir;
    });
  }

  function setCourses(courses) {
    _allCourses = courses;
  }

  function render(query, onCardClick) {
    const container = document.getElementById('list-view');
    const countEl = document.getElementById('search-count');

    let filtered = _allCourses;
    if (query && query.length >= 2) {
      const q = query.toLowerCase().replace(/\s/g, '');
      filtered = _allCourses.filter(c => {
        const hay = [c.과정명, c.강사, c.room].join(' ').toLowerCase().replace(/\s/g, '');
        return hay.includes(q);
      });
    }

    const sorted = _sorted(filtered);
    const total = _allCourses.length;
    const shown = sorted.length;

    if (countEl) {
      countEl.textContent = query && query.length >= 2
        ? `총 ${total}개 중 ${shown}개 표시`
        : `총 ${total}개`;
    }

    if (sorted.length === 0) {
      container.innerHTML = `
      <div class="empty-state">
        <div style="font-size:2rem">🔍</div>
        <div class="mt-2">검색 결과가 없습니다.</div>
        <div class="text-muted" style="font-size:0.82rem">"${query}"에 해당하는 과정이 없어요.</div>
      </div>`;
      return;
    }

    container.innerHTML = `<div class="container-fluid pt-2"><div class="row g-2">${
      sorted.map(c => `<div class="col-12 col-sm-6 col-lg-4 col-xl-3">${_cardHtml(c, query)}</div>`).join('')
    }</div></div>`;

    // 카드 클릭 이벤트
    container.querySelectorAll('.course-card').forEach(el => {
      el.addEventListener('click', () => {
        const c = JSON.parse(el.dataset.course);
        onCardClick(c);
      });
    });
  }

  // 정렬 설정 함수
  function setSort(key, dir) {
    _sortKey = key;
    _sortDir = dir;
  }

  return { setCourses, render, setSort };
})();
