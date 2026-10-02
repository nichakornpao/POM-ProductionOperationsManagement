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
        SELECT definition FROM sys.sql_modules WHERE object_id = OBJECT_ID('trans.Stored_PCPlan_Query_Paginated');
    `);
}).then(result => {
    fs.writeFileSync('sp_paginated.sql', result.recordsets[0]?.[0]?.definition || "NOT FOUND", 'utf8');
    process.exit(0);
}).catch(console.error);
