-- =======================================================
-- Update Stored_PCPlan_Query to include Status_To_PH
-- from the linked request document tables (via Unique_Id).
--
-- Status_To_PH is populated in:
--   tb_IssueCuttingTool_Request_Document
--   tb_IssueSetupTool_Request_Document
-- Both are joined via Unique_Id.
-- If a plan has multiple requests (one cutting, one setup),
-- we prefer the Cutting Tool Status first, then Setup.
-- 'Complete' takes priority over any other value.
-- =======================================================
USE [db_Tooling]
GO

CREATE OR ALTER PROCEDURE [trans].[Stored_PCPlan_Query]
    @ShowHistory BIT = 0
AS
BEGIN
    SET NOCOUNT ON;

    -- Define Date Range: Beginning of Last Month to End of Next Year
    DECLARE @StartDate DATE = DATEADD(month, DATEDIFF(month, 0, GETDATE()) - 1, 0);
    DECLARE @EndDate   DATE = DATEADD(year,  DATEDIFF(year,  0, GETDATE()) + 2, 0);

    IF @ShowHistory = 1
    BEGIN
        -- Show ALL records (Active + History) within range
        SELECT
            Main.*,
            -- Merge Status_To_PH: prefer 'Complete' if either table has it
            CASE
                WHEN ISNULL(CT.Status_To_PH, '') = 'Complete' OR ISNULL(ST.Status_To_PH, '') = 'Complete'
                    THEN 'Complete'
                ELSE COALESCE(CT.Status_To_PH, ST.Status_To_PH, NULL)
            END AS Status_To_PH
        FROM [master].[tb_PC_Plan] Main
        LEFT JOIN (
            SELECT [Unique_Id], MAX([Status_To_PH]) AS [Status_To_PH]
            FROM [dbo].[tb_IssueCuttingTool_Request_Document]
            WHERE [Unique_Id] IS NOT NULL
            GROUP BY [Unique_Id]
        ) CT ON CT.[Unique_Id] = Main.[Unique_Id]
        LEFT JOIN (
            SELECT [Unique_Id], MAX([Status_To_PH]) AS [Status_To_PH]
            FROM [dbo].[tb_IssueSetupTool_Request_Document]
            WHERE [Unique_Id] IS NOT NULL
            GROUP BY [Unique_Id]
        ) ST ON ST.[Unique_Id] = Main.[Unique_Id]
        WHERE Main.IsActive = 1
          AND Main.PlanDate >= @StartDate AND Main.PlanDate < @EndDate
        ORDER BY Main.PlanDate ASC, Main.GroupId, Main.Revision DESC;
    END
    ELSE
    BEGIN
        -- Show LATEST revision only within range
        WITH LatestRev AS (
            SELECT GroupId, MAX(Revision) as MaxRev
            FROM [master].[tb_PC_Plan]
            WHERE IsActive = 1
              AND PlanDate >= @StartDate AND PlanDate < @EndDate
            GROUP BY GroupId
        )
        SELECT
            Main.*,
            -- Merge Status_To_PH: prefer 'Complete' if either table has it
            CASE
                WHEN ISNULL(CT.Status_To_PH, '') = 'Complete' OR ISNULL(ST.Status_To_PH, '') = 'Complete'
                    THEN 'Complete'
                ELSE COALESCE(CT.Status_To_PH, ST.Status_To_PH, NULL)
            END AS Status_To_PH
        FROM [master].[tb_PC_Plan] Main
        INNER JOIN LatestRev
            ON Main.GroupId = LatestRev.GroupId
            AND Main.Revision = LatestRev.MaxRev
        LEFT JOIN (
            SELECT [Unique_Id], MAX([Status_To_PH]) AS [Status_To_PH]
            FROM [dbo].[tb_IssueCuttingTool_Request_Document]
            WHERE [Unique_Id] IS NOT NULL
            GROUP BY [Unique_Id]
        ) CT ON CT.[Unique_Id] = Main.[Unique_Id]
        LEFT JOIN (
            SELECT [Unique_Id], MAX([Status_To_PH]) AS [Status_To_PH]
            FROM [dbo].[tb_IssueSetupTool_Request_Document]
            WHERE [Unique_Id] IS NOT NULL
            GROUP BY [Unique_Id]
        ) ST ON ST.[Unique_Id] = Main.[Unique_Id]
        WHERE Main.IsActive = 1
        ORDER BY Main.PlanDate ASC, Main.Plan_ID DESC;
    END
END
GO
