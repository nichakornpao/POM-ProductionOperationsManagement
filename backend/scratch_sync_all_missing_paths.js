const { poolPromise } = require('./src/config/database');
const fs = require('fs');
const path = require('path');

const uploadsRoot = String.raw`\\pbgm06\D\PartEN PMC`;
const pbpDwgRoot = String.raw`\\pbp083\Public\Process Engineer\Doc. ENG\DWG. Control\PMC Parts`;

function classifyByPath(filePath) {
  const lower = filePath.toLowerCase();
  if (['layout', 'lay'].some(k => lower.includes(k))) return 'layout';
  if (['dwg', 'drawing', 'process'].some(k => lower.includes(k))) return 'dwg';
  return 'unknown';
}

async function findPdfsDeepAsync(dir, depth = 0) {
  if (depth > 5) return [];
  let results = [];
  try {
    const fsPromises = fs.promises;
    const entries = await fsPromises.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (['OBSOLATE', 'OLD', 'NO USE'].some(s => e.name.toUpperCase().includes(s))) continue;
        const subResults = await findPdfsDeepAsync(full, depth + 1);
        results = results.concat(subResults);
      } else if (e.isFile() && e.name.toLowerCase().endsWith('.pdf')) {
        results.push(full);
      }
    }
  } catch (_) {}
  return results;
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

async function syncAllMissingPaths() {
  try {
    const mainPool = await poolPromise;
    console.log('Fetching rows with missing Path_Dwg or Path_Layout in master.tb_PC_Plan...');
    
    const missingResult = await mainPool.request().query(`
      SELECT DISTINCT PartNo 
      FROM master.tb_PC_Plan 
      WHERE (Path_Dwg IS NULL OR Path_Layout IS NULL OR Path_Dwg = '' OR Path_Layout = '')
    `);

    console.log(`Found ${missingResult.recordset.length} distinct PartNos with missing paths.`);
    if (missingResult.recordset.length === 0) {
      console.log('All paths are already populated!');
      process.exit();
    }

    console.log('Scanning PDF directories...');
    const allPdfs = await findPdfsDeepAsync(uploadsRoot);
    const pbpPdfs = await findPdfsDeepAsync(pbpDwgRoot);
    const combinedPdfs = allPdfs.concat(pbpPdfs);
    console.log(`Scanned ${combinedPdfs.length} total PDF files.`);

    let updatedCount = 0;
    let autoMapSql = '';

    for (let i = 0; i < missingResult.recordset.length; i++) {
      const partNo = (missingResult.recordset[i].PartNo || '').trim();
      if (!partNo) continue;

      const keys = getSearchKeys(partNo);
      let foundDwg = null;
      let foundLayout = null;

      for (const k of keys) {
        if (foundDwg && foundLayout) break;
        const matched = combinedPdfs.filter(pdf => {
          return path.basename(pdf).toUpperCase().includes(k.toUpperCase()) || pdf.toUpperCase().includes(k.toUpperCase());
        });

        for (const pdf of matched) {
          const type = classifyByPath(pdf);
          if (type === 'layout' && !foundLayout) foundLayout = pdf;
          if (type === 'dwg' && !foundDwg) foundDwg = pdf;
        }

        if (!foundDwg && matched.length > 0) foundDwg = matched[0];
        if (!foundLayout && matched.length > 1) foundLayout = matched[1];
      }

      if (foundDwg || foundLayout) {
        const safePartNo = partNo.replace(/'/g, "''");
        const safeDwg = (foundDwg || '').replace(/'/g, "''");
        const safeLayout = (foundLayout || '').replace(/'/g, "''");

        autoMapSql += `
          UPDATE [master].[tb_PC_Plan]
          SET Path_Dwg = CASE WHEN '${safeDwg}' <> '' AND (Path_Dwg_Source IS NULL OR Path_Dwg_Source <> 'manual') THEN '${safeDwg}' ELSE Path_Dwg END,
              Path_Layout = CASE WHEN '${safeLayout}' <> '' AND (Path_Layout_Source IS NULL OR Path_Layout_Source <> 'manual') THEN '${safeLayout}' ELSE Path_Layout END,
              Path_Dwg_Source = CASE WHEN '${safeDwg}' <> '' AND (Path_Dwg_Source IS NULL OR Path_Dwg_Source <> 'manual') THEN 'auto' ELSE Path_Dwg_Source END,
              Path_Layout_Source = CASE WHEN '${safeLayout}' <> '' AND (Path_Layout_Source IS NULL OR Path_Layout_Source <> 'manual') THEN 'auto' ELSE Path_Layout_Source END
          WHERE PartNo = '${safePartNo}'
            AND ((Path_Dwg_Source IS NULL OR Path_Dwg_Source <> 'manual') OR (Path_Layout_Source IS NULL OR Path_Layout_Source <> 'manual'));
        \n`;
        updatedCount++;
      }

      if (autoMapSql && ((i + 1) % 20 === 0 || i === missingResult.recordset.length - 1)) {
        await mainPool.request().query(autoMapSql);
        autoMapSql = '';
      }
    }

    console.log(`✅ Successfully updated ${updatedCount} parts in master.tb_PC_Plan!`);

  } catch (err) {
    console.error('Error during syncAllMissingPaths:', err);
  } finally {
    process.exit();
  }
}

syncAllMissingPaths();
