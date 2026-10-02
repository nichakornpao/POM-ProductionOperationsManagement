USE [db_Tooling]
GO

UPDATE [master].[tb_Purchase_Item_Master_PMC]
SET [Division_Id] = 3
WHERE [Division_Id] IS NULL;
GO
