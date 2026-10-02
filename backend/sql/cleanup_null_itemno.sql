USE [db_Tooling]
GO

-- ลบแถวที่เป็น NULL (เกิดจากการ Import แถวว่าง)
DELETE FROM [master].[tb_Purchase_Item_Master_PMC]
WHERE [ItemNo] IS NULL;
GO
