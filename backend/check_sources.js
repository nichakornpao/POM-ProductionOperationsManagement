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

        // Let's check tb_PC_Plan for the recent ones.
        const result = await sql.query(`
            SELECT PartNo, Path_Dwg, Path_Layout, Path_Dwg_Source, Path_Layout_Source, DateTime_Record
            FROM [master].[tb_PC_Plan]
            WHERE CAST(PlanDate AS DATE) >= '2026-09-01' 
               OR CAST(DateTime_Record AS DATE) >= '2026-09-09'
            ORDER BY DateTime_Record DESC
        `);

        console.log(`Found ${result.recordset.length} records.`);
        result.recordset.slice(0, 10).forEach(r => {
            console.log(`PartNo: ${r.PartNo}`);
            console.log(`  Path_Dwg: ${r.Path_Dwg}`);
            console.log(`  Path_Dwg_Source: ${r.Path_Dwg_Source}`);
            console.log(`  Path_Layout_Source: ${r.Path_Layout_Source}`);
        });

        process.exit(0);
    } catch(e) {
        console.error(e.message);
        process.exit(1);
    }
}
run();
