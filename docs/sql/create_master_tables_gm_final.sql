-- =============================================
-- MASTER TABLES FOR GM (ให้ตรงกับ SP)
-- =============================================

USE [db_Tooling]
GO

-- ========================================
-- DROP OLD TABLES
-- ========================================
IF OBJECT_ID('[master].[tb_Master_CuttingTool_GM]', 'U') IS NOT NULL
    DROP TABLE [master].[tb_Master_CuttingTool_GM]
GO

IF OBJECT_ID('[master].[tb_Master_SetupTool_GM]', 'U') IS NOT NULL
    DROP TABLE [master].[tb_Master_SetupTool_GM]
GO

-- ========================================
-- CREATE CUTTING TOOL TABLE (ตรงกับ SP)
-- ========================================
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

PRINT 'tb_Master_CuttingTool_GM created!'
GO

-- ========================================
-- CREATE SETUP TOOL TABLE (ตรงกับ SP)
-- ========================================
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

PRINT 'tb_Master_SetupTool_GM created!'
GO

-- ========================================
-- DELETE OLD DATA FROM RELATED TABLES
-- ========================================
DELETE FROM [master].[tb_Mapping_Cutting_Setup] WHERE Division_Id = 3;
DELETE FROM [master].[tb_Spec_ALL] WHERE Division_Id = 3;
GO

PRINT 'All GM tables recreated successfully!'
GO
