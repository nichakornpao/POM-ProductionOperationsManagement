const { poolPromise } = require('./src/config/database');
const sql = require('mssql');

async function cleanTestRecords() {
  try {
    const pool = await poolPromise;
    
    // 1. Inspect target test rows
    const inspectResult = await pool.request().query(`
      SELECT GroupId, Unique_Id, PlanDate, PartNo, MC_No, Comment, PlanStatus
      FROM master.tb_PC_Plan
      WHERE CAST(PlanDate AS DATE) >= '2026-09-01'
        AND (
          Comment LIKE '%test%' OR Comment LIKE '%TEST%' OR Comment LIKE '%Test%'
          OR MC_No IN ('6565', '555', '5555', '55555', '645555', '555555')
          OR PartNo IN ('T7067AG2BT01', 'T7070-G1CT01', 'T7025JG3A', 'T7071-G1ET02', 'OT-7025-2CF01', 'A5106-1AM1AS01') AND (Comment LIKE '%test%' OR Comment LIKE '%TEST%' OR Comment LIKE '%Test%')
        )
      ORDER BY PlanDate DESC
    `);
    
    console.log(`Found ${inspectResult.recordset.length} test records to clean:`);
    console.table(inspectResult.recordset);

    if (inspectResult.recordset.length > 0) {
      // 2. Delete test rows from master.tb_PC_Plan
      const deleteResult = await pool.request().query(`
        DELETE FROM master.tb_PC_Plan
        WHERE CAST(PlanDate AS DATE) >= '2026-09-01'
          AND (
            Comment LIKE '%test%' OR Comment LIKE '%TEST%' OR Comment LIKE '%Test%'
            OR MC_No IN ('6565', '555', '5555', '55555', '645555', '555555')
          )
      `);
      console.log(`✅ Successfully deleted ${deleteResult.rowsAffected[0]} test rows from master.tb_PC_Plan!`);
    } else {
      console.log('No matching test rows found.');
    }

  } catch(e) {
    console.error('Error cleaning test records:', e);
  } finally {
    process.exit();
  }
}

cleanTestRecords();
