import os
import io
from flask import Flask, render_template, jsonify, request, send_file
from flask_cors import CORS
from werkzeug.utils import secure_filename
import pandas as pd
from services.csv_service import get_available_files, get_timetable, search_courses, CSV_DIR, BRANCHES

app = Flask(__name__)
CORS(app)

ALLOWED_EXT = {'.xlsx', '.xls', '.csv'}


@app.route('/')
def index():
    return render_template('index.html', branches=BRANCHES)


@app.route('/api/branches')
def api_branches():
    return jsonify(BRANCHES)


@app.route('/api/files')
def api_files():
    branch = request.args.get('branch', '대구')
    return jsonify(get_available_files(branch))


@app.route('/api/timetable')
def api_timetable():
    branch   = request.args.get('branch', '대구')
    month    = request.args.get('month', 4, type=int)
    type_key = request.args.get('type', 'weekday')
    data = get_timetable(branch, month, type_key)
    if data is None:
        return jsonify({'error': '파일을 찾을 수 없습니다.'}), 404
    return jsonify(data)


@app.route('/api/upload', methods=['POST'])
def api_upload():
    branch   = request.form.get('branch', '대구')
    month    = request.form.get('month', type=int)
    type_key = request.form.get('type', '')
    file     = request.files.get('file')

    if branch not in BRANCHES:
        return jsonify({'error': '올바른 지점을 선택해주세요.'}), 400
    if not month or type_key not in ('weekday', 'weekend') or not file:
        return jsonify({'error': '지점, 월, 구분(평일/주말), 파일을 모두 입력해주세요.'}), 400

    _, ext = os.path.splitext(file.filename)
    if ext.lower() not in ALLOWED_EXT:
        return jsonify({'error': 'xlsx / xls / csv 파일만 업로드 가능합니다.'}), 400

    type_label = '평일' if type_key == 'weekday' else '주말'
    save_name  = f'IT{branch} {month}월 {type_label} 강의 시간표{ext.lower()}'
    save_path  = os.path.join(CSV_DIR, save_name)

    for old_ext in ('.xlsx', '.xls', '.csv'):
        old_path = os.path.join(CSV_DIR, f'IT{branch} {month}월 {type_label} 강의 시간표{old_ext}')
        if old_path != save_path and os.path.exists(old_path):
            os.remove(old_path)

    file.save(save_path)

    try:
        data = get_timetable(branch, month, type_key)
        count = data['meta']['총과정수'] if data else 0
    except Exception as e:
        os.remove(save_path)
        return jsonify({'error': f'파일 파싱 오류: {str(e)}'}), 422

    return jsonify({
        'ok': True,
        'file': save_name,
        'branch': branch,
        'month': month,
        'type': type_key,
        'total': count,
    })


@app.route('/api/export')
def api_export():
    branch   = request.args.get('branch', '대구')
    month    = request.args.get('month', 4, type=int)
    type_key = request.args.get('type', 'weekday')
    teacher  = request.args.get('teacher', '')
    room     = request.args.get('room', '')
    query    = request.args.get('q', '')

    data = get_timetable(branch, month, type_key)
    if data is None:
        return jsonify({'error': '파일을 찾을 수 없습니다.'}), 404

    courses = data['courses']

    if teacher:
        courses = [c for c in courses if c.get('강사') == teacher]
    if room:
        courses = [c for c in courses if c.get('room') == room]
    if query:
        q = query.lower().replace(' ', '')
        courses = [c for c in courses if q in (
            c.get('과정명', '') + c.get('강사', '') + c.get('room', '')
        ).lower().replace(' ', '')]

    COLUMNS = ['과정명', 'room', '강사', '요일', '시작시간', '종료시간',
               '개강일', '종강일', '정원', '수강인원', '배정', '전체출석율', '진행상태', '비고']
    LABELS  = ['과정명', '강의실', '강사', '요일', '시작시간', '종료시간',
               '개강일', '종강일', '정원', '수강인원', '배정', '전체출석율', '진행상태', '비고']

    rows = []
    for c in courses:
        rows.append([c.get(col, '') for col in COLUMNS])

    df = pd.DataFrame(rows, columns=LABELS)

    type_label = '평일' if type_key == 'weekday' else '주말'
    filename = f'IT{branch}_{month}월_{type_label}_강의시간표.xlsx'

    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='시간표')
        ws = writer.sheets['시간표']
        for col_cells in ws.columns:
            length = max(len(str(cell.value or '')) for cell in col_cells)
            ws.column_dimensions[col_cells[0].column_letter].width = min(length + 4, 40)
    buf.seek(0)

    return send_file(
        buf,
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        as_attachment=True,
        download_name=filename,
    )


@app.route('/api/empty-rooms')
def api_empty_rooms():
    branch   = request.args.get('branch', '대구')
    month    = request.args.get('month', 4, type=int)
    type_key = request.args.get('type', 'weekday')

    data = get_timetable(branch, month, type_key)
    if data is None:
        return jsonify({'error': '파일을 찾을 수 없습니다.'}), 404

    rooms     = data['rooms']
    timeslots = data['timeslots']
    grid      = data['grid']

    result = []
    for t in timeslots:
        empty = [r for r in rooms if grid[t].get(r) is None]
        if empty:
            result.append({'time': t, 'rooms': empty})

    return jsonify({
        'timeslots': timeslots,
        'rooms': rooms,
        'empty_by_time': result,
    })


@app.route('/api/stats')
def api_stats():
    branch   = request.args.get('branch', '대구')
    month    = request.args.get('month', 4, type=int)
    type_key = request.args.get('type', 'weekday')

    data = get_timetable(branch, month, type_key)
    if data is None:
        return jsonify({'error': '파일을 찾을 수 없습니다.'}), 404

    courses = data['courses']

    status_count = {'오늘개강': 0, '진행중': 0, '종료': 0, '예정': 0}
    for c in courses:
        s = c.get('진행상태', '예정')
        status_count[s] = status_count.get(s, 0) + 1

    room_stats = {}
    for c in courses:
        r = c.get('room', '')
        if r not in room_stats:
            room_stats[r] = {'과정수': 0, '배정합': 0, '수강인원합': 0}
        room_stats[r]['과정수'] += 1
        room_stats[r]['배정합']    += c.get('배정', 0) or 0
        room_stats[r]['수강인원합'] += c.get('수강인원', 0) or 0

    room_list = []
    for r, s in room_stats.items():
        pct = round(s['배정합'] / s['수강인원합'] * 100) if s['수강인원합'] else 0
        room_list.append({
            'room': r,
            '과정수': s['과정수'],
            '배정': s['배정합'],
            '수강인원': s['수강인원합'],
            '배정률': pct,
        })
    room_list.sort(key=lambda x: -x['배정률'])

    teacher_stats = {}
    for c in courses:
        t = c.get('강사') or '미배정'
        teacher_stats[t] = teacher_stats.get(t, 0) + 1
    teacher_list = sorted(teacher_stats.items(), key=lambda x: -x[1])

    low_fill = [
        c for c in courses
        if c.get('수강인원') and c.get('수강인원') > 0
        and (c.get('배정', 0) or 0) / c['수강인원'] < 0.5
        and c.get('진행상태') in ('예정', '진행중', '오늘개강')
    ]
    low_fill.sort(key=lambda c: (c.get('배정', 0) or 0) / c['수강인원'])

    return jsonify({
        'total': len(courses),
        'status_count': status_count,
        'room_stats': room_list,
        'teacher_stats': [{'강사': t, '강의수': cnt} for t, cnt in teacher_list],
        'low_fill_courses': low_fill[:10],
    })


@app.route('/api/courses')
def api_courses():
    branch   = request.args.get('branch', '대구')
    month    = request.args.get('month', 4, type=int)
    type_key = request.args.get('type', 'weekday')
    query    = request.args.get('q', '')
    courses  = search_courses(branch, month, type_key, query)
    return jsonify({'total': len(courses), 'courses': courses})


if __name__ == '__main__':
    app.run(debug=True, port=5000)
