USE db_Cost_Data_Centralized;
GO

-- สร้าง schema ถ้ายังไม่มี
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'master')
BEGIN
    EXEC('CREATE SCHEMA [master]');
END
GO

-- สร้าง table ถ้ายังไม่มี
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[master].[tb_STK_LOC_Sync]') AND type in (N'U'))
BEGIN
    CREATE TABLE [master].[tb_STK_LOC_Sync] (
        ItemNo NVARCHAR(50) PRIMARY KEY,
        StockLoc NVARCHAR(255),
        LastUpdate DATETIME DEFAULT GETDATE()
    );
    PRINT 'Table [master].[tb_STK_LOC_Sync] created successfully.';
END
ELSE
BEGIN
    PRINT 'Table [master].[tb_STK_LOC_Sync] already exists.';
END
GO
