const { poolPromise } = require('./src/config/database');

poolPromise.then(pool => {
  pool.request()
    .execute('[trans].[Stored_Get_ToolingMaster]')
    .then(r => {
      const data = r.recordset;
      const weirdItems = data.filter(d => 
        d.ItemNo === '0' || d.ItemNo === '-' || d.ItemNo === ''
      );
      console.log('Weird items in DB:', weirdItems.slice(0, 10));
      process.exit(0);
    })
    .catch(console.error);
}).catch(console.error);
