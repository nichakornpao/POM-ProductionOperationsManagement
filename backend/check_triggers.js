const sql=require('mssql');
const config=require('./src/config/database');
async function run(){
  try {
    const pool = await config.poolPromise;
    const res = await pool.request().query(`
      SELECT t.name AS TableName, tr.name AS TriggerName 
      FROM sys.triggers tr 
      INNER JOIN sys.tables t ON tr.parent_id = t.object_id 
      WHERE t.name LIKE '%IssueCuttingTool%' OR t.name LIKE '%IssueSetupTool%'
    `);
    console.log('Triggers:', res.recordset);
    process.exit(0);
  } catch(e){
    console.error(e);
    process.exit(1);
  }
}
run();
