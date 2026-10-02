const { poolForecastProjectPromise } = require("./src/config/database");

async function run() {
  const pool = await poolForecastProjectPromise;
  const result = await pool.request().query("SELECT TOP 5 * FROM dbo.tb_PC_Forecast WHERE ForecastMonth = 'July' AND ForecastYear = '2026'");
  console.log(result.recordset);
  process.exit(0);
}
run();
