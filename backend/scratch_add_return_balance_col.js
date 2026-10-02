const { poolPromise } = require('./src/config/database');
const sql = require('mssql');

async function run() {
  try {
    const pool = await poolPromise;
    console.log('Checking column [Return Balance] in [master].[tb_PC_Plan]...');

    await pool.request().query(`
      IF COL_LENGTH('[master].[tb_PC_Plan]', 'Return Balance') IS NULL
      BEGIN
        ALTER TABLE [master].[tb_PC_Plan] ADD [Return Balance] NVARCHAR(100) NULL;
        PRINT 'Added [Return Balance] column';
      END
      ELSE
      BEGIN
        PRINT 'Column [Return Balance] already exists';
      END
    `);

    // Also check ReturnQty column
    await pool.request().query(`
      IF COL_LENGTH('[master].[tb_PC_Plan]', 'ReturnQty') IS NULL
      BEGIN
        ALTER TABLE [master].[tb_PC_Plan] ADD [ReturnQty] INT NULL DEFAULT 0;
        PRINT 'Added [ReturnQty] column';
      END
    `);

    console.log('Checking updated table schema...');
    const res = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'master' AND TABLE_NAME = 'tb_PC_Plan'
        AND COLUMN_NAME IN ('Return Balance', 'ReturnQty', 'Is_Return_OK', 'RequestNo')
    `);
    console.log('Matching columns:', res.recordset);
    process.exit(0);
  } catch (err) {
    console.error('Error adding column:', err);
    process.exit(1);
  }
}

run();
