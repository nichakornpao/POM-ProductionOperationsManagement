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

        const result = await sql.query(`
            UPDATE [master].[tb_PC_Plan]
            SET Path_Dwg_Source = CASE WHEN Path_Dwg IS NOT NULL AND Path_Dwg <> '' AND Path_Dwg_Source IS NULL THEN 'auto' ELSE Path_Dwg_Source END,
                Path_Layout_Source = CASE WHEN Path_Layout IS NOT NULL AND Path_Layout <> '' AND Path_Layout_Source IS NULL THEN 'auto' ELSE Path_Layout_Source END
            WHERE CAST(DateTime_Record AS DATE) >= '2026-09-09'
        `);

        console.log(`Updated ${result.rowsAffected[0]} records to have 'auto' source.`);
        process.exit(0);
    } catch(e) {
        console.error(e.message);
        process.exit(1);
    }
}
run();
