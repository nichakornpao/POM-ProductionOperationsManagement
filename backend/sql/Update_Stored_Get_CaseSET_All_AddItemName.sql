USE [db_Tooling]
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- =============================================
-- Optimized CaseSET Search (CTE Version)
-- Optimized for speed using pre-aggregated stock totals
-- Handles Division Code normalization ('1' -> '71DZ', '2' -> '7122')
-- Added Cutting_Name and Setup_Name for frontend display
-- =============================================
CREATE OR ALTER PROCEDURE [trans].[Stored_Get_CaseSET_All]
    @Input_Division NVARCHAR(50) = NULL,
    @Input_FacilityName NVARCHAR(100) = NULL,
    @Input_PartNo NVARCHAR(100) = NULL,
    @Input_Process NVARCHAR(100) = NULL,
    @Input_MC NVARCHAR(100) = NULL,
    @Input_ItemNo NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- Normalize Division Input (Handle ID vs Code mismatch)
    IF @Input_Division = '1' SET @Input_Division = '71DZ';
    IF @Input_Division = '2' SET @Input_Division = '7122';

    -- 1. Pre-aggregate Stock Qty based on Facility to avoid row-by-row subqueries
    ;WITH Stock_Agg AS (
        SELECT 
            ToolingName, 
            PC, 
            SUM(FreshQty) as FreshQty, 
            SUM(ReuseQty) as ReuseQty
        FROM (
            SELECT ToolingName, FreshQty, ReuseQty, FacilityName, '71DZ' as PC FROM [db_SmartCuttingTool_PMA].[viewer].[ToolingStockOnRack]
            UNION ALL
            SELECT ToolingName, FreshQty, ReuseQty, FacilityName, '7122' as PC FROM [db_ToolingSmartRack].[viewer].[ToolingStockOnRack]
        ) S
        WHERE (@Input_FacilityName IS NULL OR @Input_FacilityName = '' OR S.FacilityName LIKE '%' + @Input_FacilityName + '%')
        GROUP BY ToolingName, PC
    )
    
    -- 2. Main Query: Join Mapping with pre-aggregated Stock
    SELECT DISTINCT
        M.*,
        M.Part_No AS PartNo,
        M.Cutting_Item_No AS ItemNo,
        M.Cutting_Spec AS SPEC,
        M.MC_Group AS MC,
        ISNULL(S.FreshQty, 0) AS FreshQty,
        ISNULL(S.ReuseQty, 0) AS ReuseQty
    FROM [viewer].[View_tb_Mapping_All] M
    LEFT JOIN Stock_Agg S 
        ON M.Cutting_Item_No = S.ToolingName 
        AND M.Profit_Center = S.PC
    WHERE (@Input_Division IS NULL OR M.[Profit_Center] = @Input_Division)
      AND (@Input_PartNo IS NULL OR M.[Part_No] = @Input_PartNo)
      AND (@Input_Process IS NULL OR M.[Process] = @Input_Process)
      AND (@Input_MC IS NULL OR M.[MC_Group] = @Input_MC)
      AND (@Input_ItemNo IS NULL OR M.[Cutting_Item_No] = @Input_ItemNo OR M.[Setup_Item_No] = @Input_ItemNo)
      -- Facility Filter check: Only apply if @Input_FacilityName IS NOT NULL
      AND (
          @Input_FacilityName IS NULL OR @Input_FacilityName = '' 
          OR EXISTS (
              SELECT 1 FROM (
                  SELECT ToolingName, FacilityName, '71DZ' as PC FROM [db_SmartCuttingTool_PMA].[viewer].[ToolingStockOnRack]
                  UNION ALL
                  SELECT ToolingName, FacilityName, '7122' as PC FROM [db_ToolingSmartRack].[viewer].[ToolingStockOnRack]
              ) F
              WHERE F.ToolingName = M.Cutting_Item_No 
                AND F.PC = M.Profit_Center
                AND F.FacilityName LIKE '%' + @Input_FacilityName + '%'
          )
      )
    ORDER BY M.Part_No, M.Process, M.MC_Group, M.Cutting_Item_No
    OPTION (RECOMPILE);
END
GO
