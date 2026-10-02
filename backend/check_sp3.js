const sql = require('mssql');
const { poolPbgm8gPromise } = require('./src/config/database');

async function check() {
    try {
        const pool = await poolPbgm8gPromise;
        const res = await pool.request().query("SELECT SCHEMA_NAME(schema_id) as schema_name, name FROM db_Cost_Data_Centralized.sys.procedures WHERE name = 'Stored_Get_Centralized_UnitPrice'");
        console.log("Schema for SP in db_Cost_Data_Centralized:");
        console.log(res.recordset);
        
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
check();
