const { poolPromise } = require('./src/config/database');
const fs = require('fs');

async function updateT7164Exact() {
  try {
    const dwgPath = String.raw`\\pbp083\Public\Process Engineer\Doc. ENG\DWG. Control\PMC Parts\Process DWG\OT-7164\T7164-G2A.pdf`;
    const layoutPath = String.raw`\\pbp083\Public\Process Engineer\Improvement Engineer\2.File scan Cutting lay-out PMC\Part PMC\OT-7164\Cutting layout BW12\T7164-G2AS1 Rev.A.pdf`;

    console.log('Checking T7164-G2A files:');
    console.log('DWG path:', dwgPath, 'Exists?', fs.existsSync(dwgPath));
    console.log('Layout path:', layoutPath, 'Exists?', fs.existsSync(layoutPath));

    const pool = await poolPromise;
    const safeDwg = dwgPath.replace(/'/g, "''");
    const safeLayout = layoutPath.replace(/'/g, "''");

    const result = await pool.request().query(`
      UPDATE [master].[tb_PC_Plan]
      SET Path_Dwg = '${safeDwg}',
          Path_Layout = '${safeLayout}',
          Path_Dwg_Source = 'auto',
          Path_Layout_Source = 'auto'
      WHERE PartNo = 'T7164-G2A'
    `);

    console.log(`✅ Updated ${result.rowsAffected[0]} rows for PartNo T7164-G2A with exact DWG and Layout paths!`);
    process.exit(0);
  } catch (err) {
    console.error('Error updating T7164-G2A paths:', err);
    process.exit(1);
  }
}

updateT7164Exact();
