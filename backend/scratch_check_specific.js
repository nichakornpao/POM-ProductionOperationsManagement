const { poolPromise } = require('./src/config/database');

async function search24() {
  try {
    const pool = await poolPromise;
    
    // Check tb_PC_Plan specifically around 2026-09-24
    console.log('--- tb_PC_Plan around Sept 2026 ---');
    const pcPlans = await pool.request().query(`
      SELECT Plan_ID, PlanDate, Employee_ID, MC_Type, Facility, Process, MC_No, PartNo, QTY, Comment, GroupId, PlanStatus
      FROM master.tb_PC_Plan
      WHERE PlanDate >= '2026-09-20' OR Employee_ID LIKE '%Paopao%' OR Employee_ID LIKE '%PP%' OR Comment LIKE '%Test%'
    `);
    console.log('tb_PC_Plan:', pcPlans.recordset);

    // Check if there are other plan tables or user tables
    const tables = await pool.request().query(`
      SELECT TABLE_SCHEMA, TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_TYPE = 'BASE TABLE'
    `);
    console.log('Tables in DB:', tables.recordset);

  } catch(e) {
    console.error(e);
  } finally {
    process.exit();
  }
}

search24();
