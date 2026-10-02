const { poolPromise } = require('./src/config/database');
const sql = require('mssql');

async function testQCRequiredRunning() {
  try {
    const pool = await poolPromise;
    const today = new Date().toISOString().split('T')[0];
    console.log('Today date:', today);

    // 1. Check active running plans (PlanDate >= today) where EN completed and QC is pending
    const queryActive = `
      SELECT Plan_ID, PlanDate, PartNo, MC_No, Process, Path_Dwg, Path_Layout, Path_IIQC, PlanStatus
      FROM [master].[tb_PC_Plan]
      WHERE IsActive = 1 
        AND UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED'
        AND PlanDate >= '${today}'
        AND Path_Dwg IS NOT NULL AND Path_Dwg <> '-' AND Path_Dwg <> ''
        AND Path_Layout IS NOT NULL AND Path_Layout <> '-' AND Path_Layout <> ''
        AND (Path_IIQC IS NULL OR Path_IIQC = '-' OR Path_IIQC = '')
      ORDER BY PlanDate ASC, Plan_ID DESC
    `;
    const resActive = await pool.request().query(queryActive);
    console.log('\n--- Active Running Plans (PlanDate >= Today) for QC Required ---');
    console.log('Count:', resActive.recordset.length);
    if (resActive.recordset.length > 0) {
      console.table(resActive.recordset.slice(0, 10));
    }

    // 2. Check all plans where EN completed and QC is pending (regardless of date)
    const queryAllDate = `
      SELECT Plan_ID, PlanDate, PartNo, MC_No, Process, Path_Dwg, Path_Layout, Path_IIQC, PlanStatus
      FROM [master].[tb_PC_Plan]
      WHERE IsActive = 1 
        AND UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED'
        AND Path_Dwg IS NOT NULL AND Path_Dwg <> '-' AND Path_Dwg <> ''
        AND Path_Layout IS NOT NULL AND Path_Layout <> '-' AND Path_Layout <> ''
        AND (Path_IIQC IS NULL OR Path_IIQC = '-' OR Path_IIQC = '')
      ORDER BY PlanDate ASC, Plan_ID DESC
    `;
    const resAllDate = await pool.request().query(queryAllDate);
    console.log('\n--- All Plans (Any Date) where EN completed & QC pending ---');
    console.log('Count:', resAllDate.recordset.length);
    if (resAllDate.recordset.length > 0) {
      console.table(resAllDate.recordset.slice(0, 10));
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

testQCRequiredRunning();
