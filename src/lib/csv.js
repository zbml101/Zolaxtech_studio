// Turns rows into CSV that opens correctly in Excel and Google Sheets (UTF-8 with a BOM, so Amharic shows properly).
const cell = (v) => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

function toCsv(columns, rows) {
  const head = columns.map((c) => cell(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => cell(c.value(r))).join(','));
  return '\uFEFF' + [head, ...body].join('\r\n') + '\r\n';
}

module.exports = { toCsv };
