const { poolPromise, sql } = require('./src/config/database');

poolPromise.then(async pool => {
  try {
    const query = `
      SELECT 
          YEAR([Date]) as Year,
          MONTH([Date]) as Month,
          SUM(Quantity) as totalQty
      FROM [db_Cost_Data_Centralized].[master].[tb_MRP_PO_71DZ]
      WHERE [ItemNo] = 'P111002A' AND [Status] = 'P/O Approved'
      GROUP BY YEAR([Date]), MONTH([Date])
    `;
    const rawResult = await pool.request().query(query);
    console.log('Aggregated Data for P111002A:', rawResult.recordset);
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
});
