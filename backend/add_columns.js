const sql = require('mssql');
require('dotenv').config();
const pool = new sql.ConnectionPool({
    user: process.env.DB_USER_APP,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: { encrypt: false, trustServerCertificate: true }
});
pool.connect().then(function(p) {
    console.log("Checking columns...");
    return p.request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'tb_PC_Plan'");
}).then(function(result) {
    const cols = result.recordset.map(r => r.COLUMN_NAME);
    let p = Promise.resolve();
    if (!cols.includes('Path_Dwg_Source')) {
        console.log("Adding Path_Dwg_Source...");
        p = p.then(() => pool.request().query("ALTER TABLE [master].[tb_PC_Plan] ADD Path_Dwg_Source NVARCHAR(50) NULL"));
    }
    if (!cols.includes('Path_Layout_Source')) {
        console.log("Adding Path_Layout_Source...");
        p = p.then(() => pool.request().query("ALTER TABLE [master].[tb_PC_Plan] ADD Path_Layout_Source NVARCHAR(50) NULL"));
    }
    return p;
}).then(function() {
    console.log("Done adding columns");
    process.exit(0);
}).catch(function(e) {
    console.error(e);
    process.exit(1);
});
