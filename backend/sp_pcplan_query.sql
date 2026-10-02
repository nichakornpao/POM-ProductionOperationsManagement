
  ALTER PROCEDURE [trans].[Stored_PCPlan_Query]
      @Department NVARCHAR(10) = 'PC',
      @PageNumber INT = 1,
      @PageSize INT = 100,
      @SubTab NVARCHAR(20) = 'ALL',
      @ShowHistory BIT = 0,
      @FilterDate DATE = NULL,
      @FilterMachine NVARCHAR(MAX) = NULL,
      @FilterFac NVARCHAR(MAX) = NULL,
      @FilterProcess NVARCHAR(MAX) = NULL,
      @FilterPartNo NVARCHAR(MAX) = NULL,
      @FilterDivision NVARCHAR(50) = NULL,
      @FilterStatus NVARCHAR(50) = NULL,
      @SortDir NVARCHAR(4) = 'DESC'
  AS
  BEGIN
      SET NOCOUNT ON;
      DECLARE @Offset INT = (@PageNumber - 1) * @PageSize;
      DECLARE @Today DATE = CAST(GETDATE() AS DATE);
      DECLARE @StartDate DATE = DATEADD(YEAR, -2, @Today);
      DECLARE @EndDate DATE = DATEADD(YEAR, 2, @Today);

      -- ─── 1. Build Base Plan Data ─────────────────────────────────────────────
      ;WITH PartPaths AS (
          SELECT PartNo,
                 MAX(CASE WHEN Path_Dwg IS NOT NULL AND Path_Dwg <> '-' AND Path_Dwg <> '' THEN Path_Dwg END) AS Auto_Path_Dwg,
                 MAX(CASE WHEN Path_Layout IS NOT NULL AND Path_Layout <> '-' AND Path_Layout <> '' THEN Path_Layout END) AS Auto_Path_Layout
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
              SELECT [Unique_Id], [Status], [Status_To_PH] FROM [dbo].[tb_IssueCuttingTool_Request_Document] WHERE [Unique_Id] IS NOT NULL
              UNION ALL
              SELECT [Unique_Id], [Status], [Status_To_PH] FROM [dbo].[tb_IssueSetupTool_Request_Document]   WHERE [Unique_Id] IS NOT NULL
          ) Combined
          GROUP BY [Unique_Id]
      )
      SELECT Main.*,
             PP.Auto_Path_Dwg,
             PP.Auto_Path_Layout,
             ISNULL(RS.ReqStatus, NULL) AS ReqStatus, ISNULL(RS.Status_To_PH, NULL) AS Status_To_PH,
             CASE WHEN Main.GroupId = '-' THEN CONCAT(CONVERT(VARCHAR, Main.PlanDate, 112), '|', ISNULL(Main.PartNo,''), '|', ISNULL(Main.MC_No,''), '|', ISNULL(Main.Process,'')) ELSE Main.GroupId END AS PseudoGroupId
      INTO #BasePlan
      FROM [master].[tb_PC_Plan] Main
      LEFT JOIN PartPaths PP ON PP.[PartNo] = Main.[PartNo]
      LEFT JOIN ReqStatus RS ON RS.[Unique_Id] = Main.[Unique_Id]
      WHERE Main.IsActive = 1
        AND (
            @Department = 'EN' 
            OR @FilterDate IS NOT NULL 
            OR (Main.PlanDate >= @StartDate AND Main.PlanDate < @EndDate)
        );

      -- Apply fallback per PartNo for Path_Dwg & Path_Layout only
      UPDATE #BasePlan
      SET Path_Dwg = COALESCE(NULLIF(NULLIF(Path_Dwg, '-'), ''), Auto_Path_Dwg, '-'),
          Path_Layout = COALESCE(NULLIF(NULLIF(Path_Layout, '-'), ''), Auto_Path_Layout, '-');

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
        AND (@FilterDivision IS NULL OR B.Division = @FilterDivision)
        AND (@FilterStatus IS NULL 
             OR (@FilterStatus = 'Wait Issue' AND B.ReqStatus = 'Waiting')
             OR (@FilterStatus = 'Issue Completed' AND B.ReqStatus = 'Complete')
             OR (@FilterStatus = 'Active' AND ISNULL(B.ReqStatus, ISNULL(B.PlanStatus, 'Active')) = 'Active')
             OR (@FilterStatus = 'Cancelled' AND UPPER(ISNULL(B.PlanStatus,'')) = 'CANCELLED')
             OR (@FilterStatus = 'Return' AND B.Is_Return_OK = 1)
            );

      -- ─── 3. Result Set 1: Paginated data ─────────────────────────────────────
      IF @SortDir = 'DESC'
      BEGIN
          ;WITH FilteredLatest AS (
              SELECT *
              FROM #LatestItems
              WHERE 
                  @SubTab = 'ALL' 
                  OR (@SubTab = 'Upcoming' AND PlanDate >= @Today)
                  OR (@SubTab = 'Required' AND @Department = 'EN' AND UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED' AND (ISNULL(Path_Dwg,'-')='-' OR Path_Dwg='' OR ISNULL(Path_Layout,'-')='-' OR Path_Layout=''))
                  OR (@SubTab = 'Required' AND @Department IN ('QC','Gague') AND UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED' AND Path_Dwg IS NOT NULL AND Path_Dwg<>'-' AND Path_Dwg<>'' AND Path_Layout IS NOT NULL AND Path_Layout<>'-' AND Path_Layout<>'' AND (ISNULL(Path_IIQC,'-')='-' OR Path_IIQC=''))
                  OR (@SubTab = 'Required' AND @Department NOT IN ('EN','QC','Gague','PD') AND UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED')
                  OR (@SubTab = 'Completed' AND @Department = 'EN' AND UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED' AND Path_Dwg IS NOT NULL AND Path_Dwg<>'-' AND Path_Dwg<>'' AND Path_Layout IS NOT NULL AND Path_Layout<>'')
                  OR (@SubTab = 'Completed' AND @Department IN ('QC','Gague') AND UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED' AND Path_IIQC IS NOT NULL AND Path_IIQC<>'-' AND Path_IIQC<>'')
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
      ELSE
      BEGIN
          ;WITH FilteredLatest AS (
              SELECT *
              FROM #LatestItems
              WHERE 
                  @SubTab = 'ALL' 
                  OR (@SubTab = 'Upcoming' AND PlanDate >= @Today)
                  OR (@SubTab = 'Required' AND @Department = 'EN' AND UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED' AND (ISNULL(Path_Dwg,'-')='-' OR Path_Dwg='' OR ISNULL(Path_Layout,'-')='-' OR Path_Layout=''))
                  OR (@SubTab = 'Required' AND @Department IN ('QC','Gague') AND UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED' AND Path_Dwg IS NOT NULL AND Path_Dwg<>'-' AND Path_Dwg<>'' AND Path_Layout IS NOT NULL AND Path_Layout<>'-' AND Path_Layout<>'' AND (ISNULL(Path_IIQC,'-')='-' OR Path_IIQC=''))
                  OR (@SubTab = 'Required' AND @Department NOT IN ('EN','QC','Gague','PD') AND UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED')
                  OR (@SubTab = 'Completed' AND @Department = 'EN' AND UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED' AND Path_Dwg IS NOT NULL AND Path_Dwg<>'-' AND Path_Dwg<>'' AND Path_Layout IS NOT NULL AND Path_Layout<>'')
                  OR (@SubTab = 'Completed' AND @Department IN ('QC','Gague') AND UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED' AND Path_IIQC IS NOT NULL AND Path_IIQC<>'-' AND Path_IIQC<>'')
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

      -- ─── 4. Result Set 2: Counts (Based on #LatestItems without SubTab restriction)
      SELECT
          COUNT(*) AS TotalCount,
          SUM(CASE WHEN UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED' AND PlanDate >= @Today THEN 1 ELSE 0 END) AS UpcomingCount,
          SUM(CASE WHEN @Department = 'EN' AND UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED' AND (ISNULL(Path_Dwg,'-')='-' OR Path_Dwg='' OR ISNULL(Path_Layout,'-')='-' OR Path_Layout='') THEN 1 ELSE 0 END
             + CASE WHEN @Department IN ('QC','Gague') AND UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED' AND Path_Dwg IS NOT NULL AND Path_Dwg<>'-' AND Path_Dwg<>'' AND Path_Layout IS NOT NULL AND Path_Layout<>'-' AND Path_Layout<>'' AND (ISNULL(Path_IIQC,'-')='-' OR Path_IIQC='') THEN 1 ELSE 0 END
             + CASE WHEN @Department NOT IN ('EN','QC','Gague','PD') AND UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED' THEN 1 ELSE 0 END) AS RequiredCount,
          SUM(CASE WHEN @Department = 'EN' AND UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED' AND Path_Dwg IS NOT NULL AND Path_Dwg<>'-' AND Path_Dwg<>'' AND Path_Layout IS NOT NULL AND Path_Layout<>'-' AND Path_Layout<>'' THEN 1 ELSE 0 END
             + CASE WHEN @Department IN ('QC','Gague') AND UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED' AND Path_IIQC IS NOT NULL AND Path_IIQC<>'-' AND Path_IIQC<>'' THEN 1 ELSE 0 END) AS CompletedCount,
          SUM(CASE WHEN Is_Return_OK = 1 THEN 1 ELSE 0 END) AS ReturnCount
      FROM #LatestItems;

      -- Cleanup
      DROP TABLE #BasePlan;
      DROP TABLE #LatestItems;
  END
  