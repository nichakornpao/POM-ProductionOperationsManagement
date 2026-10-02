const { poolPromise } = require('./src/config/database');

poolPromise.then(async pool => {
  try {
    const res = await pool.request().query("SELECT TOP 5 * FROM [db_Cost_Data_Centralized].[master].[tb_MRP_POBalance_71DZ_2]");
    console.log("POBalance columns:", Object.keys(res.recordset[0] || {}));
    console.log("POBalance sample:", res.recordset[0]);
    
    // Check if there is data for July 2026
    const res2 = await pool.request().query("SELECT COUNT(*) as count FROM [db_Cost_Data_Centralized].[master].[tb_MRP_POBalance_71DZ_2] WHERE DueMonth = '07/2026'");
    console.log("Count for 07/2026:", res2.recordset[0].count);
    
    // Let's see some unique DueMonths
    const res3 = await pool.request().query("SELECT DISTINCT TOP 10 DueMonth FROM [db_Cost_Data_Centralized].[master].[tb_MRP_POBalance_71DZ_2]");
    console.log("Distinct DueMonths:", res3.recordset.map(r => r.DueMonth));

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
});
