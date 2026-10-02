const { poolPromise, sql } = require('./src/config/database');

poolPromise.then(async pool => {
  try {
    const request = pool.request();
    request.input('Year', sql.Int, 2026);
    request.input('Month', sql.Int, 7); // July
    const result = await request.execute('[trans].[Stored_Get_Incoming_PO]');
    const data = result.recordset;
    
    const row = data.find(d => d.ItemNo && d.ItemNo.trim() === 'P111024A');
    console.log('PO Data for P111024A:', row);
    
    // Let's also query the raw table for this ItemNo in July 2026
    const query = `
      SELECT * FROM [db_Cost_Data_Centralized].[master].[tb_MRP_PO_71DZ]
      WHERE [ItemNo] = 'P111024A'
      AND YEAR([Date]) = 2026
      AND MONTH([Date]) = 7
    `;
    const rawResult = await pool.request().query(query);
    console.log('Raw rows:', rawResult.recordset);
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
});
