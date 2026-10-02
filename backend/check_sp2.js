const sql = require('mssql');
const { poolPromise } = require('./src/config/database'); // poolPromise is db_Tooling on pbp155

async function check() {
    try {
        const pool = await poolPromise;
        const res = await pool.request().query("SELECT SCHEMA_NAME(schema_id) as schema_name, name FROM sys.procedures WHERE name = 'Stored_Get_Centralized_UnitPrice'");
        console.log("Schema for SP in db_Tooling:");
        console.log(res.recordset);
        
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
check();
