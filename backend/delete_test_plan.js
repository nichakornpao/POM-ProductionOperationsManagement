require('dotenv').config();
const { sql, poolPromise } = require('./src/config/db');

async function deleteTestPlans() {
    try {
        const pool = await poolPromise;
        
        // Delete records from tb_PC_Plan where Comment = 'Testtt' or PartNo is the test ones on 2026-08-31
        const result = await pool.request().query(`
            DELETE FROM [master].[tb_PC_Plan]
            WHERE PlanDate = '2026-08-31' 
            AND (Comment = 'Testtt' OR PartNo IN ('1-3874X01F1A', 'A5B34-3AM1A'));
        `);

        console.log(`Successfully deleted ${result.rowsAffected[0]} test plan(s).`);
        
        process.exit(0);
    } catch (err) {
        console.error('Error deleting test plans:', err);
        process.exit(1);
    }
}

deleteTestPlans();
