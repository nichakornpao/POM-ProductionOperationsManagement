const sql = require('mssql');
const { forecastProjectConfig } = require('./backend/src/config/database');
sql.connect(forecastProjectConfig).then(pool => {
  return pool.request().query("sp_helptext 'trans.Stored_PCPlan_Query'");
}).then(res => {
  console.log(res.recordset.map(r => r.Text).join(''));
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
