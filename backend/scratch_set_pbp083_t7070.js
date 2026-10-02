const { poolPromise } = require('./src/config/database');

async function setPbp083ForT7070() {
  try {
    const pool = await poolPromise;
    const pbpDwg = String.raw`\\pbp083\Public\Process Engineer\Doc. ENG\DWG. Control\PMC Parts\Process DWG\OT-7070\T7070-G1CT01.pdf`;
    const pbpLayout = String.raw`\\pbp083\Public\Process Engineer\Improvement Engineer\2.File scan Cutting lay-out PMC\Part PMC\OT-7070\Cutting layout BM165\TH\T7070-G1C & T7070-G1CT01 Rev.H.pdf`;

    await pool.request().query(`
      UPDATE [master].[tb_PC_Plan]
      SET Path_Dwg = '${pbpDwg.replace(/'/g, "''")}',
          Path_Layout = '${pbpLayout.replace(/'/g, "''")}',
          Path_Dwg_Source = 'auto',
          Path_Layout_Source = 'auto'
      WHERE PartNo = 'T7070-G1CT01';
    `);

    const res = await pool.request().query(`
      SELECT Plan_ID, PartNo, Path_Dwg, Path_Layout FROM [master].[tb_PC_Plan] WHERE PartNo = 'T7070-G1CT01'
    `);
    console.log('Confirmed DB state for T7070-G1CT01:');
    console.table(res.recordset);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

setPbp083ForT7070();
