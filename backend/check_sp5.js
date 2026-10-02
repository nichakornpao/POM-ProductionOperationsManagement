const sql = require('mssql');
const { poolPromise } = require('./src/config/database');

async function check() {
    try {
        const pool = await poolPromise;
        const res = await pool.request().query(`
            EXEC sp_MSforeachdb '
            IF EXISTS (SELECT 1 FROM [?].sys.procedures WHERE name = ''Stored_Get_Centralized_UnitPrice'')
            BEGIN
                SELECT ''?'' as db_name, SCHEMA_NAME(schema_id) as schema_name, name 
                FROM [?].sys.procedures WHERE name = ''Stored_Get_Centralized_UnitPrice''
            END
            '
        `);
        console.log("Found on PBP155 in:");
        console.log(res.recordsets);
        
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
check();
