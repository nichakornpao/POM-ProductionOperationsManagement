USE [db_Tooling]
GO

-- Add ALL missing PMC-style columns to tb_Master_CuttingTool_GM
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE Name = 'ItemNo' AND Object_ID = OBJECT_ID('[master].[tb_Master_CuttingTool_GM]'))
    ALTER TABLE [master].[tb_Master_CuttingTool_GM] ADD [ItemNo] NVARCHAR(100) NULL
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE Name = 'DwgRev' AND Object_ID = OBJECT_ID('[master].[tb_Master_CuttingTool_GM]'))
    ALTER TABLE [master].[tb_Master_CuttingTool_GM] ADD [DwgRev] NVARCHAR(50) NULL
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE Name = 'DwgUpdate' AND Object_ID = OBJECT_ID('[master].[tb_Master_CuttingTool_GM]'))
    ALTER TABLE [master].[tb_Master_CuttingTool_GM] ADD [DwgUpdate] NVARCHAR(50) NULL
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE Name = 'Usage_pcs' AND Object_ID = OBJECT_ID('[master].[tb_Master_CuttingTool_GM]'))
    ALTER TABLE [master].[tb_Master_CuttingTool_GM] ADD [Usage_pcs] NVARCHAR(50) NULL
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE Name = 'CT_sec' AND Object_ID = OBJECT_ID('[master].[tb_Master_CuttingTool_GM]'))
    ALTER TABLE [master].[tb_Master_CuttingTool_GM] ADD [CT_sec] DECIMAL(10,2) NULL
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE Name = 'Res' AND Object_ID = OBJECT_ID('[master].[tb_Master_CuttingTool_GM]'))
    ALTER TABLE [master].[tb_Master_CuttingTool_GM] ADD [Res] NVARCHAR(50) NULL
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE Name = 'Date_update' AND Object_ID = OBJECT_ID('[master].[tb_Master_CuttingTool_GM]'))
    ALTER TABLE [master].[tb_Master_CuttingTool_GM] ADD [Date_update] NVARCHAR(50) NULL
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE Name = 'Insert_Maker' AND Object_ID = OBJECT_ID('[master].[tb_Master_CuttingTool_GM]'))
    ALTER TABLE [master].[tb_Master_CuttingTool_GM] ADD [Insert_Maker] NVARCHAR(100) NULL
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE Name = 'Conner' AND Object_ID = OBJECT_ID('[master].[tb_Master_CuttingTool_GM]'))
    ALTER TABLE [master].[tb_Master_CuttingTool_GM] ADD [Conner] INT NULL
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE Name = 'Usage_Conner' AND Object_ID = OBJECT_ID('[master].[tb_Master_CuttingTool_GM]'))
    ALTER TABLE [master].[tb_Master_CuttingTool_GM] ADD [Usage_Conner] INT NULL
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE Name = 'Cutting_Layout_No' AND Object_ID = OBJECT_ID('[master].[tb_Master_CuttingTool_GM]'))
    ALTER TABLE [master].[tb_Master_CuttingTool_GM] ADD [Cutting_Layout_No] NVARCHAR(100) NULL
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE Name = 'Cutting_Layout_Rev' AND Object_ID = OBJECT_ID('[master].[tb_Master_CuttingTool_GM]'))
    ALTER TABLE [master].[tb_Master_CuttingTool_GM] ADD [Cutting_Layout_Rev] INT NULL
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE Name = 'Program_Cutting_No' AND Object_ID = OBJECT_ID('[master].[tb_Master_CuttingTool_GM]'))
    ALTER TABLE [master].[tb_Master_CuttingTool_GM] ADD [Program_Cutting_No] NVARCHAR(100) NULL
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE Name = 'Position_Code' AND Object_ID = OBJECT_ID('[master].[tb_Master_CuttingTool_GM]'))
    ALTER TABLE [master].[tb_Master_CuttingTool_GM] ADD [Position_Code] NVARCHAR(100) NULL
GO

PRINT 'All PMC columns added to tb_Master_CuttingTool_GM!'
GO
