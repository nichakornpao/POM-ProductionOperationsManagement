const { poolPromise } = require('./src/config/database');
(async () => {
    try {
        const pool = await poolPromise;
        const res = await pool.request().query(`
            SELECT TOP 10 
                Plan_ID, 
                PartNo,
                CONVERT(varchar, PlanDate, 120) as PlanDateStr,
                CONVERT(varchar, DateTime_Record, 120) as DateTimeRecordStr,
                DateTime_Record,
                Time,
                Comment
            FROM master.tb_PC_Plan 
            WHERE PlanDate IS NOT NULL
            ORDER BY Plan_ID DESC
        `);
        console.log('Sample rows:');
        console.log(JSON.stringify(res.recordset, null, 2));

        // Check SQL Server timezone / current time
        const timeRes = await pool.request().query("SELECT GETDATE() as ServerDate, GETUTCDATE() as ServerUTCDate");
        console.log('Server time:', timeRes.recordset);

        process.exit(0);
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
})();
