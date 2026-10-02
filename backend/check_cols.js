const { poolPromise } = require('./src/config/database');
async function test() {
  try {
    const pool = await poolPromise;
    const res = await pool.request().query('SELECT TOP 1 * FROM [dbo].[tb_IssueCuttingTool_Request_Document]');
    console.log(Object.keys(res.recordset[0]));
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}
test();
