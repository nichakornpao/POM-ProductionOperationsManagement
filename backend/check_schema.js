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

        // Check column names of tb_PC_Plan
        const cols = await sql.query(`SELECT TOP 1 * FROM [master].[tb_PC_Plan]`);
        console.log('Columns:', Object.keys(cols.recordset[0] || {}));

        // Check recent records
        const recent = await sql.query(`
            SELECT TOP 5 * FROM [master].[tb_PC_Plan]
            ORDER BY Unique_Id DESC
        `);
        recent.recordset.forEach(r => {
            console.log('Row:', JSON.stringify(r));
        });

        process.exit(0);
    } catch(e) {
        console.error(e.message);
        process.exit(1);
    }
}
run();
