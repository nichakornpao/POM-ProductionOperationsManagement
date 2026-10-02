require('dotenv').config({path: __dirname + '/.env'});
const { poolPromise } = require('./src/config/database');
const fs = require('fs');
const path = require('path');

const EN_PMC_ROOT = String.raw`\\pbgm06\D\PartEN PMC`;
const DWG_KEYWORDS    = ['dwg', 'drawing', 'process'];
const LAYOUT_KEYWORDS = ['layout', 'lay'];

function classifyByPath(filePath) {
  const lower = filePath.toLowerCase();
  if (LAYOUT_KEYWORDS.some(k => lower.includes(k))) return 'layout';
  if (DWG_KEYWORDS.some(k => lower.includes(k)))    return 'dwg';
  return 'unknown';
}

function findPdfsSync(dir, key, depth = 0) {
  if (depth > 6) return [];
  let results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (['OBSOLATE', 'OLD'].some(s => e.name.toUpperCase().includes(s))) continue;
        results = results.concat(findPdfsSync(full, key, depth + 1));
      } else if (e.isFile() && e.name.toLowerCase().endsWith('.pdf')) {
        if (e.name.toUpperCase().includes(key.toUpperCase()) || full.toUpperCase().includes(key.toUpperCase())) {
          results.push(full);
        }
      }
    }
  } catch (_) {}
  return results;
}

(async () => {
  try {
    const pool = await poolPromise;

    console.log('--- RE-SCANNING filesystem (\\\\pbgm06\\D\\PartEN PMC) to restore DWG/Layout paths for all PartNos ---');

    const planParts = await pool.request().query("SELECT DISTINCT PartNo FROM [master].[tb_PC_Plan] WHERE PartNo IS NOT NULL AND PartNo <> ''");
    console.log(`Found ${planParts.recordset.length} unique PartNos in tb_PC_Plan to check.`);

    let updatedCount = 0;
    for (const r of planParts.recordset) {
      const partNo = r.PartNo.trim();
      const matched = findPdfsSync(EN_PMC_ROOT, partNo);
      if (matched.length === 0) continue;

      let foundDwg = null;
      let foundLayout = null;

      for (const pdf of matched) {
        const type = classifyByPath(pdf);
        if (type === 'layout' && !foundLayout) foundLayout = pdf;
        if (type === 'dwg' && !foundDwg) foundDwg = pdf;
      }

      // STRICT: Only assign if explicit DWG or Layout keyword is present (No random guessing)
      const safePartNo = partNo.replace(/'/g, "''");
      const safeDwg = foundDwg ? foundDwg.replace(/'/g, "''") : '';
      const safeLayout = foundLayout ? foundLayout.replace(/'/g, "''") : '';

      if (!safeDwg && !safeLayout) continue;

      const res = await pool.request().query(`
        UPDATE [master].[tb_PC_Plan]
        SET Path_Dwg = CASE WHEN '${safeDwg}' <> '' AND (Path_Dwg_Source IS NULL OR Path_Dwg_Source <> 'manual') THEN '${safeDwg}' ELSE Path_Dwg END,
            Path_Layout = CASE WHEN '${safeLayout}' <> '' AND (Path_Layout_Source IS NULL OR Path_Layout_Source <> 'manual') THEN '${safeLayout}' ELSE Path_Layout END,
            Path_Dwg_Source = CASE WHEN '${safeDwg}' <> '' AND (Path_Dwg_Source IS NULL OR Path_Dwg_Source <> 'manual') THEN 'auto' ELSE Path_Dwg_Source END,
            Path_Layout_Source = CASE WHEN '${safeLayout}' <> '' AND (Path_Layout_Source IS NULL OR Path_Layout_Source <> 'manual') THEN 'auto' ELSE Path_Layout_Source END
        WHERE PartNo = '${safePartNo}'
          AND ((Path_Dwg IS NULL OR Path_Dwg = '' OR Path_Dwg = '-') OR (Path_Layout IS NULL OR Path_Layout = '' OR Path_Layout = '-'));
      `);

      if (res.rowsAffected[0] > 0) {
        console.log(`  Restored ${res.rowsAffected[0]} rows for ${partNo} | DWG: ${safeDwg ? 'Yes' : 'No'} | LAY: ${safeLayout ? 'Yes' : 'No'}`);
        updatedCount += res.rowsAffected[0];
      }
    }

    console.log(`\n✅ RESTORED PDF paths for ${updatedCount} rows in master.tb_PC_Plan!`);

    const finalStatus = await pool.request().query(`
      SELECT 
        COUNT(*) as total_rows,
        SUM(CASE WHEN Path_Dwg IS NOT NULL AND Path_Dwg <> '' AND Path_Dwg <> '-' THEN 1 ELSE 0 END) as rows_with_dwg,
        SUM(CASE WHEN Path_Layout IS NOT NULL AND Path_Layout <> '' AND Path_Layout <> '-' THEN 1 ELSE 0 END) as rows_with_layout,
        SUM(CASE WHEN (Path_Dwg IS NULL OR Path_Dwg = '' OR Path_Dwg = '-') AND (Path_Layout IS NULL OR Path_Layout = '' OR Path_Layout = '-') THEN 1 ELSE 0 END) as rows_empty
      FROM [master].[tb_PC_Plan]
    `);

    console.log('\nFinal DB Path Status:', finalStatus.recordset[0]);

    process.exit(0);
  } catch (err) {
    console.error('Error re-scanning PDFs:', err);
    process.exit(1);
  }
})();
