const { sql, poolPromise } = require('./src/config/database');

async function fixDbEnStatus() {
  try {
    const pool = await poolPromise;
    console.log('Fixing Is_EN_Completed in master.tb_PC_Plan where paths are missing...');
    
    const result = await pool.request().query(`
      UPDATE master.tb_PC_Plan
      SET Is_EN_Completed = 0
      WHERE (Path_Dwg IS NULL OR Path_Dwg = '-' OR Path_Dwg = '')
         OR (Path_Layout IS NULL OR Path_Layout = '-' OR Path_Layout = '')
    `);

    console.log(`Updated ${result.rowsAffected[0]} rows in master.tb_PC_Plan where paths were missing (Is_EN_Completed set to 0).`);

    const check24 = await pool.request().query(`
      SELECT Plan_ID, CONVERT(varchar, PlanDate, 103) as PlanDateStr, PartNo, GroupId, Is_EN_Completed, Path_Dwg, Path_Layout, Path_IIQC 
      FROM master.tb_PC_Plan 
      WHERE PlanDate >= '2026-09-24' AND PlanDate < '2026-09-25' 
      ORDER BY Plan_ID
    `);
    console.log("Current state for 24/09/2026:");
    console.log(JSON.stringify(check24.recordset, null, 2));

  } catch (err) {
    console.error('Error fixing DB EN status:', err);
  } finally {
    process.exit(0);
  }
}

fixDbEnStatus();
