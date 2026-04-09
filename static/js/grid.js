const Grid = (() => {
  // 강의실 그룹별 색상
  const GROUP_COLORS = [
    '#2c5282','#276749','#744210','#702459','#234e52',
    '#1a365d','#3c366b','#652b19','#1d4044','#2d3748',
  ];
  const groupColorMap = {};
  let colorIdx = 0;

  function _groupColor(group) {
    if (!groupColorMap[group]) {
      groupColorMap[group] = GROUP_COLORS[colorIdx++ % GROUP_COLORS.length];
    }
    return groupColorMap[group];
  }

  function _statusClass(status) {
    if (status === '오늘개강') return 'td-today';
    if (status === '진행중')  return 'td-active';
    if (status === '종료')    return 'td-ended';
    return '';
  }

  function _badgeHtml(status) {
    const map = {
      '오늘개강': ['badge-today',  '오늘개강'],
      '진행중':   ['badge-active', '진행중'],
      '종료':     ['badge-ended',  '종료'],
      '예정':     ['badge-planned','예정'],
    };
    const [cls, label] = map[status] || ['badge-planned', '예정'];
    return `<span class="badge ${cls} mb-1" style="font-size:0.6rem">${label}</span>`;
  }

  function _assignBarHtml(배정, 수강인원) {
    if (!수강인원) return '';
    const pct = Math.round((배정 / 수강인원) * 100);
    const fillCls = pct >= 80 ? 'fill-high' : pct >= 50 ? 'fill-mid' : 'fill-low';
    return `
      <div class="course-assign">
        <span style="color:#6c757d">${배정}/${수강인원}</span>
        <div class="assign-bar"><div class="assign-fill ${fillCls}" style="width:${pct}%"></div></div>
      </div>`;
  }

  function render(data, onCellClick) {
    colorIdx = 0;
    Object.keys(groupColorMap).forEach(k => delete groupColorMap[k]);

    const { rooms, room_groups, timeslots, grid } = data;

    // 그룹 계산
    const groups = [];
    let lastGroup = null, count = 0;
    // 시간 열 + 방 열
    const allCols = [null, ...rooms];
    for (let i = 1; i < allCols.length; i++) {
      const g = room_groups[allCols[i]] || allCols[i];
      if (g !== lastGroup) {
        if (lastGroup !== null) groups.push({ name: lastGroup, span: count });
        lastGroup = g;
        count = 1;
      } else {
        count++;
      }
    }
    if (lastGroup !== null) groups.push({ name: lastGroup, span: count });

    const table = document.createElement('table');
    table.id = 'timetable';
    table.className = 'table table-bordered mb-0';

    const thead = table.createTHead();

    // ── 그룹 헤더 행 ──
    const trGroup = thead.insertRow();
    // 시간 열 헤더 (두 행 span)
    const thTime = document.createElement('th');
    thTime.rowSpan = 2;
    thTime.className = 'th-group';
    thTime.textContent = '시간';
    thTime.style.position = 'sticky';
    thTime.style.left = '0';
    thTime.style.zIndex = '4';
    trGroup.appendChild(thTime);

    groups.forEach(g => {
      const th = document.createElement('th');
      th.colSpan = g.span;
      th.className = 'th-group';
      th.textContent = g.name;
      th.style.background = _groupColor(g.name);
      trGroup.appendChild(th);
    });

    // ── 강의실 헤더 행 ──
    const trRoom = thead.insertRow();
    rooms.forEach(room => {
      const th = document.createElement('th');
      th.className = 'th-room';
      th.textContent = room;
      const g = room_groups[room] || room;
      th.style.background = _groupColor(g) + 'cc'; // 약간 투명
      trRoom.appendChild(th);
    });

    // ── 데이터 행 ──
    const tbody = table.createTBody();
    timeslots.forEach(time => {
      const tr = tbody.insertRow();

      // 시간 셀
      const tdTime = tr.insertCell();
      tdTime.className = 'td-time';
      tdTime.textContent = time;

      rooms.forEach(room => {
        const cell = grid[time]?.[room];

        if (cell === 'merged') return; // rowspan 처리됨, 셀 추가 안 함

        const td = tr.insertCell();

        if (!cell) {
          td.className = 'td-empty';
          return;
        }

        td.className = `td-course ${_statusClass(cell.진행상태)}`;
        td.rowSpan = cell.rowspan || 1;
        td.dataset.course = JSON.stringify(cell);
        td.addEventListener('click', () => onCellClick(cell));

        const nameClass = cell.진행상태 === '종료' ? 'course-name ended-name' : 'course-name';
        td.innerHTML = `
          ${_badgeHtml(cell.진행상태)}
          <div class="${nameClass}" title="${cell.과정명}">${cell.과정명}</div>
          <div class="course-meta">
            ${cell.강사 ? `👤 ${cell.강사}` : ''}<br>
            ${cell.요일 ? `📅 ${cell.요일}` : ''}
            ${cell.개강일 ? `<br>🗓 ${cell.개강일}${cell.종강일 ? ' ~ ' + cell.종강일 : ''}` : ''}
          </div>
          ${_assignBarHtml(cell.배정 || 0, cell.수강인원)}
        `;
      });
    });

    const container = document.getElementById('grid-view');
    container.innerHTML = '';
    container.appendChild(table);
  }

  return { render };
})();
