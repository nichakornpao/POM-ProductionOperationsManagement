const { poolPromise, sql } = require('./src/config/database');

poolPromise.then(async pool => {
  try {
    const request = pool.request();
    request.input('Year', sql.Int, 2026);
    request.input('Month', sql.Int, 7); // July
    const result = await request.execute('[trans].[Stored_Get_Incoming_PO]');
    console.log('Data:', result.recordset);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
});
