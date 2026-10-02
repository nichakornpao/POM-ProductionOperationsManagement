const sql = require('mssql');
const { poolPromise } = require('./src/config/database');

async function runIndex() {
    try {
        const pool = await poolPromise;
        const q1 = `
            IF NOT EXISTS(SELECT * FROM sys.indexes WHERE name = 'IX_Cutting_UniqueId' AND object_id = OBJECT_ID('dbo.tb_IssueCuttingTool_Request_Document'))
            BEGIN
                CREATE NONCLUSTERED INDEX IX_Cutting_UniqueId ON dbo.tb_IssueCuttingTool_Request_Document (Unique_Id);
            END
        `;
        const q2 = `
            IF NOT EXISTS(SELECT * FROM sys.indexes WHERE name = 'IX_Setup_UniqueId' AND object_id = OBJECT_ID('dbo.tb_IssueSetupTool_Request_Document'))
            BEGIN
                CREATE NONCLUSTERED INDEX IX_Setup_UniqueId ON dbo.tb_IssueSetupTool_Request_Document (Unique_Id);
            END
        `;
        await pool.request().query(q1);
        console.log('Created IX_Cutting_UniqueId');
        await pool.request().query(q2);
        console.log('Created IX_Setup_UniqueId');
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
runIndex();
