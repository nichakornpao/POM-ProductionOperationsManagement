const { poolPromise } = require('./src/config/database');

poolPromise.then(pool => {
  pool.request()
    .execute('[trans].[Stored_Get_ToolingMaster]')
    .then(r => {
      const data = r.recordset;
      const a5a65 = data.filter(d => d.PartNo && d.PartNo.startsWith('A5A65'));
      console.log('All A5A65 in DB:', a5a65);
      process.exit(0);
    })
    .catch(console.error);
}).catch(console.error);
