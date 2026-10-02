const { poolPromise } = require('./src/config/database');
async function run() {
  const pool = await poolPromise;
  const result = await pool.request().query("EXEC sp_helptext 'trans.Stored_Get_ToolingStockOnRack'");
  console.log(result.recordset.map(r => r.Text).join(''));
  process.exit(0);
}
run();
