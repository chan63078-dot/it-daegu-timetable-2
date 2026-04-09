import os
import re
import csv
from datetime import date
import pandas as pd

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_DIR = os.path.join(BASE_DIR, 'csv')

TIME_RE = re.compile(r'^\d{1,2}:\d{2}$')

DETAIL_PATTERNS = [
    re.compile(r'전체출석율|당일출석율'),
    re.compile(r'^정원\s*:'),
    re.compile(r'^배정:'),
    re.compile(r'^개:\d{4}'),
    re.compile(r'^종:\d{4}'),
    re.compile(r'^수업없음$'),
    re.compile(r'^(월~금|화~토|토/일|월수금|화목|월수|화/목|월/수|월~목|월수월수|화목화목|토일|월화수목)'),
    re.compile(r'^(휴강:|보강:)'),
    re.compile(r'^\(휴강|^\(보강'),   # (휴강:5/1,5/5) 형태
    re.compile(r'^\(★'),
    re.compile(r'^\d+/\d+'),           # 날짜 목록: 5/2,3,9...
    re.compile(r'^\d+/\d+\s*휴강'),    # 4/2 휴강 형태
    re.compile(r'^휴강:'),
]

TEACHER_RE = re.compile(r'^[가-힣]{2,4}\d{0,2}$')


def _is_detail(text):
    for pat in DETAIL_PATTERNS:
        if pat.search(text):
            return True
    return False


def _is_teacher(text):
    return bool(TEACHER_RE.match(text))


def _classify(text):
    if _is_detail(text):
        return 'detail'
    if _is_teacher(text):
        return 'teacher'
    return 'course'


def _time_to_min(t):
    h, m = t.split(':')
    return int(h) * 60 + int(m)


def _parse_detail(course, text):
    # 출석율
    m = re.search(r'(전체|당일)출석율\s*:\s*([\d.]+%?)', text)
    if m:
        if not course.get('전체출석율'):
            course['전체출석율'] = m.group(2) if '%' in m.group(2) else m.group(2) + '%'
        return

    # 정원 : 26(20)
    m = re.search(r'정원\s*:\s*(\d+)\((\d+)\)', text)
    if m:
        course['정원'] = int(m.group(1))
        course['수강인원'] = int(m.group(2))
        return

    # 배정:5 또는 배정:5(W:4,R:0)
    m = re.search(r'배정:(\d+)', text)
    if m:
        course['배정'] = int(m.group(1))
        return

    # 개강일
    m = re.search(r'개:(\d{4}-\d{2}-\d{2})', text)
    if m:
        course['개강일'] = m.group(1)
        return

    # 종강일
    m = re.search(r'종:(\d{4}-\d{2}-\d{2})', text)
    if m:
        course['종강일'] = m.group(1)
        return

    # 요일
    if re.match(r'^(월~금|화~토|토/일|월수금|화목|월수|화/목|월/수|월~목|월수월수|화목화목)', text):
        if not course.get('요일'):
            course['요일'] = text
        return

    # 위탁강사 정보에서 강사명 추출
    if '★' in text:
        teacher_m = re.search(r'([가-힣]{2,4})강사', text)
        if teacher_m and not course.get('강사'):
            course['강사'] = teacher_m.group(1)
        course.setdefault('비고_list', []).append(text)
        return

    # 나머지는 비고
    course.setdefault('비고_list', []).append(text)


def _read_rows(filepath):
    """CSV 또는 xlsx 파일을 읽어 행 리스트로 반환."""
    if filepath.endswith('.xlsx') or filepath.endswith('.xls'):
        df = pd.read_excel(filepath, header=None, dtype=str)
        df = df.fillna('')
        # 'nan' 문자열도 빈 값으로 처리
        return [['' if str(v) == 'nan' else str(v) for v in row] for row in df.values.tolist()]
    else:
        with open(filepath, 'rb') as f:
            raw = f.read()
        text = raw.decode('cp949', errors='replace')
        reader = csv.reader(text.splitlines())
        return list(reader)


def _parse_file(filepath, month, type_label):
    rows = _read_rows(filepath)
    if len(rows) < 3:
        return [], [], {}, []

    # ── 헤더 파싱 (행 0, 1) ──────────────────────────────
    row0 = rows[0]   # 강의실 그룹
    row1 = rows[1]   # 강의실 세부명
    row2 = rows[2]   # 정원

    col_to_room = {}
    col_to_group = {}
    current_group = ''
    for ci, val in enumerate(row0):
        val = val.strip()
        if val and val not in ('강의실',):
            current_group = val
        if ci < len(row1):
            rname = row1[ci].strip() if row1[ci] else ''
            if rname:
                col_to_room[ci] = rname
                col_to_group[ci] = current_group

    col_to_capacity = {}
    for ci, cap_text in enumerate(row2):
        if ci in col_to_room and cap_text:
            nums = re.findall(r'\d+', cap_text)
            if len(nums) >= 2:
                col_to_capacity[ci] = (int(nums[0]), int(nums[1]))

    # ── 시간 맵 (row_idx -> time) ─────────────────────────
    time_at_row = {}
    current_time = None
    for ri, row in enumerate(rows):
        val = row[0].strip() if row and row[0] else ''
        if TIME_RE.match(val):
            # 정규화: 9:00 -> 09:00
            h, m = val.split(':')
            current_time = f"{int(h):02d}:{m}"
        if current_time:
            time_at_row[ri] = current_time

    # 전체 시간 슬롯 목록 (순서 유지, 중복 제거)
    seen = set()
    all_timeslots = []
    for ri in sorted(time_at_row):
        t = time_at_row[ri]
        if t not in seen:
            seen.add(t)
            all_timeslots.append(t)

    time_to_idx = {t: i for i, t in enumerate(all_timeslots)}

    # ── 열별 과정 파싱 ────────────────────────────────────
    today = date.today().isoformat()
    courses = []

    for ci, room in col_to_room.items():
        group = col_to_group.get(ci, '')
        cap_total, cap_max = col_to_capacity.get(ci, (0, 0))

        # 이 열의 데이터 수집
        cells = []
        for ri, row in enumerate(rows[3:], start=3):
            if ci < len(row):
                val = row[ci].strip() if row[ci] else ''
                if val:
                    cells.append((ri, val))

        if not cells:
            continue

        current = None

        for ri, text in cells:
            cls = _classify(text)

            if cls == 'course':
                if current:
                    courses.append(current)
                current = {
                    'room': room,
                    'group': group,
                    'month': month,
                    'type': type_label,
                    '과정명': text,
                    '강사': None,
                    '요일': None,
                    '개강일': None,
                    '종강일': None,
                    '정원': cap_total,
                    '수강인원': cap_max,
                    '배정': 0,
                    '전체출석율': None,
                    '비고_list': [],
                    '_start_row': ri,
                    '_end_row': ri,
                }

            elif current is not None:
                current['_end_row'] = ri
                if cls == 'teacher':
                    if not current['강사']:
                        current['강사'] = text
                else:
                    _parse_detail(current, text)

        if current:
            courses.append(current)

    # ── 과정 후처리 ───────────────────────────────────────
    for c in courses:
        start_time = time_at_row.get(c['_start_row'], '')
        end_time = time_at_row.get(c['_end_row'], start_time)
        si = time_to_idx.get(start_time, 0)
        ei = time_to_idx.get(end_time, si)
        c['시작시간'] = start_time
        c['종료시간'] = end_time
        c['rowspan'] = ei - si + 1
        c['비고'] = ' / '.join(c.pop('비고_list', []))

        s = c.get('개강일') or '9999-99-99'
        e = c.get('종강일') or '0000-00-00'
        c['_진행중'] = s <= today <= e
        c['_오늘개강'] = s == today
        c['_종료'] = e < today
        c['_예정'] = s > today

        del c['_start_row'], c['_end_row']

    return courses, all_timeslots, col_to_group, col_to_room


def _build_grid(courses, all_timeslots, rooms):
    time_to_idx = {t: i for i, t in enumerate(all_timeslots)}
    grid = {t: {r: None for r in rooms} for t in all_timeslots}

    for c in courses:
        room = c['room']
        start = c.get('시작시간', '')
        end = c.get('종료시간', start)
        si = time_to_idx.get(start, 0)
        ei = time_to_idx.get(end, si)

        if room not in grid.get(start, {}):
            continue

        grid[start][room] = c

        for i in range(si + 1, ei + 1):
            t = all_timeslots[i]
            grid[t][room] = 'merged'

    return grid


def _find_file(month, type_label):
    """xlsx 우선, 없으면 csv 탐색."""
    base = f'IT대구 {month}월 {type_label} 강의 시간표'
    for ext in ('.xlsx', '.csv'):
        fpath = os.path.join(CSV_DIR, base + ext)
        if os.path.exists(fpath):
            return fpath
    return None


def get_available_files():
    result = []
    for month in range(4, 13):
        for type_label, type_key in [('평일', 'weekday'), ('주말', 'weekend')]:
            fpath = _find_file(month, type_label)
            if fpath:
                result.append({
                    'month': month,
                    'type': type_key,
                    'label': type_label,
                    'file': os.path.basename(fpath),
                })
    return result


def get_timetable(month, type_key):
    type_label = '평일' if type_key == 'weekday' else '주말'
    fpath = _find_file(month, type_label)

    if not fpath:
        return None

    courses, all_timeslots, col_to_group, col_to_room = _parse_file(fpath, month, type_label)  # noqa

    # 방 목록 순서 유지
    rooms = list(dict.fromkeys(c['room'] for c in courses))

    # 그룹 정보
    room_groups = {}
    for ci, room in col_to_room.items():
        room_groups[room] = col_to_group.get(ci, '')

    grid = _build_grid(courses, all_timeslots, rooms)

    # courses 직렬화 (grid 참조 제거, '_' 키 정리)
    export_courses = []
    for c in courses:
        ec = {k: v for k, v in c.items() if not k.startswith('_')}
        ec['진행상태'] = (
            '오늘개강' if c.get('_오늘개강')
            else '진행중' if c.get('_진행중')
            else '종료' if c.get('_종료')
            else '예정'
        )
        export_courses.append(ec)

    # grid 직렬화: 'merged' 문자열 유지, 과정 객체는 동일하게 직렬화
    serial_grid = {}
    for t, room_map in grid.items():
        serial_grid[t] = {}
        for room, val in room_map.items():
            if val is None:
                serial_grid[t][room] = None
            elif val == 'merged':
                serial_grid[t][room] = 'merged'
            else:
                ec = {k: v for k, v in val.items() if not k.startswith('_')}
                ec['진행상태'] = (
                    '오늘개강' if val.get('_오늘개강')
                    else '진행중' if val.get('_진행중')
                    else '종료' if val.get('_종료')
                    else '예정'
                )
                serial_grid[t][room] = ec

    return {
        'meta': {'월': month, '구분': type_label, '총과정수': len(courses)},
        'rooms': rooms,
        'room_groups': room_groups,
        'timeslots': all_timeslots,
        'grid': serial_grid,
        'courses': export_courses,
    }


def search_courses(month, type_key, query=''):
    data = get_timetable(month, type_key)
    if not data:
        return []
    courses = data['courses']
    if not query:
        return courses
    q = query.lower().replace(' ', '')
    result = []
    for c in courses:
        haystack = ' '.join([
            c.get('과정명', ''),
            c.get('강사', '') or '',
            c.get('room', ''),
        ]).lower().replace(' ', '')
        if q in haystack:
            result.append(c)
    return result
