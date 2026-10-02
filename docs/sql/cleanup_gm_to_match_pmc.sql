USE [db_Tooling]
GO

-- ========================================
-- STEP 1: DROP OLD GM-STYLE COLUMNS FROM SetupTool_GM
-- เหลือแค่ Column แบบ PMC (มี Space)
-- ========================================

-- ลบ Column underscore style (เก็บ space style ไว้)
IF EXISTS (SELECT 1 FROM sys.columns WHERE Name = 'Holder_No' AND Object_ID = OBJECT_ID('[master].[tb_Master_SetupTool_GM]'))
    ALTER TABLE [master].[tb_Master_SetupTool_GM] DROP COLUMN [Holder_No]
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE Name = 'Holder_Spec' AND Object_ID = OBJECT_ID('[master].[tb_Master_SetupTool_GM]'))
    ALTER TABLE [master].[tb_Master_SetupTool_GM] DROP COLUMN [Holder_Spec]
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE Name = 'Holder_Maker' AND Object_ID = OBJECT_ID('[master].[tb_Master_SetupTool_GM]'))
    ALTER TABLE [master].[tb_Master_SetupTool_GM] DROP COLUMN [Holder_Maker]
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE Name = 'CreatedDate' AND Object_ID = OBJECT_ID('[master].[tb_Master_SetupTool_GM]'))
    ALTER TABLE [master].[tb_Master_SetupTool_GM] DROP COLUMN [CreatedDate]
GO

-- ลบ Column เก่าที่ไม่ได้ใช้
IF EXISTS (SELECT 1 FROM sys.columns WHERE Name = 'ItemSetUpTool' AND Object_ID = OBJECT_ID('[master].[tb_Master_SetupTool_GM]'))
    ALTER TABLE [master].[tb_Master_SetupTool_GM] DROP COLUMN [ItemSetUpTool]
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE Name = 'NameSetUpTool' AND Object_ID = OBJECT_ID('[master].[tb_Master_SetupTool_GM]'))
    ALTER TABLE [master].[tb_Master_SetupTool_GM] DROP COLUMN [NameSetUpTool]
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE Name = 'SetUpTool' AND Object_ID = OBJECT_ID('[master].[tb_Master_SetupTool_GM]'))
    ALTER TABLE [master].[tb_Master_SetupTool_GM] DROP COLUMN [SetUpTool]
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE Name = 'Position' AND Object_ID = OBJECT_ID('[master].[tb_Master_SetupTool_GM]'))
    ALTER TABLE [master].[tb_Master_SetupTool_GM] DROP COLUMN [Position]
GO

PRINT 'SetupTool_GM cleaned - now matches PMC structure!'
GO

-- ========================================
-- STEP 2: Verify structure
-- ========================================
SELECT COLUMN_NAME 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = 'master' AND TABLE_NAME = 'tb_Master_SetupTool_GM'
ORDER BY ORDINAL_POSITION
GO
