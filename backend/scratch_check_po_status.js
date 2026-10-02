const { poolPromise } = require('./src/config/database');

poolPromise.then(pool => {
  pool.request()
    .query(`
      SELECT DISTINCT [Status] 
      FROM [db_Cost_Data_Centralized].[master].[tb_MRP_PO_71DZ]
    `)
    .then(r => {
      console.log('Distinct Statuses:', r.recordset);
      process.exit(0);
    })
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}).catch(console.error);
