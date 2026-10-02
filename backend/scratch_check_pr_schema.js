const { poolPromise, sql } = require('./src/config/database');

poolPromise.then(async pool => {
  try {
    const query = `
      SELECT COLUMN_NAME
      FROM db_Cost_Data_Centralized.INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'tb_MRP_PRStatus_71DZ'
    `;
    const result = await pool.request().query(query);
    console.log(result.recordset.map(r => r.COLUMN_NAME));
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
});
