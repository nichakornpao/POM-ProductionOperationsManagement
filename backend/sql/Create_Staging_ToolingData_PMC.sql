-- =============================================
-- Author:      System Generated
-- Create Date: 2026-02-03
-- Description: สร้าง Staging Table สำหรับ Import Master Tooling PMC
-- =============================================

USE [db_Tooling]
GO

-- สร้าง Schema ถ้ายังไม่มี
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'master')
BEGIN
    EXEC('CREATE SCHEMA [master]');
END
GO

-- สร้างตาราง Staging
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Staging_ToolingData_PMC' AND schema_id = SCHEMA_ID('master'))
BEGIN
    CREATE TABLE [master].[Staging_ToolingData_PMC] (
        [ID] INT IDENTITY(1,1) PRIMARY KEY,
        [BatchID] UNIQUEIDENTIFIER NOT NULL,
        [Spec] NVARCHAR(100) NULL,
        [PartNo] NVARCHAR(100) NULL,
        [ItemNo] NVARCHAR(100) NULL,
        [Process] NVARCHAR(100) NULL,
        [MC] NVARCHAR(100) NULL,
        [DwgRev] NVARCHAR(50) NULL,
        [DwgUpdate] NVARCHAR(50) NULL,
        [Usage_pcs] NVARCHAR(50) NULL,
        [CT_sec] NVARCHAR(50) NULL,
        [Position] NVARCHAR(50) NULL,
        [Res] NVARCHAR(50) NULL,
        [Date_update] NVARCHAR(50) NULL,
        [Insert_Maker] NVARCHAR(100) NULL,
        [Holder_Spec] NVARCHAR(100) NULL,
        [Holder_No] NVARCHAR(100) NULL,
        [Holder_Maker] NVARCHAR(100) NULL,
        [Conner] NVARCHAR(50) NULL,
        [Usage_Conner] NVARCHAR(50) NULL,
        [Cutting_Layout_No] NVARCHAR(100) NULL,
        [Cutting_Layout_Rev] NVARCHAR(50) NULL,
        [Program_cutting_No] NVARCHAR(100) NULL,
        [Position_Code] NVARCHAR(100) NULL,
        [UploadedDate] DATETIME DEFAULT GETDATE(),
        [UploadedBy] NVARCHAR(100) NULL
    );
    
    PRINT 'Table [master].[Staging_ToolingData_PMC] created successfully.';
END
ELSE
BEGIN
    PRINT 'Table [master].[Staging_ToolingData_PMC] already exists.';
END
GO
