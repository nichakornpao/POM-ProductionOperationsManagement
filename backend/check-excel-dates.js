const xlsx = require('xlsx');
const excelPath = '\\\\fs1\\GM\\blackamoor\\Issue-Return record1.xlsx';

const workbook = xlsx.readFile(excelPath, { cellDates: true, dense: true });
const sheetName = workbook.SheetNames[0];
const rawRows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: null });

// Find R08856 and nearby rows
const targets = ['R08856', 'R08855', 'R08854', 'R08853', 'R08852'];
for (let i = 2; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!row || !row[0]) continue;
    if (targets.includes(row[0].toString().trim())) {
        const dateRaw = row[1];
        const dateObj = dateRaw instanceof Date ? dateRaw : (dateRaw ? new Date(dateRaw) : null);
        console.log(`${row[0]} | Excel Date: ${JSON.stringify(dateRaw)} | Parsed: ${dateObj ? dateObj.toISOString() : 'null'}`);
    }
}
