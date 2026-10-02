const { poolPromise } = require('./src/config/database');

poolPromise.then(pool => {
  pool.request()
    .query(`
      SELECT TOP 5 * 
      FROM [db_Cost_Data_Centralized].[dbo].[tb_MRP_PO_71DZ] 
      -- Wait, the user said [master]. Let's try dbo first, if it fails try master schema.
    `)
    .then(r => {
      console.log('Top 5 rows (dbo):', r.recordset);
      process.exit(0);
    })
    .catch(err => {
      console.log('Failed dbo, trying master...');
      pool.request().query(`SELECT TOP 5 * FROM [db_Cost_Data_Centralized].[master].[tb_MRP_PO_71DZ]`)
        .then(r2 => {
          console.log('Top 5 rows (master):', r2.recordset);
          process.exit(0);
        })
        .catch(err2 => {
          console.error(err2);
          process.exit(1);
        });
    });
}).catch(console.error);
