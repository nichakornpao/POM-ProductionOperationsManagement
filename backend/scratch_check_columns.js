const { poolPromise } = require('./src/config/database');

poolPromise.then(pool => {
  pool.request()
    .execute('[trans].[Stored_Get_ToolingMaster]')
    .then(r => {
      const data = r.recordset;
      if (data.length > 0) {
        console.log('Columns in ToolingMaster SP:', Object.keys(data[0]));
        const sample = data.find(d => d.ItemNo === 'P122522A');
        console.log('Sample data for P122522A:', sample);
      }
      process.exit(0);
    })
    .catch(console.error);
}).catch(console.error);
