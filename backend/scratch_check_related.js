const { poolPromise } = require('./src/config/database');

async function checkRelated() {
  try {
    const pool = await poolPromise;
    
    // Check tb_Return_List for these Plan_IDs
    const returns = await pool.request().query(`
      SELECT * FROM master.tb_Return_List
      WHERE Plan_ID IN (1626, 1628, 1629) 
         OR User_Create LIKE '%Paopao%' 
         OR User_Create LIKE '%PP%'
         OR Employee_ID LIKE '%Paopao%'
         OR Employee_ID LIKE '%PP%'
    `);
    console.log('Related return list rows:', returns.recordset);

  } catch(e) {
    console.error(e);
  } finally {
    process.exit();
  }
}

checkRelated();
