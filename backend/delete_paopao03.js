const { poolPromise } = require('./src/config/database');
const sql = require('mssql');

async function checkRecords() {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT *
      FROM master.tb_PC_Plan
      WHERE Comment = 'Testtt' OR PartNo IN ('1-3874X01F1A', 'A5B34-3AM1A') OR Employee_ID = 'Paopao03' OR Employee_ID LIKE '%Paopao03%'
    `);
    console.log('Records to delete:', result.recordset);
    
    // Now delete them
    const delResult = await pool.request().query(`
      DELETE FROM master.tb_PC_Plan
      WHERE Comment = 'Testtt' OR PartNo IN ('1-3874X01F1A', 'A5B34-3AM1A') OR Employee_ID = 'Paopao03' OR Employee_ID LIKE '%Paopao03%'
    `);
    console.log('Deleted rows:', delResult.rowsAffected[0]);

  } catch(e) {
    console.error(e);
  } finally {
    process.exit();
  }
}
checkRecords();
