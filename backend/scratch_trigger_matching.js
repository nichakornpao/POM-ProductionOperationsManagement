require('dotenv').config({path: __dirname + '/.env'});
const sql = require('mssql');
const fs = require('fs');
const path = require('path');

const EN_PMC_ROOT = String.raw`\\pbgm06\D\PartEN PMC`;
const pbpDwgRoot = String.raw`\\pbp083\Public\Process Engineer\Doc. ENG\DWG. Control\PMC Parts`;
const pbpLayRoot = String.raw`\\pbp083\Public\Process Engineer\Improvement Engineer\2.File scan Cutting lay-out PMC\Part PMC`;

function classifyByPath(filePath) {
    const lower = filePath.toLowerCase();
    if (['layout', 'lay'].some(k => lower.includes(k))) return 'layout';
    if (['dwg', 'drawing', 'process'].some(k => lower.includes(k))) return 'dwg';
    return 'unknown';
}

function getSearchKeys(partNo) {
    const clean = (partNo || '').trim().toUpperCase();
    if (!clean) return [];

    const keys = new Set([clean]);
    const m = clean.match(/^([A-Z0-9]{5,7})/);
    if (m) keys.add(m[1]);

    const parts = clean.split(/[-_]/);
    if (parts[0]) keys.add(parts[0]);

    if (clean.startsWith('A5') || clean.startsWith('A6') || clean.startsWith('A9')) {
        const num = clean.substring(1, 5);
        keys.add(`AS-${num}`);
        keys.add(`AS${num}`);
    }
    if (clean.startsWith('T7') || clean.startsWith('T9')) {
        const num = clean.substring(1, 5);
        keys.add(`OT-${num}`);
        keys.add(`OT${num}`);
    }

    return Array.from(keys);
}

async function findPdfsAsync(dir, key, depth = 0) {
    if (depth > 5) return [];
    let results = [];
    try {
        if (!fs.existsSync(dir)) return [];
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
    } catch (_) {}
    return results;
}

(async () => {
  try {
    const mainConfig = {
      user: process.env.DB_USER_APP,
      password: process.env.DB_PASSWORD,
      server: process.env.DB_SERVER,
      database: process.env.DB_NAME,
      options: { encrypt: false, trustServerCertificate: true }
    };
    const pool = await new sql.ConnectionPool(mainConfig).connect();

    const uniquePartNos = ['T7070-G1CT01', 'A5106-1AM1AS01'];

    for (const partNo of uniquePartNos) {
      const keys = getSearchKeys(partNo);
      let foundDwg    = null;
      let foundLayout = null;

      for (const k of keys) {
        if (foundDwg && foundLayout) break;

        let matched = await findPdfsAsync(EN_PMC_ROOT, k);
        for (const pdf of matched) {
          const type = classifyByPath(pdf);
          if (type === 'layout' && !foundLayout) foundLayout = pdf;
          if (type === 'dwg'    && !foundDwg)    foundDwg    = pdf;
        }

        if (!foundDwg) {
          const dwgMatched = await findPdfsAsync(pbpDwgRoot, k);
          for (const pdf of dwgMatched) {
            if (!foundDwg) foundDwg = pdf;
          }
        }

        if (!foundLayout) {
          const layMatched = await findPdfsAsync(pbpLayRoot, k);
          for (const pdf of layMatched) {
            if (!foundLayout) foundLayout = pdf;
          }
        }
      }

      console.log(`PartNo: ${partNo}`);
      console.log(`  -> Path_Dwg: ${foundDwg}`);
      console.log(`  -> Path_Layout: ${foundLayout}`);

      const safePartNo   = partNo.replace(/'/g, "''");
      const safePathDwg  = (foundDwg    || '').replace(/'/g, "''");
      const safePathLay  = (foundLayout || '').replace(/'/g, "''");

      if (safePathDwg || safePathLay) {
        await pool.request().query(`
          UPDATE [master].[tb_PC_Plan]
          SET Path_Dwg    = CASE WHEN (Path_Dwg IS NULL OR Path_Dwg = '' OR Path_Dwg = '-') AND '${safePathDwg}' <> '' AND (Path_Dwg_Source IS NULL OR Path_Dwg_Source <> 'manual') THEN '${safePathDwg}' ELSE Path_Dwg END,
              Path_Layout = CASE WHEN (Path_Layout IS NULL OR Path_Layout = '' OR Path_Layout = '-') AND '${safePathLay}' <> '' AND (Path_Layout_Source IS NULL OR Path_Layout_Source <> 'manual') THEN '${safePathLay}' ELSE Path_Layout END,
              Path_Dwg_Source = CASE WHEN (Path_Dwg IS NULL OR Path_Dwg = '' OR Path_Dwg = '-') AND '${safePathDwg}' <> '' AND (Path_Dwg_Source IS NULL OR Path_Dwg_Source <> 'manual') THEN 'auto' ELSE Path_Dwg_Source END,
              Path_Layout_Source = CASE WHEN (Path_Layout IS NULL OR Path_Layout = '' OR Path_Layout = '-') AND '${safePathLay}' <> '' AND (Path_Layout_Source IS NULL OR Path_Layout_Source <> 'manual') THEN 'auto' ELSE Path_Layout_Source END
          WHERE PartNo = '${safePartNo}';
        `);
      }
    }

    const checkRes = await pool.request().query(`
      SELECT Plan_ID, PlanDate, PartNo, Comment, Path_Dwg, Path_Layout
      FROM master.tb_PC_Plan
      WHERE PartNo IN ('T7070-G1CT01', 'A5106-1AM1AS01')
      ORDER BY Plan_ID DESC
    `);
    console.log('\nUpdated DB rows:', JSON.stringify(checkRes.recordset, null, 2));

    await pool.close();
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
})();
