const { poolPromise } = require('./src/config/database');

poolPromise.then(async pool => {
  const masterResult = await pool.request().execute('[trans].[Stored_Get_ItemMaster_Minimal]');
  const masterItems = masterResult.recordset;
  const itemMap = new Map();
  for (const row of masterItems) {
    if (row.ItemNo) {
      itemMap.set(row.ItemNo.trim(), {
        itemName: row.ItemName || '',
        spec: row.Spec || row.SPEC || ''
      });
    }
  }
  console.log(itemMap.get('P122257A'));
  process.exit(0);
}).catch(console.error);
