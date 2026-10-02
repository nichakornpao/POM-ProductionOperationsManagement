const { poolPromise } = require('./src/config/database');
const fs = require('fs');

async function updateLayout() {
  try {
    const realPath = String.raw`\\pbp083\Public\Process Engineer\Improvement Engineer\2.File scan Cutting lay-out PMC\Part PMC\OT-7070\Cutting layout BM165\TH\T7070-G1C & T7070-G1CT01 Rev.H.pdf`;

    console.log('Checking real path existence:');
    console.log('Path:', realPath);
    console.log('Exists on disk?', fs.existsSync(realPath));

    if (!fs.existsSync(realPath)) {
      console.error('❌ File does not exist at real path!');
      process.exit(1);
    }

    const pool = await poolPromise;
    const safePath = realPath.replace(/'/g, "''");

    const result = await pool.request().query(`
      UPDATE [master].[tb_PC_Plan]
      SET Path_Layout = '${safePath}', Path_Layout_Source = 'auto'
      WHERE PartNo LIKE '%T7070-G1CT01%'
    `);

    console.log(`✅ Updated ${result.rowsAffected[0]} rows in master.tb_PC_Plan with valid Layout path!`);
    process.exit(0);
  } catch (err) {
    console.error('Error updating layout path:', err);
    process.exit(1);
  }
}

updateLayout();
