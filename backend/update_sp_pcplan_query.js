const { poolPromise, sql } = require('./src/config/database');

async function run() {
  try {
    const pool = await poolPromise;
    console.log('Updating trans.Stored_PCPlan_Query so EN Completed subtab strictly requires manual DWG & Layout paths...');

    const spSql = `
CREATE OR ALTER PROCEDURE [trans].[Stored_PCPlan_Query]
    @ShowHistory    BIT            = 0,
    @PageNumber     INT            = 1,
    @PageSize       INT            = 100,
    @Department     NVARCHAR(10)   = 'PC',
    @SubTab         NVARCHAR(20)   = 'ALL',    -- 'Upcoming','Required','Completed','ALL','Returned'
    @FilterDate     DATE           = NULL,
    @FilterMachine  NVARCHAR(MAX)  = NULL,
    @FilterFac      NVARCHAR(MAX)  = NULL,
    @FilterProcess  NVARCHAR(MAX)  = NULL,
    @FilterPartNo   NVARCHAR(MAX)  = NULL,
    @FilterDivision NVARCHAR(50)   = NULL,
    @FilterStatus   NVARCHAR(50)   = NULL,
    @SortDir        NVARCHAR(4)    = 'DESC'
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Today     DATE = CAST(GETDATE() AS DATE);
    DECLARE @StartDate DATE = DATEADD(year, -2, @Today);
    DECLARE @EndDate   DATE = DATEADD(year,  2, @Today);
    DECLARE @Offset    INT  = (@PageNumber - 1) * @PageSize;

    -- Drop temp tables if they exist
    IF OBJECT_ID('tempdb..#BasePlan') IS NOT NULL DROP TABLE #BasePlan;
    IF OBJECT_ID('tempdb..#LatestItems') IS NOT NULL DROP TABLE #LatestItems;

    -- ─── 1. Build Base Plan Data ─────────────────────────────────────────────
    ;WITH PartPaths AS (
        SELECT PartNo,
               MAX(CASE WHEN (Path_Dwg_Source IS NULL OR Path_Dwg_Source <> 'manual') AND Path_Dwg IS NOT NULL AND Path_Dwg <> '-' AND Path_Dwg <> '' THEN Path_Dwg END) AS Auto_Path_Dwg,
               MAX(CASE WHEN (Path_Layout_Source IS NULL OR Path_Layout_Source <> 'manual') AND Path_Layout IS NOT NULL AND Path_Layout <> '-' AND Path_Layout <> '' THEN Path_Layout END) AS Auto_Path_Layout,
               MAX(CASE WHEN Path_IIQC IS NOT NULL AND Path_IIQC <> '-' AND Path_IIQC <> '' THEN Path_IIQC END) AS Auto_Path_IIQC
        FROM [master].[tb_PC_Plan]
        WHERE PartNo IS NOT NULL AND PartNo <> ''
        GROUP BY PartNo
    ),
    ReqStatus AS (
        SELECT [Unique_Id],
            CASE WHEN MAX(CASE WHEN UPPER([Status]) IN ('WAITING','IN PROGRESS') THEN 1 ELSE 0 END) = 1 THEN 'Waiting'
                 ELSE MAX([Status]) END AS ReqStatus,
            MAX([Status_To_PH]) AS Status_To_PH
        FROM (
            SELECT CAST([Unique_Id] AS NVARCHAR(100)) AS [Unique_Id], [Status], [Status_To_PH] FROM [dbo].[tb_IssueCuttingTool_Request_Document] WHERE [Unique_Id] IS NOT NULL
            UNION ALL
            SELECT CAST([Unique_Id] AS NVARCHAR(100)) AS [Unique_Id], [Status], [Status_To_PH] FROM [dbo].[tb_IssueSetupTool_Request_Document]   WHERE [Unique_Id] IS NOT NULL
        ) Combined
        GROUP BY [Unique_Id]
    )
    SELECT Main.*,
           PP.Auto_Path_Dwg,
           PP.Auto_Path_Layout,
           PP.Auto_Path_IIQC,
           ISNULL(RS.ReqStatus, NULL) AS ReqStatus,
           ISNULL(RS.Status_To_PH, NULL) AS Status_To_PH,
           CASE 
               WHEN Main.GroupId IS NOT NULL AND Main.GroupId <> '' THEN Main.GroupId
               ELSE 'PLAN-' + CAST(Main.Plan_ID AS NVARCHAR(50))
           END AS PseudoGroupId
    INTO #BasePlan
    FROM [master].[tb_PC_Plan] Main
    LEFT JOIN PartPaths PP ON Main.PartNo = PP.PartNo
    LEFT JOIN ReqStatus RS ON Main.Unique_Id IS NOT NULL AND (RS.Unique_Id = 'PLAN-' + CAST(Main.Unique_Id AS NVARCHAR(100)) OR RS.Unique_Id = CAST(Main.Unique_Id AS NVARCHAR(100)))
    WHERE Main.IsActive = 1
      AND (
          (Main.PlanDate >= @StartDate AND Main.PlanDate <= @EndDate)
          OR (@FilterDate IS NOT NULL AND Main.PlanDate = @FilterDate)
      )
      AND (@FilterDate     IS NULL OR Main.PlanDate   = @FilterDate)
      AND (@FilterMachine  IS NULL OR Main.MC_Type    = @FilterMachine)
      AND (@FilterFac      IS NULL OR Main.Facility   = @FilterFac)
      AND (@FilterProcess  IS NULL OR Main.Process    = @FilterProcess)
      AND (@FilterPartNo   IS NULL OR Main.PartNo     = @FilterPartNo)
      AND (@FilterDivision IS NULL OR Main.Division   = @FilterDivision);

    -- ─── 2. Calculate Latest Revision per PseudoGroupId & Join Print History ─
    ;WITH LatestRev AS (
        SELECT PseudoGroupId,
               MAX(PlanDate) AS GroupDate,
               MAX(Plan_ID)  AS GroupMaxId,
               MAX(Revision) AS MaxRev
        FROM #BasePlan
        GROUP BY PseudoGroupId
    ),
    PrintHistory AS (
        SELECT DocNo,
               SUM(CASE WHEN TypePrint = 'PathDwg' THEN Total ELSE 0 END) AS PrintDwgCount,
               SUM(CASE WHEN TypePrint = 'PathLayout' THEN Total ELSE 0 END) AS PrintLayoutCount,
               SUM(CASE WHEN TypePrint = 'IIQC' THEN Total ELSE 0 END) AS PrintIiqcCount
        FROM [dbo].[tb_Cuttingtool_HistoryPrint]
        WHERE DocNo IS NOT NULL
        GROUP BY DocNo
    )
    SELECT B.*, LR.GroupDate, LR.GroupMaxId, LR.MaxRev,
           ISNULL(PH.PrintDwgCount, 0) AS PrintDwgCount,
           ISNULL(PH.PrintLayoutCount, 0) AS PrintLayoutCount,
           ISNULL(PH.PrintIiqcCount, 0) AS PrintIiqcCount
    INTO #LatestItems
    FROM #BasePlan B
    INNER JOIN LatestRev LR ON B.PseudoGroupId = LR.PseudoGroupId AND B.Revision = LR.MaxRev
    LEFT JOIN PrintHistory PH ON PH.DocNo = B.GroupId;

    -- ─── 3. Filter by SubTab & Apply Pagination ──────────────────────────────
    IF UPPER(@SortDir) = 'ASC'
    BEGIN
        ;WITH FilteredLatest AS (
            SELECT *
            FROM #LatestItems
            WHERE 
                @SubTab = 'ALL' 
                OR (@SubTab = 'Upcoming' AND PlanDate >= @Today)
                OR (@SubTab = 'Required' AND @Department = 'EN' AND UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED' AND NOT (Path_Dwg IS NOT NULL AND Path_Dwg <> '-' AND Path_Dwg <> '' AND Path_Layout IS NOT NULL AND Path_Layout <> '-' AND Path_Layout <> '' AND ISNULL(Path_Dwg_Source,'') = 'manual' AND ISNULL(Path_Layout_Source,'') = 'manual'))
                OR (@SubTab = 'Required' AND @Department IN ('QC','Gague') AND UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED' AND (ISNULL(Path_IIQC,'-')='-' OR Path_IIQC=''))
                OR (@SubTab = 'Required' AND @Department NOT IN ('EN','QC','Gague','PD') AND UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED')
                OR (@SubTab = 'Completed' AND @Department = 'EN' AND UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED' AND Path_Dwg IS NOT NULL AND Path_Dwg <> '-' AND Path_Dwg <> '' AND Path_Layout IS NOT NULL AND Path_Layout <> '-' AND Path_Layout <> '' AND ISNULL(Path_Dwg_Source,'') = 'manual' AND ISNULL(Path_Layout_Source,'') = 'manual')
                OR (@SubTab = 'Completed' AND @Department IN ('QC','Gague') AND UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED' AND Path_IIQC IS NOT NULL AND Path_IIQC<>'--' AND Path_IIQC<>'')
                OR (@SubTab = 'Returned' AND Is_Return_OK = 1)
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
    END
    ELSE
    BEGIN
        ;WITH FilteredLatest AS (
            SELECT *
            FROM #LatestItems
            WHERE 
                @SubTab = 'ALL' 
                OR (@SubTab = 'Upcoming' AND PlanDate >= @Today)
                OR (@SubTab = 'Required' AND @Department = 'EN' AND UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED' AND NOT (Path_Dwg IS NOT NULL AND Path_Dwg <> '-' AND Path_Dwg <> '' AND Path_Layout IS NOT NULL AND Path_Layout <> '-' AND Path_Layout <> '' AND ISNULL(Path_Dwg_Source,'') = 'manual' AND ISNULL(Path_Layout_Source,'') = 'manual'))
                OR (@SubTab = 'Required' AND @Department IN ('QC','Gague') AND UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED' AND (ISNULL(Path_IIQC,'-')='-' OR Path_IIQC=''))
                OR (@SubTab = 'Required' AND @Department NOT IN ('EN','QC','Gague','PD') AND UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED')
                OR (@SubTab = 'Completed' AND @Department = 'EN' AND UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED' AND Path_Dwg IS NOT NULL AND Path_Dwg <> '-' AND Path_Dwg <> '' AND Path_Layout IS NOT NULL AND Path_Layout <> '-' AND Path_Layout <> '' AND ISNULL(Path_Dwg_Source,'') = 'manual' AND ISNULL(Path_Layout_Source,'') = 'manual')
                OR (@SubTab = 'Completed' AND @Department IN ('QC','Gague') AND UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED' AND Path_IIQC IS NOT NULL AND Path_IIQC<>'--' AND Path_IIQC<>'')
                OR (@SubTab = 'Returned' AND Is_Return_OK = 1)
        ),
        PaginatedGroups AS (
            SELECT PseudoGroupId, GroupDate, GroupMaxId
            FROM FilteredLatest
            ORDER BY GroupDate DESC, GroupMaxId DESC
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
        ORDER BY GroupDate DESC, GroupMaxId DESC, Revision DESC;
    END

    -- ─── 4. Result Set 2: Counts (Based on #LatestItems without SubTab restriction)
    SELECT
        COUNT(*) AS TotalCount,
        SUM(CASE WHEN UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED' AND PlanDate >= @Today THEN 1 ELSE 0 END) AS UpcomingCount,
        SUM(CASE WHEN @Department = 'EN' AND UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED' AND NOT (Path_Dwg IS NOT NULL AND Path_Dwg <> '-' AND Path_Dwg <> '' AND Path_Layout IS NOT NULL AND Path_Layout <> '-' AND Path_Layout <> '' AND ISNULL(Path_Dwg_Source,'') = 'manual' AND ISNULL(Path_Layout_Source,'') = 'manual') THEN 1 ELSE 0 END
           + CASE WHEN @Department IN ('QC','Gague') AND UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED' AND (ISNULL(Path_IIQC,'-')='-' OR Path_IIQC='') THEN 1 ELSE 0 END
           + CASE WHEN @Department NOT IN ('EN','QC','Gague','PD') AND UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED' THEN 1 ELSE 0 END) AS RequiredCount,
        SUM(CASE WHEN @Department = 'EN' AND UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED' AND Path_Dwg IS NOT NULL AND Path_Dwg <> '-' AND Path_Dwg <> '' AND Path_Layout IS NOT NULL AND Path_Layout <> '-' AND Path_Layout <> '' AND ISNULL(Path_Dwg_Source,'') = 'manual' AND ISNULL(Path_Layout_Source,'') = 'manual' THEN 1 ELSE 0 END
           + CASE WHEN @Department IN ('QC','Gague') AND UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED' AND Path_IIQC IS NOT NULL AND Path_IIQC<>'--' AND Path_IIQC<>'' THEN 1 ELSE 0 END) AS CompletedCount,
        SUM(CASE WHEN Is_Return_OK = 1 THEN 1 ELSE 0 END) AS ReturnCount
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
