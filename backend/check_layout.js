require('dotenv').config({path: __dirname + '/.env'});
const sql = require('mssql');

async function run() {
    try {
        await sql.connect({
            user: process.env.DB_USER_APP,
            password: process.env.DB_PASSWORD,
            server: process.env.DB_SERVER,
            database: process.env.DB_NAME,
            options: { encrypt: false, trustServerCertificate: true }
        });

        const result = await sql.query(`SELECT PartNo, Path_Dwg, Path_Layout, Path_Dwg_Source, Path_Layout_Source FROM [master].[tb_PC_Plan] WHERE CAST(DateTime_Record AS DATE) >= '2026-09-09' AND PartNo = 'T7071-G1ET02'`);
        console.log(result.recordset);
        process.exit(0);
    } catch(e) {
        console.error(e.message);
        process.exit(1);
    }
}
run();
