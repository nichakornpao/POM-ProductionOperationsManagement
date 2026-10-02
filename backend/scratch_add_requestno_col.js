const { poolPromise, poolRequestIndirrecPromise } = require('./src/config/database');
const fs = require('fs');
const path = require('path');

async function addRequestNoAndFixLayouts() {
  try {
    const pool = await poolPromise;
    console.log('1. Checking RequestNo column in master.tb_PC_Plan...');
    
    // Add RequestNo column if it doesn't exist
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = 'master' AND TABLE_NAME = 'tb_PC_Plan' AND COLUMN_NAME = 'RequestNo'
      )
      BEGIN
        ALTER TABLE [master].[tb_PC_Plan] ADD RequestNo NVARCHAR(50) NULL;
      END
    `);

    // Populate RequestNo for all rows with PLAN-ID fallback
    console.log('2. Populating RequestNo in master.tb_PC_Plan...');
    await pool.request().query(`
      UPDATE [master].[tb_PC_Plan]
      SET RequestNo = 'PLAN-' + CAST(Plan_ID AS VARCHAR)
      WHERE RequestNo IS NULL OR RequestNo = '';
    `);

    // Fetch RequestNo from RequestindirrecMaterial DB
    try {
      const indirrecPool = await poolRequestIndirrecPromise;
      const enRes = await indirrecPool.request().query(`
        SELECT DISTINCT RequestNo, PartNo FROM dbo.EngineerPMCpart WHERE RequestNo IS NOT NULL AND RequestNo <> ''
      `);
      console.log(`Found ${enRes.recordset.length} EN RequestNo mappings.`);

      for (const row of enRes.recordset) {
        const safeReq = row.RequestNo.replace(/'/g, "''");
        const safePart = row.PartNo.replace(/'/g, "''");
        await pool.request().query(`
          UPDATE [master].[tb_PC_Plan]
          SET RequestNo = '${safeReq}'
          WHERE PartNo = '${safePart}' AND RequestNo LIKE 'PLAN-%';
        `);
      }
    } catch (e) {
      console.error('Failed to link EngineerPMCpart RequestNo:', e.message);
    }

    console.log('3. Searching layout files for NULL Path_Layout rows...');
    const layRoot = String.raw`\\pbp083\Public\Process Engineer\Improvement Engineer\2.File scan Cutting lay-out PMC\Part PMC`;
    const gmLayRoot = String.raw`\\pbgm06\D\PartEN PMC`;

    async function findPdfs(dir, key, depth = 0) {
      if (depth > 5) return [];
      let results = [];
      try {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        for (const e of entries) {
          const full = path.join(dir, e.name);
          if (e.isDirectory()) {
            if (['OBSOLATE', 'OLD'].some(s => e.name.toUpperCase().includes(s))) continue;
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

    const missingLayouts = await pool.request().query(`
      SELECT DISTINCT PartNo FROM [master].[tb_PC_Plan] WHERE Path_Layout IS NULL OR Path_Layout = ''
    `);

    console.log(`Found ${missingLayouts.recordset.length} parts with missing Path_Layout.`);

    for (const r of missingLayouts.recordset) {
      const partNo = (r.PartNo || '').trim();
      if (!partNo) continue;

      let matched = await findPdfs(layRoot, partNo);
      if (matched.length === 0) {
        matched = await findPdfs(gmLayRoot, partNo);
      }

      if (matched.length > 0) {
        const layoutFile = matched[0];
        console.log(`Found Layout for ${partNo}: ${layoutFile}`);
        const safePath = layoutFile.replace(/'/g, "''");
        await pool.request().query(`
          UPDATE [master].[tb_PC_Plan]
          SET Path_Layout = '${safePath}', Path_Layout_Source = 'auto'
          WHERE PartNo = '${partNo.replace(/'/g, "''")}' AND (Path_Layout IS NULL OR Path_Layout = '');
        `);
      }
    }

    console.log('Schema & data update completed successfully.');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit();
  }
}

addRequestNoAndFixLayouts();
