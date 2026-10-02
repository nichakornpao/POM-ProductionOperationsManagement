const { poolPromise } = require('./src/config/database');

async function checkSchema() {
  try {
    const pool = await poolPromise;
    const res = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = 'master' AND TABLE_NAME = 'tb_PC_Plan'
    `);
    console.log('Columns in tb_PC_Plan:');
    res.recordset.forEach(col => {
      console.log(`- ${col.COLUMN_NAME} (${col.DATA_TYPE}${col.CHARACTER_MAXIMUM_LENGTH ? '(' + col.CHARACTER_MAXIMUM_LENGTH + ')' : ''})`);
    });
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

checkSchema();
