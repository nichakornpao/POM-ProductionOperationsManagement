const { poolPromise, sql } = require('./src/config/database');

async function run() {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT TOP 1 *
      FROM [master].[tb_PC_Plan]
    `);
    console.log(Object.keys(result.recordset[0]).join(', '));
  } catch (err) {
    console.error("Query Error:", err.message);
  } finally {
    process.exit();
  }
}
run();
