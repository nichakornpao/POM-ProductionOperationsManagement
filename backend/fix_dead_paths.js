const { poolPromise } = require('./src/config/database');
const fs = require('fs');

async function fixDeadPaths() {
  try {
    const pool = await poolPromise;
    console.log('Checking database for dead file paths in master.tb_PC_Plan...');

    const result = await pool.request().query(`
      SELECT Plan_ID, PartNo, Path_Dwg, Path_Layout
      FROM [master].[tb_PC_Plan]
      WHERE (Path_Dwg IS NOT NULL AND Path_Dwg <> '-' AND Path_Dwg <> '')
         OR (Path_Layout IS NOT NULL AND Path_Layout <> '-' AND Path_Layout <> '')
    `);

    console.log(`Auditing ${result.recordset.length} rows...`);
    let deadDwgCount = 0;
    let deadLayoutCount = 0;

    for (const row of result.recordset) {
      let updateDwg = false;
      let updateLayout = false;

      if (row.Path_Dwg && row.Path_Dwg !== '-' && row.Path_Dwg.trim() !== '') {
        if (!fs.existsSync(row.Path_Dwg)) {
          console.log(`[DEAD DWG] Plan_ID ${row.Plan_ID} (${row.PartNo}): ${row.Path_Dwg}`);
          updateDwg = true;
          deadDwgCount++;
        }
      }

      if (row.Path_Layout && row.Path_Layout !== '-' && row.Path_Layout.trim() !== '') {
        if (!fs.existsSync(row.Path_Layout)) {
          console.log(`[DEAD LAYOUT] Plan_ID ${row.Plan_ID} (${row.PartNo}): ${row.Path_Layout}`);
          updateLayout = true;
          deadLayoutCount++;
        }
      }

      if (updateDwg || updateLayout) {
        let setClauses = [];
        if (updateDwg) setClauses.push("Path_Dwg = '-'");
        if (updateLayout) setClauses.push("Path_Layout = '-'");

        await pool.request().query(`
          UPDATE [master].[tb_PC_Plan]
          SET ${setClauses.join(', ')}
          WHERE Plan_ID = ${row.Plan_ID}
        `);
      }
    }

    console.log(`✅ Dead path audit finished. Cleaned ${deadDwgCount} dead Dwg paths and ${deadLayoutCount} dead Layout paths.`);
    process.exit(0);
  } catch (err) {
    console.error('Error during path audit:', err);
    process.exit(1);
  }
}

fixDeadPaths();
