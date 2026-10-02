USE [db_Tooling]
GO

-- =============================================
-- Author:      Antigravity
-- Create date: 2026-03-17
-- Description: Fix Missing Revision History in Plan List
--              Modified to include IsActive = 0 records when @ShowHistory = 1
-- =============================================
ALTER PROCEDURE [trans].[Stored_PCPlan_Query]
    @ShowHistory BIT = 0
AS
BEGIN
    SET NOCOUNT ON;

    -- Define Date Range: Beginning of Last Month to End of Next Year
    DECLARE @StartDate DATE = DATEADD(month, DATEDIFF(month, 0, GETDATE()) - 1, 0); 
    DECLARE @EndDate DATE = DATEADD(year, DATEDIFF(year, 0, GETDATE()) + 2, 0); 

    IF @ShowHistory = 1
    BEGIN
        -- [FIX] Removed "AND IsActive = 1" to allow historical revisions
        SELECT *
        FROM [master].[tb_PC_Plan]
        WHERE PlanDate >= @StartDate AND PlanDate < @EndDate
        -- Order by Date ASC (Soonest first), then Group items together, then Latest Rev first
        ORDER BY PlanDate ASC, GroupId, Revision DESC;
    END
    ELSE
    BEGIN
        -- Show LATEST only within range (Still filtered by IsActive = 1 as it's the current active plan)
        WITH LatestRev AS (
            SELECT GroupId, MAX(Revision) as MaxRev
            FROM [master].[tb_PC_Plan]
            WHERE IsActive = 1
              AND PlanDate >= @StartDate AND PlanDate < @EndDate
            GROUP BY GroupId
        )
        SELECT Main.*
        FROM [master].[tb_PC_Plan] Main
        INNER JOIN LatestRev 
            ON Main.GroupId = LatestRev.GroupId 
            AND Main.Revision = LatestRev.MaxRev
        WHERE Main.IsActive = 1
        ORDER BY Main.PlanDate ASC, Main.Plan_ID DESC;
    END
END
GO
