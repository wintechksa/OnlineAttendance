(function () {
  'use strict';
  // RFC 4180 quoted fields, escaped quotes, BOM and embedded newlines.
  function parseCsv(text) {
    var rows = [], row = [], value = '', quoted = false;
    text = String(text).replace(/^\uFEFF/, '');
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (ch === '"') {
        if (quoted && text[i + 1] === '"') { value += '"'; i++; }
        else if (quoted || !value) quoted = !quoted;
        else throw new Error('Invalid quote in CSV.');
      } else if (ch === ',' && !quoted) { row.push(value); value = ''; }
      else if ((ch === '\n' || ch === '\r') && !quoted) {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(value); if (row.some(function (cell) { return cell.trim(); })) rows.push(row);
        row = []; value = '';
      } else value += ch;
    }
    if (quoted) throw new Error('CSV contains an unclosed quoted field.');
    row.push(value); if (row.some(function (cell) { return cell.trim(); })) rows.push(row);
    if (!rows.length) return [];
    var headers = rows.shift().map(function (cell) { return cell.trim(); });
    if (new Set(headers).size !== headers.length || headers.some(function (h) { return !h; })) throw new Error('CSV headers must be unique and non-empty.');
    return rows.map(function (cells, index) {
      if (cells.length !== headers.length) throw new Error('CSV row ' + (index + 2) + ' has the wrong number of columns.');
      var record = Object.create(null);
      headers.forEach(function (key, j) { record[key] = cells[j].trim(); });
      return record;
    });
  }
  function normalizeTimestamp(value, date) {
    var raw = String(value || '').trim();
    if (!raw) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('Use YYYY-MM-DD for work_date.');
    var match = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
    if (match) {
      var h = Number(match[1]), m = Number(match[2]), s = Number(match[3] || 0);
      if (match[4]) {
        if (h < 1 || h > 12) throw new Error('Invalid attendance time.');
        h = h % 12 + (match[4].toUpperCase() === 'PM' ? 12 : 0);
      }
      if (h > 23 || m > 59 || s > 59) throw new Error('Invalid attendance time.');
      raw = date + 'T' + String(h).padStart(2, '0') + ':' + match[2] + ':' + String(s).padStart(2, '0') + '+03:00';
    } else if (/^\d{4}-\d{2}-\d{2}T/.test(raw) && !/(Z|[+-]\d{2}:?\d{2})$/i.test(raw)) raw += '+03:00';
    if (Number.isNaN(Date.parse(raw))) throw new Error('Invalid attendance timestamp.');
    return raw;
  }
  function timesheets(text) {
    return parseCsv(text).map(function (r) {
      if (!r.employee_number || !r.work_date) throw new Error('employee_number and work_date are required.');
      var clockIn = normalizeTimestamp(r.clock_in, r.work_date);
      var clockOut = normalizeTimestamp(r.clock_out, r.work_date);
      var hours = r.hours === undefined || r.hours === '' ? (clockIn && clockOut ? (Date.parse(clockOut) - Date.parse(clockIn)) / 3600000 : null) : Number(r.hours);
      if (hours !== null && (!Number.isFinite(hours) || hours < 0 || hours > 24)) throw new Error('Hours must be between 0 and 24. Use the next date for overnight clock-out.');
      return { employee_number: r.employee_number, full_name: r.full_name || null, work_date: r.work_date, clock_in: clockIn, clock_out: clockOut,
        hours: hours === null ? null : Math.round(hours * 100) / 100, status: r.status || 'present', notes: r.notes || null };
    });
  }
  window.OAAttendance = { parseCsv: parseCsv, normalizeTimestamp: normalizeTimestamp, timesheets: timesheets };
})();
