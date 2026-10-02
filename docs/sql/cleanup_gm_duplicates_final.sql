-- =============================================
-- CLEANUP DUPLICATES FROM GM TABLES
-- =============================================

USE [db_Tooling]
GO

-- ========================================
-- STEP 1: DELETE DUPLICATE SETUP
-- ========================================
;WITH CTE_Setup AS (
    SELECT *, ROW_NUMBER() OVER(
        PARTITION BY PartNo, [Holder No], Process, MC 
        ORDER BY Setup_ID
    ) as rn
    FROM [master].[tb_Master_SetupTool_GM]
)
DELETE FROM CTE_Setup WHERE rn > 1;

PRINT 'Deleted duplicate Setup rows';
GO

-- ========================================
-- STEP 2: DELETE DUPLICATE CUTTING
-- ========================================
;WITH CTE_Cutting AS (
    SELECT *, ROW_NUMBER() OVER(
        PARTITION BY PartNo, ItemNo, Process, MC 
        ORDER BY Cutting_ID
    ) as rn
    FROM [master].[tb_Master_CuttingTool_GM]
)
DELETE FROM CTE_Cutting WHERE rn > 1;

PRINT 'Deleted duplicate Cutting rows';
GO

-- ========================================
-- STEP 3: VERIFY RESULTS
-- ========================================
SELECT 'CuttingTool_GM' as TableName, COUNT(*) as TotalRows FROM [master].[tb_Master_CuttingTool_GM]
UNION ALL
SELECT 'SetupTool_GM' as TableName, COUNT(*) as TotalRows FROM [master].[tb_Master_SetupTool_GM];
GO

-- ========================================
-- STEP 4: VERIFY NO MORE DUPLICATES
-- ========================================
SELECT 'Setup Duplicates:' as CheckType, COUNT(*) as DuplicateCount
FROM (
    SELECT PartNo, [Holder No], Process, MC
    FROM [master].[tb_Master_SetupTool_GM]
    GROUP BY PartNo, [Holder No], Process, MC
    HAVING COUNT(*) > 1
) x
UNION ALL
SELECT 'Cutting Duplicates:' as CheckType, COUNT(*) as DuplicateCount
FROM (
    SELECT PartNo, ItemNo, Process, MC
    FROM [master].[tb_Master_CuttingTool_GM]
    GROUP BY PartNo, ItemNo, Process, MC
    HAVING COUNT(*) > 1
) y;
GO
