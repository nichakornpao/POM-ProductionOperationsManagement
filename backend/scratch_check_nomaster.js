const { poolPromise } = require('./src/config/database');

poolPromise.then(pool => {
  pool.request()
    .execute('[trans].[Stored_Get_ToolingMaster]')
    .then(r => {
      const data = r.recordset;
      const noMaster = data.filter(d => 
        (d.ItemNo && d.ItemNo.includes('MASTER')) || 
        (d.PartNo && d.PartNo.includes('MASTER'))
      );
      console.log('NO MASTER IN DB:', noMaster);
      process.exit(0);
    })
    .catch(console.error);
}).catch(console.error);
