const { poolPromise } = require('./src/config/database');

async function findPaopaoPP() {
  try {
    const pool = await poolPromise;
    console.log('Searching all text columns in master.tb_PC_Plan for Paopao, PP, Paopao03...');

    const res = await pool.request().query(`
      SELECT Plan_ID, GroupId, Unique_Id, PlanDate, PartNo, Comment, EmployeeId, CreatedBy, User_Record, DWG_User, Layout_User, IIQC_User, Path_Dwg, Path_Layout, Path_Dwg_Source, Path_Layout_Source
      FROM [master].[tb_PC_Plan]
      WHERE 
        UPPER(ISNULL(Comment,'')) LIKE '%PAOPAO%' OR UPPER(ISNULL(Comment,'')) LIKE '%PP%'
        OR UPPER(ISNULL(EmployeeId,'')) LIKE '%PAOPAO%' OR UPPER(ISNULL(EmployeeId,'')) LIKE '%PP%'
        OR UPPER(ISNULL(CreatedBy,'')) LIKE '%PAOPAO%' OR UPPER(ISNULL(CreatedBy,'')) LIKE '%PP%'
        OR UPPER(ISNULL(User_Record,'')) LIKE '%PAOPAO%' OR UPPER(ISNULL(User_Record,'')) LIKE '%PP%'
        OR UPPER(ISNULL(DWG_User,'')) LIKE '%PAOPAO%' OR UPPER(ISNULL(DWG_User,'')) LIKE '%PP%'
        OR UPPER(ISNULL(Layout_User,'')) LIKE '%PAOPAO%' OR UPPER(ISNULL(Layout_User,'')) LIKE '%PP%'
        OR UPPER(ISNULL(IIQC_User,'')) LIKE '%PAOPAO%' OR UPPER(ISNULL(IIQC_User,'')) LIKE '%PP%'
        OR UPPER(ISNULL(PartNo,'')) LIKE '%PAOPAO%' OR UPPER(ISNULL(PartNo,'')) LIKE '%PP%'
      ORDER BY Plan_ID DESC
    `);

    console.log(`Found ${res.recordset.length} rows:`);
    res.recordset.forEach(r => {
      console.log(JSON.stringify(r));
    });

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

findPaopaoPP();
