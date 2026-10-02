const { sql, poolPromise } = require('./src/config/database');

async function checkDate() {
  try {
    const pool = await poolPromise;
    const res = await pool.request().query("SELECT GETDATE() as ServerGetDate, CAST(GETDATE() AS DATE) as ServerToday");
    console.log("SQL Server Date Info:", res.recordset[0]);

    // Check PlanDates in master.tb_PC_Plan compared to GETDATE()
    const resDates = await pool.request().query(`
      SELECT DISTINCT CONVERT(varchar, PlanDate, 103) as PlanDateStr, PlanDate
      FROM master.tb_PC_Plan
      ORDER BY PlanDate DESC
    `);
    console.log("\nTop 15 PlanDates in master.tb_PC_Plan:");
    console.log(resDates.recordset.slice(0, 15));

  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

checkDate();
