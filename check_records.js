const { poolPromise } = require('./backend/src/config/database');
const sql = require('mssql');

async function checkRecords() {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT COUNT(*) as cnt
      FROM master.tb_PC_Plan
      WHERE Employee_ID = 'Paopao03' OR Employee_ID LIKE '%Paopao03%'
    `);
    console.log('Total records for Paopao03:', result.recordset[0].cnt);
    
    // Check if it's exactly 153, if so we can just delete them.
    // To be safe, let's delete exactly those that belong to Paopao03
  } catch(e) {
    console.error(e);
  } finally {
    process.exit();
  }
}
checkRecords();
