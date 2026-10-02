USE [db_Tooling]
GO
SELECT Profit_Center, COUNT(*) as TotalRows 
FROM [viewer].[View_tb_Mapping_All]
with(nolock)
WHERE Profit_Center IN ('71DZ', '7122')
GROUP BY Profit_Center
GO
