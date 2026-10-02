const { poolPromise, sql } = require('./src/config/database');

async function run() {
  try {
    const pool = await poolPromise;
    console.log('Fixing any existing NULL RequestNo in tb_PC_Plan...');
    
    const result = await pool.request().query(`
      UPDATE [master].[tb_PC_Plan]
      SET RequestNo = 'PLAN-' + CAST(Plan_ID AS VARCHAR)
      WHERE RequestNo IS NULL;
    `);
    
    console.log('Rows updated:', result.rowsAffected[0]);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}
run();
