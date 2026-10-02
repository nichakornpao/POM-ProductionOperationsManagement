
require("dotenv").config();
const { sql, poolForecastProjectPromise } = require("./src/config/database.js");
async function run() {
  try {
    const pool = await poolForecastProjectPromise;
    const res = await pool.request().query("SELECT DISTINCT TargetMonth FROM dbo.tb_PC_Forecast WHERE ForecastMonth = 'July' AND ForecastYear = '2026'");
    console.log("Distinct TargetMonths:", res.recordset);
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
run();

