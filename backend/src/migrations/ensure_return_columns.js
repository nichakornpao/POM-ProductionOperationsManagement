/**
 * ensure_return_columns.js
 * Migration script to ensure required columns and tables exist in DB 155 and DB Indirrec.
 * Executed as a migration script, NOT on the HTTP request path.
 */

const { poolPromise, poolRequestIndirrecPromise } = require('../config/database');
const sql = require('mssql');

async function runMigration() {
    console.log('[MIGRATION] Starting ensure_return_columns migration...');
    
    // 1. DB 155: master.tb_PC_Plan columns
    try {
        const pool155 = await poolPromise;
        if (pool155) {
            console.log('[MIGRATION] Checking master.tb_PC_Plan columns on DB 155...');
            await pool155.request().query(`
                IF COL_LENGTH('[master].[tb_PC_Plan]', 'Return Balance') IS NULL
                BEGIN
                    ALTER TABLE [master].[tb_PC_Plan] ADD [Return Balance] NVARCHAR(100) NULL;
                    PRINT 'Added [Return Balance] column to [master].[tb_PC_Plan]';
                END

                IF COL_LENGTH('[master].[tb_PC_Plan]', 'Return_By') IS NULL
                BEGIN
                    ALTER TABLE [master].[tb_PC_Plan] ADD [Return_By] NVARCHAR(150) NULL;
                    PRINT 'Added [Return_By] column to [master].[tb_PC_Plan]';
                END

                IF COL_LENGTH('[master].[tb_PC_Plan]', 'Is_Return_OK') IS NULL
                BEGIN
                    ALTER TABLE [master].[tb_PC_Plan] ADD [Is_Return_OK] INT NULL;
                    PRINT 'Added [Is_Return_OK] column to [master].[tb_PC_Plan]';
                END
            `);
            console.log('[MIGRATION] DB 155 schema verified.');
        }
    } catch (err) {
        console.error('[MIGRATION] Error migrating DB 155:', err.message);
    }

    // 2. DB Indirrec: dbo.Engineer_Return table
    try {
        const poolIndirrec = await poolRequestIndirrecPromise;
        if (poolIndirrec) {
            console.log('[MIGRATION] Checking dbo.Engineer_Return on RequestindirrecMaterial...');
            await poolIndirrec.request().query(`
                IF OBJECT_ID('dbo.Engineer_Return', 'U') IS NULL
                BEGIN
                    CREATE TABLE dbo.Engineer_Return (
                        id INT IDENTITY(1,1) PRIMARY KEY,
                        RawBarcode NVARCHAR(100) NULL,
                        PartNo NVARCHAR(50) NULL,
                        MCType NVARCHAR(20) NULL,
                        MCNo NVARCHAR(20) NULL,
                        PlanDate DATE NULL,
                        ReturnDate DATETIME NULL DEFAULT GETDATE(),
                        Status NVARCHAR(20) NULL DEFAULT 'Completed',
                        DocumentID VARCHAR(150) NULL,
                        ActionType VARCHAR(50) NULL DEFAULT 'Return',
                        ScanTime DATETIME NULL DEFAULT GETDATE(),
                        ScannedBy VARCHAR(100) NULL,
                        Remarks NVARCHAR(MAX) NULL
                    );
                    PRINT 'Created dbo.Engineer_Return table';
                END
                ELSE
                BEGIN
                    IF COL_LENGTH('dbo.Engineer_Return', 'RawBarcode') IS NULL
                        ALTER TABLE dbo.Engineer_Return ADD RawBarcode NVARCHAR(100) NULL;
                    IF COL_LENGTH('dbo.Engineer_Return', 'MCType') IS NULL
                        ALTER TABLE dbo.Engineer_Return ADD MCType NVARCHAR(20) NULL;
                    IF COL_LENGTH('dbo.Engineer_Return', 'MCNo') IS NULL
                        ALTER TABLE dbo.Engineer_Return ADD MCNo NVARCHAR(20) NULL;
                    IF COL_LENGTH('dbo.Engineer_Return', 'PlanDate') IS NULL
                        ALTER TABLE dbo.Engineer_Return ADD PlanDate DATE NULL;
                    IF COL_LENGTH('dbo.Engineer_Return', 'ReturnDate') IS NULL
                        ALTER TABLE dbo.Engineer_Return ADD ReturnDate DATETIME NULL DEFAULT GETDATE();
                    IF COL_LENGTH('dbo.Engineer_Return', 'Status') IS NULL
                        ALTER TABLE dbo.Engineer_Return ADD Status NVARCHAR(20) NULL DEFAULT 'Completed';
                    IF COL_LENGTH('dbo.Engineer_Return', 'ReturnID') IS NULL
                        ALTER TABLE dbo.Engineer_Return ADD ReturnID INT NULL;
                END
            `);
            console.log('[MIGRATION] DB Indirrec schema verified.');
        }
    } catch (err) {
        console.error('[MIGRATION] Error migrating DB Indirrec:', err.message);
    }

    console.log('[MIGRATION] Migration finished.');
}

if (require.main === module) {
    runMigration().then(() => {
        process.exit(0);
    }).catch(err => {
        console.error(err);
        process.exit(1);
    });
}

module.exports = runMigration;
