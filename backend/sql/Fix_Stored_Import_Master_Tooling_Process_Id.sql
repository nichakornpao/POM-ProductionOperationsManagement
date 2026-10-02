-- Migration: Fix invalid Process_Id column reference in Stored_Import_Master_Tooling_PMC_JSON and Stored_Import_Master_Tooling_GM_JSON
-- Reason: [db_Cost_Data_Centralized].[master].[tb_Master_Machine_Group] schema is (MC_Group_Id, MC_Group, Public_Id, MC_Code).
-- Process_Id does not exist on tb_Master_Machine_Group.

-- 1. Update [trans].[Stored_Import_Master_Tooling_PMC_JSON]
-- Remove Process_Id column from INSERT and remove UPDATE MCG SET MCG.Process_Id block.

-- 2. Update [trans].[Stored_Import_Master_Tooling_GM_JSON]
-- Remove Process_Id column from INSERT and remove UPDATE MCG SET MCG.Process_Id block.
