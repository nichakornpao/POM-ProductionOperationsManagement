const { poolRequestIndirrecPromise } = require('./src/config/database'); 
async function run() { 
  try {
    const pool = await poolRequestIndirrecPromise; 
    const res = await pool.request().query("DELETE FROM [dbo].[TestPurchaseRequestList] WHERE Status IN ('Complete', 'CompleteToExcel')"); 
    console.log('Rows deleted:', res.rowsAffected); 
  } catch (e) {
    console.error(e);
  }
  process.exit(0); 
} 
run();
