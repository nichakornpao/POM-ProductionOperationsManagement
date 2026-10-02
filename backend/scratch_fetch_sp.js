const { poolPromise, sql } = require('./src/config/database');

async function run() {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT OBJECT_DEFINITION(OBJECT_ID('trans.Stored_PCPlan_Insert_All_Snapshot_Excel')) AS SP_Text
    `);
    
    console.log(result.recordset[0].SP_Text);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}
run();
