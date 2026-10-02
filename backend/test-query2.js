const { poolPromise } = require('./src/config/database');
async function run() {
  const pool = await poolPromise;
  const result = await pool.request().query("SELECT PathDwg FROM request_purchase WHERE RequestNo = 'RO8855'");
  console.log(result.recordset);
  process.exit();
}
run();
