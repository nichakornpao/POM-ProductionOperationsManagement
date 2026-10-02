const { poolPromise } = require('./src/config/database');

async function run() {
  try {
    const pool = await poolPromise;
    console.log('Checking [Is_EN_Completed] column in [master].[tb_PC_Plan]...');

    await pool.request().query(`
      IF COL_LENGTH('[master].[tb_PC_Plan]', 'Is_EN_Completed') IS NULL
      BEGIN
        ALTER TABLE [master].[tb_PC_Plan] ADD [Is_EN_Completed] BIT NOT NULL DEFAULT 0;
        PRINT 'Added [Is_EN_Completed] column';
      END
      ELSE
      BEGIN
        PRINT 'Column [Is_EN_Completed] already exists';
      END
    `);

    const res = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE, COLUMN_DEFAULT
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'master' AND TABLE_NAME = 'tb_PC_Plan' AND COLUMN_NAME = 'Is_EN_Completed'
    `);
    console.log('Is_EN_Completed column schema:', res.recordset);
    process.exit(0);
  } catch (err) {
    console.error('Error adding Is_EN_Completed column:', err);
    process.exit(1);
  }
}

run();
