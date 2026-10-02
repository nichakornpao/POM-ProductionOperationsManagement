const sql = require('mssql');
require('dotenv').config();
const pool = new sql.ConnectionPool({
    user: process.env.DB_USER_APP,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: { encrypt: false, trustServerCertificate: true }
});
pool.connect().then(p => {
    return p.request().query(`
        SELECT definition FROM sys.sql_modules WHERE object_id = OBJECT_ID('trans.Stored_PCPlan_Query');
        SELECT definition FROM sys.sql_modules WHERE object_id = OBJECT_ID('trans.Stored_PCPlan_Query_PD');
    `);
}).then(result => {
    console.log(result.recordsets[0]?.[0]?.definition || "NOT FOUND: Query");
    console.log("======================================");
    console.log(result.recordsets[1]?.[0]?.definition || "NOT FOUND: Query_PD");
    process.exit(0);
}).catch(console.error);
