import os
import io
from flask import Flask, render_template, jsonify, request, send_file
from flask_cors import CORS
from werkzeug.utils import secure_filename
import pandas as pd
from services.csv_service import get_available_files, get_timetable, search_courses, CSV_DIR

app = Flask(__name__)
CORS(app)

ALLOWED_EXT = {'.xlsx', '.xls', '.csv'}


@app.route('/')
def index():
    files = get_available_files()
    return render_template('index.html', available_files=files)


@app.route('/api/files')
def api_files():
    return jsonify(get_available_files())


@app.route('/api/timetable')
def api_timetable():
    month = request.args.get('month', 4, type=int)
    type_key = request.args.get('type', 'weekday')
    data = get_timetable(month, type_key)
    if data is None:
        return jsonify({'error': '파일을 찾을 수 없습니다.'}), 404
    return jsonify(data)


@app.route('/api/upload', methods=['POST'])
def api_upload():
    month    = request.form.get('month', type=int)
    type_key = request.form.get('type', '')
    file     = request.files.get('file')

    if not month or type_key not in ('weekday', 'weekend') or not file:
        return jsonify({'error': '월, 구분(평일/주말), 파일을 모두 입력해주세요.'}), 400

    _, ext = os.path.splitext(file.filename)
    if ext.lower() not in ALLOWED_EXT:
        return jsonify({'error': 'xlsx / xls / csv 파일만 업로드 가능합니다.'}), 400

    type_label = '평일' if type_key == 'weekday' else '주말'
    save_name  = f'IT대구 {month}월 {type_label} 강의 시간표{ext.lower()}'
    save_path  = os.path.join(CSV_DIR, save_name)

    # 기존 파일 백업 (같은 이름의 다른 확장자 제거)
    for old_ext in ('.xlsx', '.xls', '.csv'):
        old_path = os.path.join(CSV_DIR, f'IT대구 {month}월 {type_label} 강의 시간표{old_ext}')
        if old_path != save_path and os.path.exists(old_path):
            os.remove(old_path)

    file.save(save_path)

    # 파싱 검증
    try:
        data = get_timetable(month, type_key)
        count = data['meta']['총과정수'] if data else 0
    except Exception as e:
        os.remove(save_path)
        return jsonify({'error': f'파일 파싱 오류: {str(e)}'}), 422

    return jsonify({
        'ok': True,
        'file': save_name,
        'month': month,
        'type': type_key,
        'total': count,
    })


@app.route('/api/export')
def api_export():
    month    = request.args.get('month', 4, type=int)
    type_key = request.args.get('type', 'weekday')
    teacher  = request.args.get('teacher', '')
    room     = request.args.get('room', '')
    query    = request.args.get('q', '')

    data = get_timetable(month, type_key)
    if data is None:
        return jsonify({'error': '파일을 찾을 수 없습니다.'}), 404

    courses = data['courses']

    # 필터 적용
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
    filename = f'IT대구_{month}월_{type_label}_강의시간표.xlsx'

    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='시간표')
        ws = writer.sheets['시간표']
        # 열 너비 자동 조정
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


@app.route('/api/courses')
def api_courses():
    month = request.args.get('month', 4, type=int)
    type_key = request.args.get('type', 'weekday')
    query = request.args.get('q', '')
    courses = search_courses(month, type_key, query)
    return jsonify({'total': len(courses), 'courses': courses})


if __name__ == '__main__':
    app.run(debug=True, port=5000)
