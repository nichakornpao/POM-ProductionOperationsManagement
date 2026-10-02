const { poolForecastProjectPromise } = require('./src/config/database');

async function checkSchema() {
  try {
    const pool = await poolForecastProjectPromise;
    const result = await pool.request().query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_TYPE = 'BASE TABLE'
    `);
    
    console.log("--- ForecastProject Tables ---");
    console.log(result.recordset);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkSchema();
