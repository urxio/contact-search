const XLSX = require('xlsx');
const wb = XLSX.readFile('/Users/borisfosso/Downloads/Lacy Boulevard A-Z Zipcodes Tracker.xlsx', { dense: true, sheetRows: 0 });
wb.SheetNames.forEach(name => {
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '', header: 1 });
  // last row has total pages in col B
  const lastRow = rows[rows.length - 1];
  const totalPages = lastRow ? lastRow[1] : null;
  // data rows: skip header (row 0) and last row, keep rows where col A is not empty
  const data = rows.slice(1, rows.length - 1).filter(r => r[0] !== '' && r[0] !== undefined);
  const parts = name.split(' ');
  const zipcode = parts[parts.length - 1];
  const city = parts.slice(0, parts.length - 1).join(' ');
  console.log(JSON.stringify({ sheet: name, city, zipcode, totalPages, segments: data.map(r => ({ page_start: r[0], page_end: r[1], owner: String(r[2]||'').replace(/[\u{1F300}-\u{1FFFF}]/gu,'').replace(/[\u2600-\u27FF]/g,'').trim(), stopped_at_page: r[3]||null, status: r[4]||'Not started', notes: r[7]||'' })) }));
});
