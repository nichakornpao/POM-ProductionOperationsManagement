const { poolPromise } = require('./src/config/database');
const sql = require('mssql');

async function checkUser() {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT Employee_ID, Employee_Name, Username, Role
      FROM dbo.tb_CuttingTool_Employee
      WHERE Username = 'ICE' OR Employee_Name = 'ICE'
    `);
    console.log('User ICE:', result.recordset);
  } catch(e) {
    console.error(e);
  } finally {
    process.exit();
  }
}
checkUser();
