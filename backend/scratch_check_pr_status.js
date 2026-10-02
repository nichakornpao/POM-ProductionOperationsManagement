const { poolPromise, sql } = require('./src/config/database');

poolPromise.then(async pool => {
  try {
    const query = `
      SELECT Status, COUNT(*) as Total
      FROM [db_Cost_Data_Centralized].[master].[tb_MRP_PRStatus_71DZ]
      GROUP BY Status
    `;
    const result = await pool.request().query(query);
    console.log(result.recordset);
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
});
