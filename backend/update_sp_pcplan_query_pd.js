const { poolPromise, sql } = require('./src/config/database');

async function run() {
  try {
    const pool = await poolPromise;
    console.log('Updating trans.Stored_PCPlan_Query_PD with fixed fallback logic...');

    const spSql = `
CREATE OR ALTER PROCEDURE [trans].[Stored_PCPlan_Query_PD]
    @ShowHistory    BIT            = 0,
    @PageNumber     INT            = 1,
    @PageSize       INT            = 100,
    @SubTab         NVARCHAR(20)   = 'ALL',    -- 'Upcoming','Required','Completed','ALL','Return'
    @FilterDate     DATE           = NULL,
    @FilterMachine  NVARCHAR(MAX)  = NULL,
    @FilterFac      NVARCHAR(MAX)  = NULL,
    @FilterProcess  NVARCHAR(MAX)  = NULL,
    @FilterPartNo   NVARCHAR(MAX)  = NULL,
    @FilterDivision NVARCHAR(50)   = NULL,
    @FilterStatus   NVARCHAR(MAX)  = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Today     DATE = CAST(GETDATE() AS DATE);
    DECLARE @StartDate DATE = DATEADD(year, -2, @Today);
    DECLARE @EndDate   DATE = DATEADD(year,  2, @Today);
    DECLARE @Offset    INT  = (@PageNumber - 1) * @PageSize;

    IF OBJECT_ID('tempdb..#BasePlan') IS NOT NULL DROP TABLE #BasePlan;
    IF OBJECT_ID('tempdb..#LatestItems') IS NOT NULL DROP TABLE #LatestItems;

    ;WITH PartPaths AS (
        SELECT PartNo,
               MAX(CASE WHEN (Path_Dwg_Source IS NULL OR Path_Dwg_Source <> 'manual') AND Path_Dwg IS NOT NULL AND Path_Dwg <> '-' AND Path_Dwg <> '' THEN Path_Dwg END) AS Auto_Path_Dwg,
               MAX(CASE WHEN (Path_Layout_Source IS NULL OR Path_Layout_Source <> 'manual') AND Path_Layout IS NOT NULL AND Path_Layout <> '-' AND Path_Layout <> '' THEN Path_Layout END) AS Auto_Path_Layout,
               MAX(CASE WHEN Path_IIQC IS NOT NULL AND Path_IIQC <> '-' AND Path_IIQC <> '' THEN Path_IIQC END) AS Auto_Path_IIQC
        FROM [master].[tb_PC_Plan]
        WHERE PartNo IS NOT NULL AND PartNo <> ''
        GROUP BY PartNo
    ),
    ReqAgg AS (
        SELECT [Unique_Id],
            SUM(TotalItems) AS TotalItems,
            SUM(CompletedItems) AS CompletedItems,
            MAX(HasWaiting) AS HasWaiting,
            MAX([Status]) AS DominantStatus,
            CASE WHEN SUM(CompletedItems) > 0 THEN 1 ELSE 0 END AS HasAnyComplete
        FROM (
            SELECT [Unique_Id],
                COUNT(*) AS TotalItems,
                SUM(CASE WHEN UPPER([Status]) = 'COMPLETE' THEN 1 ELSE 0 END) AS CompletedItems,
                MAX(CASE WHEN UPPER([Status]) = 'WAITING'  THEN 1 ELSE 0 END) AS HasWaiting,
                MAX([Status]) AS [Status]
            FROM [dbo].[tb_IssueCuttingTool_Request_Document]
            WHERE [Unique_Id] IS NOT NULL GROUP BY [Unique_Id]
            UNION ALL
            SELECT [Unique_Id],
                COUNT(*) AS TotalItems,
                SUM(CASE WHEN UPPER([Status]) = 'COMPLETE' THEN 1 ELSE 0 END) AS CompletedItems,
                MAX(CASE WHEN UPPER([Status]) = 'WAITING'  THEN 1 ELSE 0 END) AS HasWaiting,
                MAX([Status]) AS [Status]
            FROM [dbo].[tb_IssueSetupTool_Request_Document]
            WHERE [Unique_Id] IS NOT NULL GROUP BY [Unique_Id]
        ) Combined
        GROUP BY [Unique_Id]
    )
    SELECT
        Main.*,
        PP.Auto_Path_Dwg,
        PP.Auto_Path_Layout,
        PP.Auto_Path_IIQC,
        CASE WHEN R.HasWaiting = 1 THEN 'Waiting'
             WHEN R.DominantStatus IS NOT NULL THEN R.DominantStatus
             ELSE NULL END AS ReqStatus,
        CASE WHEN R.TotalItems IS NULL THEN 0
             WHEN R.CompletedItems = R.TotalItems AND R.TotalItems > 0 THEN 1
             ELSE 0 END AS IsFullyCompleted,
        ISNULL(R.HasAnyComplete, 0) AS HasAnyComplete,
        CASE WHEN EXISTS (
            SELECT 1 FROM [master].[tb_Return_List] RL WHERE RL.[Unique_Id] = Main.[Unique_Id]
        ) OR ISNULL(Main.Is_Return_OK, 0) = 1 THEN 1 ELSE 0 END AS HasReturned,
        CASE WHEN Main.GroupId = '-'
            THEN CONCAT(CONVERT(VARCHAR, Main.PlanDate, 112), '|', ISNULL(Main.PartNo,''), '|', ISNULL(Main.MC_No,''), '|', ISNULL(Main.Process,''))
            ELSE Main.GroupId END AS PseudoGroupId
    INTO #BasePlan
    FROM [master].[tb_PC_Plan] Main
    LEFT JOIN PartPaths PP ON PP.[PartNo] = Main.[PartNo]
    LEFT JOIN ReqAgg R ON R.[Unique_Id] = Main.[Unique_Id]
    WHERE Main.IsActive = 1
      AND Main.PlanDate >= @StartDate AND Main.PlanDate < @EndDate;

    -- Apply fallback per PartNo ONLY if NULL or empty AND source is NOT manual AND not deleted ('-')
    UPDATE #BasePlan
    SET Path_Dwg = CASE 
            WHEN Path_Dwg_Source = 'manual' THEN ISNULL(Path_Dwg, '-')
            WHEN (Path_Dwg IS NULL OR Path_Dwg = '') AND (Path_Dwg_Source IS NULL OR Path_Dwg_Source <> 'manual') THEN ISNULL(Auto_Path_Dwg, '-')
            ELSE ISNULL(Path_Dwg, '-')
        END,
        Path_Layout = CASE 
            WHEN Path_Layout_Source = 'manual' THEN ISNULL(Path_Layout, '-')
            WHEN (Path_Layout IS NULL OR Path_Layout = '') AND (Path_Layout_Source IS NULL OR Path_Layout_Source <> 'manual') THEN ISNULL(Auto_Path_Layout, '-')
            ELSE ISNULL(Path_Layout, '-')
        END,
        Path_IIQC = CASE 
            WHEN (Path_IIQC IS NULL OR Path_IIQC = '') THEN ISNULL(Auto_Path_IIQC, '-')
            ELSE ISNULL(Path_IIQC, '-')
        END;

    ;WITH LatestRev AS (
        SELECT PseudoGroupId, MAX(Revision) AS MaxRev, MAX(PlanDate) AS GroupDate, MAX(Plan_ID) AS GroupMaxId
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
    LEFT JOIN PrintHistory PH ON PH.DocNo = B.GroupId
    WHERE (@FilterDate    IS NULL OR B.PlanDate  = @FilterDate)
      AND (@FilterMachine IS NULL OR B.MC_Type   = @FilterMachine)
      AND (@FilterFac     IS NULL OR B.Facility  = @FilterFac)
      AND (@FilterProcess IS NULL OR B.Process   = @FilterProcess)
      AND (@FilterPartNo  IS NULL OR B.PartNo    = @FilterPartNo)
      AND (@FilterDivision IS NULL OR B.Division = @FilterDivision)
      AND (@FilterStatus  IS NULL 
           OR (@FilterStatus = 'Wait Issue' AND B.ReqStatus = 'Waiting')
           OR (@FilterStatus = 'Issue Completed' AND B.ReqStatus = 'Complete')
           OR (@FilterStatus = 'Active' AND ISNULL(B.ReqStatus, ISNULL(B.PlanStatus, 'Active')) = 'Active')
           OR (@FilterStatus = 'Cancelled' AND UPPER(ISNULL(B.PlanStatus,'')) = 'CANCELLED')
           OR (@FilterStatus = 'Return' AND B.HasReturned = 1)
          );

    ;WITH FilteredLatest AS (
        SELECT *
        FROM #LatestItems
        WHERE 
            @SubTab = 'ALL'
            OR (@SubTab = 'Upcoming'  AND PlanDate >= @Today)
            OR (@SubTab = 'Required'  AND UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED' AND (ReqStatus IS NULL OR ReqStatus <> 'Complete'))
            OR (@SubTab = 'Completed' AND UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED' AND ReqStatus IS NOT NULL)
            OR (@SubTab = 'Return'    AND HasReturned = 1)
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

    SELECT
        COUNT(*) AS TotalCount,
        SUM(CASE WHEN UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED' AND PlanDate >= @Today THEN 1 ELSE 0 END) AS UpcomingCount,
        SUM(CASE WHEN UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED' AND (ReqStatus IS NULL OR ReqStatus <> 'Complete') THEN 1 ELSE 0 END) AS RequiredCount,
        SUM(CASE WHEN UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED' AND ReqStatus IS NOT NULL THEN 1 ELSE 0 END) AS CompletedCount,
        SUM(CASE WHEN HasReturned = 1 THEN 1 ELSE 0 END) AS ReturnCount
    FROM #LatestItems;

    DROP TABLE #BasePlan;
    DROP TABLE #LatestItems;
END
    `;

    await pool.request().query(spSql);
    console.log('✅ Successfully updated trans.Stored_PCPlan_Query_PD with fixed manual/deleted path fallback!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error updating SP PD:', err);
    process.exit(1);
  }
}

run();
