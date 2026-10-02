const sql=require('mssql');
const config=require('./src/config/database');
async function run(){ 
  const pool = await config.poolRequestIndirrecPromise; 
  await pool.request().query(`
    UPDATE [dbo].[TestIssueAs400] SET ItemNo = 'P999001 (TEST)', PartNo = 'TEST-PART-001' WHERE Public_Id = 'TEST-001'; 
    UPDATE [dbo].[TestIssueAs400] SET ItemNo = 'P999002 (TEST)', PartNo = 'TEST-PART-002' WHERE Public_Id = 'TEST-002'; 
    UPDATE [dbo].[TestIssueAs400] SET ItemNo = 'P999003 (TEST)', PartNo = 'TEST-PART-003' WHERE Public_Id = 'TEST-003'; 
    UPDATE [dbo].[TestIssueAs400] SET ItemNo = 'P999004 (TEST)', PartNo = 'TEST-PART-004' WHERE Public_Id = 'TEST-004'; 
    UPDATE [dbo].[TestIssueAs400] SET ItemNo = 'P999005 (TEST)', PartNo = 'TEST-PART-005' WHERE Public_Id = 'TEST-005'; 
    UPDATE [dbo].[TestIssueAs400] SET ItemNo = 'P999006 (TEST)', PartNo = 'TEST-PART-006' WHERE Public_Id = 'TEST-006'; 
    UPDATE [dbo].[TestIssueAs400] SET ItemNo = 'P999007 (TEST)', PartNo = 'TEST-PART-007' WHERE Public_Id = 'TEST-007';
  `); 
  console.log('Updated 1-7 to be consistent'); 
  process.exit(0); 
} 
run();
