const { poolPromise } = require('./src/config/database');

async function findTestRows() {
  try {
    const pool = await poolPromise;
    console.log('Finding TEST rows in master.tb_PC_Plan...');

    const res = await pool.request().query(`
      SELECT Plan_ID, GroupId, Unique_Id, PlanDate, PartNo, MC_No, Comment, Employee_ID, IsActive, PlanStatus, Path_Dwg, Path_Layout, Path_IIQC, Path_Dwg_Source, Path_Layout_Source, DateTime_Record
      FROM [master].[tb_PC_Plan]
      WHERE UPPER(ISNULL(Comment,'')) LIKE '%TEST%' 
         OR UPPER(ISNULL(Comment,'')) LIKE '%PAOPAO%'
         OR UPPER(ISNULL(Comment,'')) LIKE '%PP%'
         OR UPPER(ISNULL(Employee_ID,'')) LIKE '%PAOPAO%'
         OR UPPER(ISNULL(Employee_ID,'')) LIKE '%PP%'
      ORDER BY PlanDate DESC, Plan_ID DESC
    `);

    console.log(`Found ${res.recordset.length} TEST rows in DB:`);
    res.recordset.forEach(r => {
      console.log(`ID:${r.Plan_ID} Date:${r.PlanDate.toISOString().slice(0,10)} Part:${r.PartNo} Comment:'${r.Comment}' EmpID:'${r.Employee_ID}' Active:${r.IsActive} Status:${r.PlanStatus}`);
    });

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

findTestRows();
