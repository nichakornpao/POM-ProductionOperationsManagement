USE [db_Tooling]
GO

-- Add missing columns to tb_Master_CuttingTool_GM
ALTER TABLE [master].[tb_Master_CuttingTool_GM] ADD [Res] NVARCHAR(50) NULL
GO

-- Verify all columns exist
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = 'master' AND TABLE_NAME = 'tb_Master_CuttingTool_GM'
ORDER BY ORDINAL_POSITION
GO
