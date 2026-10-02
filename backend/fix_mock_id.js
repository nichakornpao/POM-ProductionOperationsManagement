const { poolRequestIndirrecPromise } = require('./src/config/database');

async function fix() {
  const pool = await poolRequestIndirrecPromise;

  // Fix Case Setup Public_Id to start with TEST-CS-
  await pool.request().query(`
    UPDATE [dbo].[TestCaseSetupList]
    SET Public_Id = REPLACE(Public_Id, 'TEST-ZCS-', 'TEST-CS-Z-')
    WHERE Public_Id LIKE 'TEST-ZCS-%'
  `);
  
  // Fix Request List Public_Id to start with TEST-RL-
  await pool.request().query(`
    UPDATE [dbo].[TestPurchaseRequestList]
    SET Public_Id = REPLACE(Public_Id, 'TEST-ZRL-', 'TEST-RL-Z-')
    WHERE Public_Id LIKE 'TEST-ZRL-%'
  `);

  console.log('Fixed Public_Id for zero stock mock items.');
  process.exit(0);
}
fix();
