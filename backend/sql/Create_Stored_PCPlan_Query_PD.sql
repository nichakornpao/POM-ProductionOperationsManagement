USE [db_Tooling]
GO

-- =======================================================
-- NEW Stored Procedure: Stored_PCPlan_Query_PD
-- Purpose: PD-tab-specific plan list query.
--          Returns the same columns as Stored_PCPlan_Query
--          PLUS two extra aggregated flags from request tables:
--
--  ReqStatus       : The dominant Status value across both tables.
--                    'Waiting' takes priority over 'Complete'.
--                    NULL  = no request submitted yet.
--
--  IsFullyCompleted: BIT flag.
--                    1 = every single item in both request tables
--                        for this Unique_Id has Status = 'Complete'.
--                    0 = at least one item is still 'Waiting',
--                        or no request exists yet.
--
-- Usage by frontend:
--   ReqStatus IS NULL     → Show REQUEST button (no request yet)
--   ReqStatus IS NOT NULL → Show Lock icon     (request submitted)
--   IsFullyCompleted = 0  → Show Clock icon    (some items still waiting)
--   IsFullyCompleted = 1  → Show Checkmark     (all items done)
--
-- DO NOT modify Stored_PCPlan_Query. This is a separate SP.
-- =======================================================
CREATE OR ALTER PROCEDURE [trans].[Stored_PCPlan_Query_PD]
    @ShowHistory BIT = 0
AS
BEGIN
    SET NOCOUNT ON;

    -- Date Range: Beginning of Last Month to End of Next Year
    DECLARE @StartDate DATE = DATEADD(month, DATEDIFF(month, 0, GETDATE()) - 1, 0);
    DECLARE @EndDate   DATE = DATEADD(year,  DATEDIFF(year,  0, GETDATE()) + 2, 0);

    IF @ShowHistory = 1
    BEGIN
        -- ─────────────────────────────────────────────────────────
        -- ย้าย CTE มาไว้ใน IF ให้ติดกับ SELECT
        -- ─────────────────────────────────────────────────────────
        ;WITH ReqAgg AS (
            SELECT
                [Unique_Id],
                SUM(TotalItems)         AS TotalItems,
                SUM(CompletedItems)     AS CompletedItems,
                MAX(HasWaiting)         AS HasWaiting,
                MAX([Status])           AS DominantStatus
            FROM (
                SELECT
                    [Unique_Id],
                    COUNT(*)                                                     AS TotalItems,
                    SUM(CASE WHEN UPPER([Status]) = 'COMPLETE' THEN 1 ELSE 0 END) AS CompletedItems,
                    MAX(CASE WHEN UPPER([Status]) = 'WAITING'  THEN 1 ELSE 0 END) AS HasWaiting,
                    MAX([Status])                                                AS [Status]
                FROM [dbo].[tb_IssueCuttingTool_Request_Document]
                WHERE [Unique_Id] IS NOT NULL
                GROUP BY [Unique_Id]

                UNION ALL

                SELECT
                    [Unique_Id],
                    COUNT(*)                                                     AS TotalItems,
                    SUM(CASE WHEN UPPER([Status]) = 'COMPLETE' THEN 1 ELSE 0 END) AS CompletedItems,
                    MAX(CASE WHEN UPPER([Status]) = 'WAITING'  THEN 1 ELSE 0 END) AS HasWaiting,
                    MAX([Status])                                                AS [Status]
                FROM [dbo].[tb_IssueSetupTool_Request_Document]
                WHERE [Unique_Id] IS NOT NULL
                GROUP BY [Unique_Id]
            ) Combined
            GROUP BY [Unique_Id]
        )
        SELECT
            Main.*,
            -- ReqStatus: 'Waiting' if any item is waiting, else the dominant status
            CASE
                WHEN R.HasWaiting = 1                   THEN 'Waiting'
                WHEN R.DominantStatus IS NOT NULL        THEN R.DominantStatus
                ELSE NULL
            END AS ReqStatus,
            -- IsFullyCompleted: 1 only when ALL items across both tables are Complete
            CASE
                WHEN R.TotalItems IS NULL                               THEN 0  -- no request
                WHEN R.CompletedItems = R.TotalItems AND R.TotalItems > 0 THEN 1  -- all done
                ELSE 0
            END AS IsFullyCompleted
        FROM [master].[tb_PC_Plan] Main
        LEFT JOIN ReqAgg R ON R.[Unique_Id] = Main.[Unique_Id]
        WHERE Main.IsActive = 1
          AND Main.PlanDate >= @StartDate AND Main.PlanDate < @EndDate
        ORDER BY Main.PlanDate ASC, Main.GroupId, Main.Revision DESC;
    END
    ELSE
    BEGIN
        -- ─────────────────────────────────────────────────────────
        -- ย้าย CTE มาไว้ใน ELSE โดยใช้ร่วมกับ LatestRev ด้วยเครื่องหมายจุลภาค (,)
        -- ─────────────────────────────────────────────────────────
        ;WITH ReqAgg AS (
            SELECT
                [Unique_Id],
                SUM(TotalItems)         AS TotalItems,
                SUM(CompletedItems)     AS CompletedItems,
                MAX(HasWaiting)         AS HasWaiting,
                MAX([Status])           AS DominantStatus
            FROM (
                SELECT
                    [Unique_Id],
                    COUNT(*)                                                     AS TotalItems,
                    SUM(CASE WHEN UPPER([Status]) = 'COMPLETE' THEN 1 ELSE 0 END) AS CompletedItems,
                    MAX(CASE WHEN UPPER([Status]) = 'WAITING'  THEN 1 ELSE 0 END) AS HasWaiting,
                    MAX([Status])                                                AS [Status]
                FROM [dbo].[tb_IssueCuttingTool_Request_Document]
                WHERE [Unique_Id] IS NOT NULL
                GROUP BY [Unique_Id]

                UNION ALL

                SELECT
                    [Unique_Id],
                    COUNT(*)                                                     AS TotalItems,
                    SUM(CASE WHEN UPPER([Status]) = 'COMPLETE' THEN 1 ELSE 0 END) AS CompletedItems,
                    MAX(CASE WHEN UPPER([Status]) = 'WAITING'  THEN 1 ELSE 0 END) AS HasWaiting,
                    MAX([Status])                                                AS [Status]
                FROM [dbo].[tb_IssueSetupTool_Request_Document]
                WHERE [Unique_Id] IS NOT NULL
                GROUP BY [Unique_Id]
            ) Combined
            GROUP BY [Unique_Id]
        ),
        LatestRev AS (
            SELECT GroupId, MAX(Revision) as MaxRev
            FROM [master].[tb_PC_Plan]
            WHERE IsActive = 1
              AND PlanDate >= @StartDate AND PlanDate < @EndDate
            GROUP BY GroupId
        )
        SELECT
            Main.*,
            CASE
                WHEN R.HasWaiting = 1                   THEN 'Waiting'
                WHEN R.DominantStatus IS NOT NULL        THEN R.DominantStatus
                ELSE NULL
            END AS ReqStatus,
            CASE
                WHEN R.TotalItems IS NULL                               THEN 0
                WHEN R.CompletedItems = R.TotalItems AND R.TotalItems > 0 THEN 1
                ELSE 0
            END AS IsFullyCompleted,
            -- Check if already returned
            CASE WHEN EXISTS (SELECT 1 FROM [master].[tb_Return_List] RL WHERE RL.[Unique_Id] = Main.[Unique_Id]) THEN 1 ELSE 0 END AS HasReturned
        FROM [master].[tb_PC_Plan] Main
        INNER JOIN LatestRev
            ON Main.GroupId = LatestRev.GroupId
            AND Main.Revision = LatestRev.MaxRev
        LEFT JOIN ReqAgg R ON R.[Unique_Id] = Main.[Unique_Id]
        WHERE Main.IsActive = 1
        ORDER BY Main.PlanDate ASC, Main.Plan_ID DESC;
    END
END
GO
