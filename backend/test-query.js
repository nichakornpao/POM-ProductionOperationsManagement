require('dotenv').config();
const sql = require('mssql');
const dbConfig = require('./src/configs/db.config.js');

async function run() {
    await sql.connect(dbConfig.forecastProjectConfig);
    const result = await sql.query(`SELECT PathDwg FROM request_purchase WHERE RequestNo = 'RO8855'`);
    console.log(result.recordset);
    process.exit();
}
run();
