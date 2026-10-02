const { poolForecastProjectPromise, sql } = require('./src/config/database');

poolForecastProjectPromise.then(async pool => {
  try {
    const query = `
      SELECT ItemNo, COUNT(DISTINCT TargetMonth) as MonthCount
      FROM dbo.tb_PC_Forecast
      WHERE ForecastMonth = 'July' AND ForecastYear = '2026'
      GROUP BY ItemNo
      ORDER BY MonthCount ASC
    `;
    const result = await pool.request().query(query);
    console.log('Items with 1 month:', result.recordset.filter(r => r.MonthCount === 1).slice(0, 5));
    console.log('Items with 2 months:', result.recordset.filter(r => r.MonthCount === 2).slice(0, 5));
    console.log('Total items:', result.recordset.length);
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
});
