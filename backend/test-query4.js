require('dotenv').config();
const sql = require('mssql');
const dbConfig = require('./src/configs/db.config.js');

async function run() {
    await sql.connect(dbConfig.forecastProjectConfig);
    const result = await sql.query(`SELECT RequestNo, PathDwg FROM request_purchase WHERE RequestNo IN ('RO8852', 'RO8854', 'RO8856')`);
    console.log(result.recordset);
    process.exit();
}
run();
