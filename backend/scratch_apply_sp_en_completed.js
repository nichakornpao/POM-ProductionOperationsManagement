const { poolPromise } = require('./src/config/database');

async function run() {
  try {
    const pool = await poolPromise;
    console.log('Updating trans.Stored_PCPlan_Query for Is_EN_Completed filtering...');

    const spSql = `
CREATE OR ALTER PROCEDURE [trans].[Stored_PCPlan_Query]
    @ShowHistory   BIT            = 0,
    @PageNumber    INT            = 1,
    @PageSize      INT            = 100,
    @Department    NVARCHAR(10)   = 'PC',
    @SubTab        NVARCHAR(20)   = 'ALL',    -- 'Upcoming','Required','Completed','ALL'
    @FilterDate    DATE           = NULL,
    @FilterMachine NVARCHAR(100)  = NULL,
    @FilterFac     NVARCHAR(100)  = NULL,
    @FilterProcess NVARCHAR(100)  = NULL,
    @FilterPartNo  NVARCHAR(100)  = NULL,
    @FilterDivision NVARCHAR(50)  = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @StartDate DATE = DATEADD(month, DATEDIFF(month, 0, GETDATE()) - 1, 0);
    DECLARE @EndDate   DATE = DATEADD(year,  DATEDIFF(year,  0, GETDATE()) + 2, 0);
    DECLARE @Today     DATE = CAST(GETDATE() AS DATE);
    DECLARE @Offset    INT  = (@PageNumber - 1) * @PageSize;

    -- Drop temp tables if they exist (defensive)
    IF OBJECT_ID('tempdb..#BasePlan') IS NOT NULL DROP TABLE #BasePlan;
    IF OBJECT_ID('tempdb..#LatestItems') IS NOT NULL DROP TABLE #LatestItems;

    -- ─── 1. ReqStatus CTE + Dump to #BasePlan ──────────────────────────────
    ;WITH ReqStatus AS (
        SELECT [Unique_Id],
            CASE WHEN MAX(CASE WHEN UPPER([Status]) IN ('WAITING','IN PROGRESS') THEN 1 ELSE 0 END) = 1 THEN 'Waiting'
                 ELSE MAX([Status]) END AS ReqStatus,
            MAX([Status_To_PH]) AS Status_To_PH
        FROM (
            SELECT [Unique_Id], [Status], [Status_To_PH] FROM [dbo].[tb_IssueCuttingTool_Request_Document] WHERE [Unique_Id] IS NOT NULL
            UNION ALL
            SELECT [Unique_Id], [Status], [Status_To_PH] FROM [dbo].[tb_IssueSetupTool_Request_Document]   WHERE [Unique_Id] IS NOT NULL
        ) Combined
        GROUP BY [Unique_Id]
    )
    SELECT Main.*, ISNULL(RS.ReqStatus, NULL) AS ReqStatus, ISNULL(RS.Status_To_PH, NULL) AS Status_To_PH,
           CASE WHEN GroupId = '-' THEN CONCAT(CONVERT(VARCHAR, PlanDate, 112), '|', ISNULL(PartNo,''), '|', ISNULL(MC_No,''), '|', ISNULL(Process,'')) ELSE GroupId END AS PseudoGroupId
    INTO #BasePlan
    FROM [master].[tb_PC_Plan] Main
    LEFT JOIN ReqStatus RS ON RS.[Unique_Id] = Main.[Unique_Id]
    WHERE Main.IsActive = 1
      AND Main.PlanDate >= @StartDate AND Main.PlanDate < @EndDate;

    -- ─── 2. Find Latest Revision & Create #LatestItems ───────────────────────
    ;WITH LatestRev AS (
        SELECT PseudoGroupId, MAX(Revision) AS MaxRev, MAX(PlanDate) AS GroupDate, MAX(Plan_ID) AS GroupMaxId
        FROM #BasePlan
        GROUP BY PseudoGroupId
    )
    SELECT B.*, LR.GroupDate, LR.GroupMaxId, LR.MaxRev
    INTO #LatestItems
    FROM #BasePlan B
    INNER JOIN LatestRev LR ON B.PseudoGroupId = LR.PseudoGroupId AND B.Revision = LR.MaxRev
    WHERE (@FilterDate    IS NULL OR B.PlanDate  = @FilterDate)
      AND (@FilterMachine IS NULL OR B.MC_Type   = @FilterMachine)
      AND (@FilterFac     IS NULL OR B.Facility  = @FilterFac)
      AND (@FilterProcess IS NULL OR B.Process   = @FilterProcess)
      AND (@FilterPartNo  IS NULL OR B.PartNo    = @FilterPartNo)
      AND (@FilterDivision IS NULL OR B.Division = @FilterDivision);

    -- ─── 3. Result Set 1: Paginated data ─────────────────────────────────────
    ;WITH FilteredLatest AS (
        SELECT *
        FROM #LatestItems
        WHERE 
            @SubTab = 'ALL' 
            OR (@SubTab = 'Upcoming' AND PlanDate >= @Today)
            OR (@SubTab = 'Required' AND @Department = 'EN' AND UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED' AND ISNULL(Is_EN_Completed, 0) = 0)
            OR (@SubTab = 'Required' AND @Department = 'QC' AND UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED' AND (ISNULL(Path_IIQC,'-')='-' OR Path_IIQC=''))
            OR (@SubTab = 'Required' AND @Department NOT IN ('EN','QC','PD') AND UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED')
            OR (@SubTab = 'Completed' AND @Department = 'EN' AND UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED' AND ISNULL(Is_EN_Completed, 0) = 1)
            OR (@SubTab = 'Completed' AND @Department = 'QC' AND UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED' AND Path_IIQC IS NOT NULL AND Path_IIQC<>'-' AND Path_IIQC<>'')
    ),
    PaginatedGroups AS (
        SELECT PseudoGroupId, GroupDate, GroupMaxId
        FROM FilteredLatest
        ORDER BY GroupDate ASC, GroupMaxId DESC
        OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY
    ),
    FinalResultSet AS (
        SELECT B.*, PG.GroupDate, PG.GroupMaxId, LR.MaxRev, 
               CASE WHEN B.Revision = LR.MaxRev THEN 1 ELSE 0 END AS IsLatestServer
        FROM PaginatedGroups PG
        INNER JOIN #BasePlan B ON PG.PseudoGroupId = B.PseudoGroupId
        INNER JOIN (SELECT PseudoGroupId, MaxRev FROM #LatestItems) LR ON B.PseudoGroupId = LR.PseudoGroupId
        WHERE (@ShowHistory = 1 OR B.Revision = LR.MaxRev)
    )
    SELECT * 
    FROM FinalResultSet
    ORDER BY GroupDate ASC, GroupMaxId DESC, Revision DESC;

    -- ─── 4. Result Set 2: Counts ───────────────────────────────────────────────
    SELECT
        COUNT(*) AS TotalCount,
        SUM(CASE WHEN UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED' AND PlanDate >= @Today THEN 1 ELSE 0 END) AS UpcomingCount,
        SUM(CASE WHEN @Department = 'EN' AND UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED' AND ISNULL(Is_EN_Completed, 0) = 0 THEN 1 ELSE 0 END
           + CASE WHEN @Department = 'QC' AND UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED' AND (ISNULL(Path_IIQC,'-')='-' OR Path_IIQC='') THEN 1 ELSE 0 END
           + CASE WHEN @Department NOT IN ('EN','QC','PD') AND UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED' THEN 1 ELSE 0 END) AS RequiredCount,
        SUM(CASE WHEN @Department = 'EN' AND UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED' AND ISNULL(Is_EN_Completed, 0) = 1 THEN 1 ELSE 0 END
           + CASE WHEN @Department = 'QC' AND UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED' AND Path_IIQC IS NOT NULL AND Path_IIQC<>'-' AND Path_IIQC<>'' THEN 1 ELSE 0 END) AS CompletedCount
    FROM #LatestItems;

    -- Cleanup
    DROP TABLE #BasePlan;
    DROP TABLE #LatestItems;
END
    `;

    await pool.request().query(spSql);
    console.log('✅ Successfully updated trans.Stored_PCPlan_Query!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error updating SP:', err);
    process.exit(1);
  }
}

run();
