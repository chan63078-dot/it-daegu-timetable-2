const Api = (() => {
  async function _fetch(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  return {
    getTimetable(month, type) {
      return _fetch(`/api/timetable?month=${month}&type=${type}`);
    },
    getCourses(month, type, q = '') {
      return _fetch(`/api/courses?month=${month}&type=${type}&q=${encodeURIComponent(q)}`);
    },
    getFiles() {
      return _fetch('/api/files');
    },
    upload(month, type, file) {
      const form = new FormData();
      form.append('month', month);
      form.append('type', type);
      form.append('file', file);
      return fetch('/api/upload', { method: 'POST', body: form })
        .then(res => res.json());
    },
    getEmptyRooms(month, type) {
      return _fetch(`/api/empty-rooms?month=${month}&type=${type}`);
    },
    getStats(month, type) {
      return _fetch(`/api/stats?month=${month}&type=${type}`);
    },
  };
})();
