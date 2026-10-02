USE [db_Tooling]
GO

-- 1. Check raw data in View_tb_Mapping_All (Top 5) to verify data actually exists and check Profit_Center format
PRINT '>>> 1. Checking View_tb_Mapping_All sample data:'
SELECT TOP 5 Profit_Center, Cutting_Item_No, Part_No, Process, MC_Group
FROM [viewer].[View_tb_Mapping_All]
GO

-- 2. Test SP with NULL parameters (Should return ALL rows)
PRINT '>>> 2. Testing SP with NULL parameters:'
EXEC [trans].[Stored_Get_CaseSET_All]
GO

-- 3. Test SP with Division '1' (which should convert to '71DZ')
PRINT '>>> 3. Testing SP with Division = "1":'
EXEC [trans].[Stored_Get_CaseSET_All] @Input_Division = '1'
GO

-- 4. Test SP with Division '71DZ' (Direct Code)
PRINT '>>> 4. Testing SP with Division = "71DZ":'
EXEC [trans].[Stored_Get_CaseSET_All] @Input_Division = '71DZ'
GO

-- 5. Test Stock Aggregation Logic (Manual run of CTE part)
PRINT '>>> 5. Testing CTE Logic for a specific item (if found in step 1):'
-- Replace 'ITEM_FROM_STEP_1' with an actual item from step 1 result if possible, or just a known item
SELECT TOP 5 ToolingName, FacilityName, FreshQty, ReuseQty, '71DZ' as PC 
FROM [db_SmartCuttingTool_PMA].[viewer].[ToolingStockOnRack]
WHERE FreshQty > 0
GO
