import os
from flask import Flask, render_template, jsonify, request
from flask_cors import CORS
from werkzeug.utils import secure_filename
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


@app.route('/api/courses')
def api_courses():
    month = request.args.get('month', 4, type=int)
    type_key = request.args.get('type', 'weekday')
    query = request.args.get('q', '')
    courses = search_courses(month, type_key, query)
    return jsonify({'total': len(courses), 'courses': courses})


if __name__ == '__main__':
    app.run(debug=True, port=5000)
