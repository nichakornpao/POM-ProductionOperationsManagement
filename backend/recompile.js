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
        EXEC sp_recompile 'trans.Stored_PCPlan_Query';
        EXEC sp_recompile 'trans.Stored_PCPlan_Query_PD';
    `);
}).then(() => {
    console.log("Recompiled");
    process.exit(0);
}).catch(console.error);
