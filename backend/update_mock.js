require('dotenv').config();
const { poolRequestIndirrecPromise } = require('./src/config/database');

async function run() {
  const pool = await poolRequestIndirrecPromise;
  
  // The 4 items that have 0 stock but have a substitute with stock
  const zeroStockItems = ['P122026N', 'P122513A', 'P122854N', 'P122866N'];
  
  for (let i = 0; i < 10; i++) {
    const itemNo = zeroStockItems[i % zeroStockItems.length];
    const pubId = `TEST-REQ-${String(i + 1).padStart(3, '0')}`;
    
    await pool.request().query(`
      UPDATE [dbo].[TestPurchaseRequestList]
      SET ItemNo = '${itemNo}', PartNo = 'SUB-TEST-${i+1}'
      WHERE Public_Id = '${pubId}'
    `);
  }
  
  console.log('Updated 10 mock items to have zero stock ItemNos.');
  process.exit(0);
}
run();
