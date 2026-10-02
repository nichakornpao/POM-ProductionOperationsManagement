const sql = require('mssql');
const { poolPbgm8gPromise } = require('./src/config/database');

async function check() {
    try {
        const pool = await poolPbgm8gPromise;
        const res = await pool.request().query("SELECT * FROM sys.procedures WHERE name = 'Stored_Get_Centralized_UnitPrice'");
        console.log("Procedures found in CostReduction:");
        console.log(res.recordset);
        
        const res2 = await pool.request().query("SELECT SCHEMA_NAME(schema_id) as schema_name, name FROM sys.procedures WHERE name = 'Stored_Get_Centralized_UnitPrice'");
        console.log("Schema for SP:");
        console.log(res2.recordset);
        
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
check();
