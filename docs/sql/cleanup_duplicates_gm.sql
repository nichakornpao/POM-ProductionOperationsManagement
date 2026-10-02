USE [db_Tooling]
GO

-- ========================================
-- STEP 1: DELETE DUPLICATES FROM CuttingTool_GM
-- Keep only the first record for each unique combination
-- ========================================
WITH CTE_Cutting AS (
    SELECT *, ROW_NUMBER() OVER(PARTITION BY PartNo, ItemNo, Process, MC ORDER BY Cutting_ID) as rn
    FROM [master].[tb_Master_CuttingTool_GM]
    WHERE ItemNo IS NOT NULL
)
DELETE FROM CTE_Cutting WHERE rn > 1
GO

PRINT 'Deleted duplicate Cutting records'
GO

-- ========================================
-- STEP 2: DELETE DUPLICATES FROM SetupTool_GM
-- ========================================
WITH CTE_Setup AS (
    SELECT *, ROW_NUMBER() OVER(PARTITION BY PartNo, Holder_No, Process, MC ORDER BY Setup_ID) as rn
    FROM [master].[tb_Master_SetupTool_GM]
    WHERE Holder_No IS NOT NULL
)
DELETE FROM CTE_Setup WHERE rn > 1
GO

PRINT 'Deleted duplicate Setup records'
GO

-- ========================================
-- STEP 3: CHECK RESULTS
-- ========================================
SELECT 'CuttingTool_GM' as TableName, COUNT(*) as TotalRows FROM [master].[tb_Master_CuttingTool_GM]
UNION ALL
SELECT 'SetupTool_GM' as TableName, COUNT(*) as TotalRows FROM [master].[tb_Master_SetupTool_GM]
GO
