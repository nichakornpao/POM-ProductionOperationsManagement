require('dotenv').config();
const { sql, poolPromise } = require('./src/config/database.js');
async function run() {
  try {
    const pool = await poolPromise;
    const res = await pool.request().query("SELECT OBJECT_DEFINITION(OBJECT_ID('viewer.View_CaseSetup_Request')) AS Def");
    console.log(res.recordset[0].Def);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}
run();
