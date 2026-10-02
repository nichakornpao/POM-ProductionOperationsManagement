const { poolPromise } = require('./src/config/database');

poolPromise.then(pool => {
  pool.request()
    .execute('[trans].[Stored_Get_ToolingMaster]')
    .then(r => {
      const data = r.recordset;
      const duplicates = data.filter(d => d.ItemNo === 'P122522A');
      console.log('Duplicates for P122522A:', duplicates);
      process.exit(0);
    })
    .catch(console.error);
}).catch(console.error);
