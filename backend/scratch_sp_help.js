const fs = require('fs');
const { poolPromise } = require('./src/config/database');

poolPromise.then(pool => {
  pool.request()
    .execute('[trans].[Stored_Get_ItemMaster_Minimal]')
    .then(r => {
      const p122257a = r.recordset.find(d => d.ItemNo === 'P122257A');
      console.log('p122257a from SP:', p122257a);
      process.exit(0);
    })
    .catch(console.error);
}).catch(console.error);
