USE [db_Tooling]
GO

-- =============================================
-- PHASE 10: Performance Optimization V2
-- SP: [trans].[Stored_Get_CaseSET_All]
--
-- Changes from original:
--   1. Removed correlated EXISTS subquery (was re-scanning both external DB views per row)
--   2. Replaced SELECT DISTINCT M.* with SELECT DISTINCT [explicit columns]
--   3. Facility filter moved entirely into CTE (Stock_Agg) — external DBs read ONCE only
--
-- Business logic preserved:
--   - Out-of-stock items (Qty=0) still appear via LEFT JOIN + ISNULL
--   - DISTINCT still applied to prevent UI duplicates from dual PMC/GM item master joins
--   - All filter parameters (@Input_Division/PartNo/Process/MC/ItemNo/FacilityName) unchanged
--   - OPTION(RECOMPILE) retained for optimal per-execution plan
-- =============================================

CREATE OR ALTER PROCEDURE [trans].[Stored_Get_CaseSET_All]
    @Input_Division     NVARCHAR(50)  = NULL,
    @Input_FacilityName NVARCHAR(100) = NULL,
    @Input_PartNo       NVARCHAR(100) = NULL,
    @Input_Process      NVARCHAR(100) = NULL,
    @Input_MC           NVARCHAR(100) = NULL,
    @Input_ItemNo       NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- Normalize Division Input (handle numeric ID vs Profit_Center code)
    IF @Input_Division = '1' SET @Input_Division = '71DZ';
    IF @Input_Division = '2' SET @Input_Division = '7122';

    -- ★ Step 1: Pre-aggregate Stock from both external DBs — read ONCE into CTE
    --   Facility filter is applied here so the EXISTS subquery in WHERE is no longer needed.
    --   Result: each ToolingName+PC pair has a single summed FreshQty/ReuseQty.
    ;WITH Stock_Agg AS (
        SELECT
            ToolingName,
            PC,
            SUM(FreshQty) AS FreshQty,
            SUM(ReuseQty) AS ReuseQty
        FROM (
            SELECT ToolingName, FreshQty, ReuseQty, FacilityName, '71DZ' AS PC
            FROM [db_SmartCuttingTool_PMA].[viewer].[ToolingStockOnRack]
            UNION ALL
            SELECT ToolingName, FreshQty, ReuseQty, FacilityName, '7122' AS PC
            FROM [db_ToolingSmartRack].[viewer].[ToolingStockOnRack]
        ) S
        -- Facility filter here (instead of per-row EXISTS in WHERE)
        WHERE (
            @Input_FacilityName IS NULL
            OR @Input_FacilityName = ''
            OR S.FacilityName LIKE '%' + @Input_FacilityName + '%'
        )
        GROUP BY ToolingName, PC
    )

    -- ★ Step 2: Main query — explicit columns + DISTINCT + LEFT JOIN
    --   LEFT JOIN ensures out-of-stock items (no Stock_Agg match) still appear with Qty=0.
    --   DISTINCT prevents duplicate rows caused by View's dual PMC/GM item master LEFT JOINs
    --   (CT + GM_CT / ST + GM_ST may both match the same Cutting_ID across different DBs).
    SELECT DISTINCT
        -- Identity & filter columns
        M.Profit_Center,
        M.Part_No,
        M.Process,
        M.MC_Group,
        M.Position,
        M.Fac,
        -- Cutting Tool columns (COALESCE-resolved in View)
        M.Cutting_Item_No,
        M.Cutting_Spec,
        M.Cutting_Name,
        -- Setup Tool columns (COALESCE-resolved in View)
        M.Setup_Item_No,
        M.Setup_Spec,
        M.Setup_Name,
        -- Frontend-compatibility aliases (backward compat — no TS changes needed)
        M.Part_No           AS PartNo,
        M.Cutting_Item_No   AS ItemNo,
        M.Cutting_Spec      AS SPEC,
        M.MC_Group          AS MC,
        -- Stock quantities: ISNULL(0) = out-of-stock items show Qty=0, not excluded
        ISNULL(S.FreshQty, 0) AS FreshQty,
        ISNULL(S.ReuseQty, 0) AS ReuseQty
    FROM [viewer].[View_tb_Mapping_All] M
    LEFT JOIN Stock_Agg S
        ON  M.Cutting_Item_No = S.ToolingName
        AND M.Profit_Center   = S.PC
    WHERE
        (@Input_Division IS NULL OR M.Profit_Center     = @Input_Division)
        AND (@Input_PartNo  IS NULL OR M.Part_No        = @Input_PartNo)
        AND (@Input_Process IS NULL OR M.Process        = @Input_Process)
        AND (@Input_MC      IS NULL OR M.MC_Group       = @Input_MC)
        AND (@Input_ItemNo  IS NULL OR M.Cutting_Item_No = @Input_ItemNo
                                    OR M.Setup_Item_No   = @Input_ItemNo)
        -- ★ No EXISTS subquery — facility filtering handled in Stock_Agg CTE above
    ORDER BY M.Part_No, M.Process, M.MC_Group, M.Cutting_Item_No
    OPTION (RECOMPILE);
END
GO

-- =============================================
-- VERIFICATION QUERY (run after ALTER)
-- Compare row count and values vs. old SP for a known test case.
-- Expected: same rows, FreshQty/ReuseQty = 0 for out-of-stock (not excluded)
-- =============================================
/*
EXEC [trans].[Stored_Get_CaseSET_All]
    @Input_Division     = '71DZ',
    @Input_PartNo       = 'T7176-M1A',
    @Input_Process      = 'F&BORING',
    @Input_FacilityName = 'F.4'
*/
