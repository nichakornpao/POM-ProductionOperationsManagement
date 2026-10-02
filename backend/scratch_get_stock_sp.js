const { poolPromise } = require('./src/config/database');
poolPromise.then(pool => {
  pool.request().query("EXEC sp_helptext 'trans.Stored_Get_ToolingStockOnRack'").then(res => {
    console.log(res.recordset.map(r => r.Text).join(''));
    process.exit(0);
  }).catch(e => {
    console.error(e);
    process.exit(1);
  });
});
