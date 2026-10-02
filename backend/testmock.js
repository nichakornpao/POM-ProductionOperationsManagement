const mssql = require('mssql');
const config = require('./src/config/database');

async function run() {
  try {
    const pool = await mssql.connect(config.configRequestIndirrec);
    const result = await pool.request().query("SELECT ItemNo, QTY FROM [dbo].[TestPurchaseRequestList] WHERE Status = 'Waiting'");
    console.log(result.recordset);
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
run();
