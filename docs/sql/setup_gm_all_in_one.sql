-- =============================================
-- ALL-IN-ONE: SETUP GM TABLES FOR YOUR SP
-- รันไฟล์นี้ไฟล์เดียว ทำทุกอย่าง
-- =============================================

USE [db_Tooling]
GO

-- ========================================
-- STEP 1: RECREATE STAGING TABLE
-- ========================================
IF OBJECT_ID('[master].[Staging_ToolingData_GM]', 'U') IS NOT NULL
    DROP TABLE [master].[Staging_ToolingData_GM]
GO

CREATE TABLE [master].[Staging_ToolingData_GM](
    [StagingID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    [BatchID] UNIQUEIDENTIFIER NOT NULL,
    [PartNo] NVARCHAR(100) NULL,
    [ItemNo] NVARCHAR(100) NULL,
    [Spec] NVARCHAR(100) NULL,
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
    [Position_Code] NVARCHAR(100) NULL
)
GO

CREATE NONCLUSTERED INDEX [IX_Staging_GM_BatchID] ON [master].[Staging_ToolingData_GM]([BatchID])
GO

PRINT 'Staging Table Created!'
GO

-- ========================================
-- STEP 2: RECREATE CUTTING TOOL TABLE
-- ========================================
IF OBJECT_ID('[master].[tb_Master_CuttingTool_GM]', 'U') IS NOT NULL
    DROP TABLE [master].[tb_Master_CuttingTool_GM]
GO

CREATE TABLE [master].[tb_Master_CuttingTool_GM](
    [Cutting_ID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    [PartNo] NVARCHAR(100) NULL,
    [ItemNo] NVARCHAR(100) NULL,
    [Spec_ID] INT NULL,
    [Process] NVARCHAR(100) NULL,
    [MC] NVARCHAR(100) NULL,
    [DwgRev] NVARCHAR(50) NULL,
    [DwgUpdate] NVARCHAR(50) NULL,
    [Usage_pcs] NVARCHAR(50) NULL,
    [CT_sec] DECIMAL(10,2) NULL,
    [Position] NVARCHAR(50) NULL,
    [Res] NVARCHAR(50) NULL,
    [Date_update] NVARCHAR(50) NULL,
    [Insert_Maker] NVARCHAR(100) NULL,
    [Conner] INT NULL,
    [Usage_Conner] INT NULL,
    [Cutting_Layout_No] NVARCHAR(100) NULL,
    [Cutting_Layout_Rev] INT NULL,
    [Program_Cutting_No] NVARCHAR(100) NULL,
    [Division_Id] INT NULL,
    [Position_Code] NVARCHAR(100) NULL,
    [CreatedDate] DATETIME NULL
)
GO

PRINT 'Cutting Tool Table Created!'
GO

-- ========================================
-- STEP 3: RECREATE SETUP TOOL TABLE
-- ========================================
IF OBJECT_ID('[master].[tb_Master_SetupTool_GM]', 'U') IS NOT NULL
    DROP TABLE [master].[tb_Master_SetupTool_GM]
GO

CREATE TABLE [master].[tb_Master_SetupTool_GM](
    [Setup_ID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    [PartNo] NVARCHAR(100) NULL,
    [Holder_No] NVARCHAR(100) NULL,
    [Spec_ID] INT NULL,
    [Holder_Maker] NVARCHAR(100) NULL,
    [Process] NVARCHAR(100) NULL,
    [MC] NVARCHAR(100) NULL,
    [DateTime_Record] DATETIME NULL,
    [Division_Id] INT NULL
)
GO

PRINT 'Setup Tool Table Created!'
GO

-- ========================================
-- STEP 4: CLEANUP OLD DATA
-- ========================================
DELETE FROM [master].[tb_Mapping_Cutting_Setup] WHERE Division_Id = 3;
DELETE FROM [master].[tb_Spec_ALL] WHERE Division_Id = 3;
GO

PRINT '==================================='
PRINT 'ALL GM TABLES READY FOR YOUR SP!'
PRINT '==================================='
GO
