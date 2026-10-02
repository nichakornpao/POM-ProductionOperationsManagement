const { poolPromise, sql } = require('./src/config/database');

async function run() {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      EXEC [trans].[Stored_PCPlan_Query]
    `);
    console.log("Success! Rows:", result.recordset?.length);
  } catch (err) {
    console.error("Query Error:", err.message);
  } finally {
    process.exit();
  }
}
run();
