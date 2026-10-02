const fs = require('fs');
const path = require('path');
const { poolPromise } = require('./src/config/database');

const EN_PMC_ROOT = String.raw`\\pbgm06\D\PartEN PMC`;
const DWG_KEYWORDS    = ['dwg', 'drawing', 'process'];
const LAYOUT_KEYWORDS = ['layout', 'lay'];

function classifyByPath(filePath) {
  const lower = filePath.toLowerCase();
  if (LAYOUT_KEYWORDS.some(k => lower.includes(k))) return 'layout';
  if (DWG_KEYWORDS.some(k => lower.includes(k)))    return 'dwg';
  return 'unknown';
}

async function findPdfsAsync(dir, key, depth = 0) {
  if (depth > 5) return [];
  let results = [];
  try {
    const fsPromises = fs.promises;
    const entries = await fsPromises.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (['OBSOLATE', 'OLD', 'NO USE'].some(s => e.name.toUpperCase().includes(s))) continue;
        const sub = await findPdfsAsync(full, key, depth + 1);
        results = results.concat(sub);
      } else if (e.isFile() && e.name.toLowerCase().endsWith('.pdf')) {
        const filename = e.name.toUpperCase();
        const fullUpper = full.toUpperCase();
        if (filename.includes(key.toUpperCase()) || fullUpper.includes(key.toUpperCase())) {
          results.push(full);
        }
      }
    }
  } catch (err) {
    console.error(`Error reading ${dir}:`, err.message);
  }
  return results;
}

async function main() {
  console.log('Searching for OT-7087A in', EN_PMC_ROOT);
  const searchKey = '7087';
  const pdfs = await findPdfsAsync(EN_PMC_ROOT, searchKey);
  console.log(`Found ${pdfs.length} PDFs for key ${searchKey}:`);
  pdfs.forEach(p => console.log('  -', p, '=> Type:', classifyByPath(p)));

  // Also check database record for OT-7087A
  const pool = await poolPromise;
  const result = await pool.request().query(`
    SELECT Unique_Id, PlanDate, PartNo, Path_Dwg, Path_Layout, Path_Dwg_Source, Path_Layout_Source
    FROM master.tb_PC_Plan
    WHERE PartNo LIKE '%7087%' OR PartNo LIKE '%OT-7087A%'
  `);
  console.log('\nDB Rows in master.tb_PC_Plan:');
  console.table(result.recordset);

  process.exit();
}

main();
