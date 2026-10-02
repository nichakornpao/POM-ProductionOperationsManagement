const { poolPromise, sql } = require('./src/config/database');

async function run() {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT OBJECT_DEFINITION(OBJECT_ID('Stored_Master_HistoryPrint_Insert')) AS SP_Text
    `);
    
    console.log(result.recordset[0].SP_Text);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}
run();
