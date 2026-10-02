require('dotenv').config({ path: './.env' });
const { poolPromise } = require('./src/config/database');

poolPromise.then(async pool => {
  const result = await pool.request().query(`EXEC sp_helptext '[viewer].[View_IssueSetupTool_Request_Document]'`);
  console.log(result.recordset.map(r => r.Text).join(''));
  process.exit(0);
}).catch(e => {
  console.error(e);
  process.exit(1);
});
