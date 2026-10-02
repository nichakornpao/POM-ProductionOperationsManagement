const { poolPromise, sql } = require('./src/config/database');

poolPromise.then(async pool => {
  try {
    const query = `
      SELECT TOP 5 *
      FROM [db_Cost_Data_Centralized].[master].[tb_MRP_PRStatus_71DZ]
    `;
    const result = await pool.request().query(query);
    console.log('PR Data:', result.recordset);
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
});
