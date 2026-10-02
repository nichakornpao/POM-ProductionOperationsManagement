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
        
        const pathDwg = String.raw`\\pbgm06\D\PartEN PMC\Process dwg\T7071-G1ET02.pdf`;
        
        const result = await sql.query(`
            UPDATE [master].[tb_PC_Plan] 
            SET Path_Dwg = '${pathDwg}' 
            WHERE PartNo = 'T7071-G1ET02'
        `);
        console.log('Updated rows:', result.rowsAffected);
        
        process.exit(0);
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
}
run();
