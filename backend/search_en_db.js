const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER_APP,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: {
        encrypt: false, // For local networks
        trustServerCertificate: true
    }
};

async function search() {
    try {
        await sql.connect(config);
        console.log('Connected to 155DB successfully.');
        
        // 1. Search Database Names
        console.log('\n--- Searching for Databases related to EN ---');
        const dbResult = await sql.query(`
            SELECT name 
            FROM sys.databases 
            WHERE name LIKE '%EN%' OR name LIKE '%ENG%' OR name LIKE '%Engineer%'
        `);
        console.table(dbResult.recordset);

        // 2. Search Table Names in current DB (db_Tooling)
        console.log('\n--- Searching for Tables related to EN in current DB ---');
        const tableResult = await sql.query(`
            SELECT name 
            FROM sys.tables 
            WHERE name LIKE '%EN%' OR name LIKE '%ENG%' OR name LIKE '%Engineer%'
        `);
        console.table(tableResult.recordset);
        
        sql.close();
    } catch (err) {
        console.error('SQL error:', err);
    }
}

search();
