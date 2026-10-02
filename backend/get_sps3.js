const sql = require('mssql');
const fs = require('fs');
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
        SELECT definition, object_name(object_id) as name FROM sys.sql_modules WHERE object_name(object_id) LIKE '%Stored_PCPlan_Query%';
    `);
}).then(result => {
    let out = '';
    result.recordset.forEach(r => {
        out += "--- " + r.name + " ---\n" + r.definition + "\n\n";
    });
    fs.writeFileSync('sps_all.sql', out, 'utf8');
    process.exit(0);
}).catch(console.error);
