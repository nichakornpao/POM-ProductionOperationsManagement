const { poolPromise } = require('./src/config/database');
const fs = require('fs');
const path = require('path');

async function restorePbp083Layouts() {
  try {
    const pool = await poolPromise;
    console.log('1. Prioritizing \\\\pbp083 for Path_Layout in master.tb_PC_Plan...');

    const pbpLayRoot = String.raw`\\pbp083\Public\Process Engineer\Improvement Engineer\2.File scan Cutting lay-out PMC\Part PMC`;
    const pbpDwgRoot = String.raw`\\pbp083\Public\Process Engineer\Doc. ENG\DWG. Control\PMC Parts`;

    async function findPdfs(dir, key, depth = 0) {
      if (depth > 6) return [];
      let results = [];
      try {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        for (const e of entries) {
          const full = path.join(dir, e.name);
          if (e.isDirectory()) {
            if (['OBSOLATE', 'OLD', 'NO USE'].some(s => e.name.toUpperCase().includes(s))) continue;
            const sub = await findPdfs(full, key, depth + 1);
            results = results.concat(sub);
          } else if (e.isFile() && e.name.toLowerCase().endsWith('.pdf')) {
            const filename = e.name.toUpperCase();
            if (filename.includes(key.toUpperCase()) || full.toUpperCase().includes(key.toUpperCase())) {
              results.push(full);
            }
          }
        }
      } catch (_) {}
      return results;
    }

    const planRows = await pool.request().query(`
      SELECT Plan_ID, PartNo, Path_Dwg, Path_Layout FROM master.tb_PC_Plan
    `);

    let updatedCount = 0;

    for (const row of planRows.recordset) {
      const partNo = (row.PartNo || '').trim();
      if (!partNo) continue;

      const keys = [partNo, partNo.split('-')[0]];

      for (const k of keys) {
        const layPdfs = await findPdfs(pbpLayRoot, k);
        if (layPdfs.length > 0) {
          const pbpLayoutPath = layPdfs[0];
          const safePath = pbpLayoutPath.replace(/'/g, "''");

          // Update Path_Layout to pbp083 path
          await pool.request().query(`
            UPDATE [master].[tb_PC_Plan]
            SET Path_Layout = '${safePath}', Path_Layout_Source = 'auto'
            WHERE Plan_ID = ${row.Plan_ID};
          `);
          updatedCount++;
          break;
        }
      }
    }

    console.log(`Updated Path_Layout to \\\\pbp083 path for ${updatedCount} rows.`);

    // Check T7070-G1CT01 specifically
    const checkRes = await pool.request().query(`
      SELECT Plan_ID, PartNo, Path_Dwg, Path_Layout FROM master.tb_PC_Plan WHERE PartNo = 'T7070-G1CT01'
    `);
    console.log('Restored DB state for T7070-G1CT01:');
    console.table(checkRes.recordset);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit();
  }
}

restorePbp083Layouts();
