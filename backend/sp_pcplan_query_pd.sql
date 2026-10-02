
-- =============================================
-- Author:      Suttichai/Trainee
-- Create date: 2026-03-17
-- Description: ใช้สำหรับดึงข้อมูลแผนการผลิต (PC Plan) เพื่อนำไปแสดงผลบนเว็บไซต์ 
-- โดยกำหนดช่วงเวลาอัตโนมัติ (ตั้งแต่ต้นเดือนที่แล้ว จนถึงสิ้นปีหน้า) รองรับการแสดงผล 2 รูปแบบ 
-- คือแสดงเฉพาะแผนงานล่าสุด (Latest Version) หรือแสดงประวัติการแก้ไขทั้งหมด (History Log)
-- =============================================
CREATE PROCEDURE [trans].[Stored_PCPlan_Query_PD]
    @ShowHistory    BIT            = 0,
    @PageNumber     INT            = 1,
    @PageSize       INT            = 100,
    @SubTab         NVARCHAR(20)   = 'ALL',    -- 'Upcoming','Required','Completed','Return','ALL'
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

    DECLARE @StartDate DATE = DATEADD(month, DATEDIFF(month, 0, GETDATE()) - 1, 0);
    DECLARE @EndDate   DATE = DATEADD(year,  DATEDIFF(year,  0, GETDATE()) + 2, 0);
    DECLARE @Today     DATE = CAST(GETDATE() AS DATE);
    DECLARE @Offset    INT  = (@PageNumber - 1) * @PageSize;

    IF OBJECT_ID('tempdb..#BasePlan')    IS NOT NULL DROP TABLE #BasePlan;
    IF OBJECT_ID('tempdb..#LatestItems') IS NOT NULL DROP TABLE #LatestItems;

    -- ─── 1. ReqAgg CTE & Build #BasePlan ──────────────────────────────────────
    ;WITH PartPaths AS (
        SELECT PartNo,
               MAX(CASE WHEN Path_Dwg IS NOT NULL AND Path_Dwg <> '-' AND Path_Dwg <> '' THEN Path_Dwg END) AS Auto_Path_Dwg,
               MAX(CASE WHEN Path_Layout IS NOT NULL AND Path_Layout <> '-' AND Path_Layout <> '' THEN Path_Layout END) AS Auto_Path_Layout
        FROM [master].[tb_PC_Plan]
        WHERE PartNo IS NOT NULL AND PartNo <> ''
        GROUP BY PartNo
    ),
    ReqAgg AS (
        SELECT
            [Unique_Id],
            SUM(TotalItems)     AS TotalItems,
            SUM(CompletedItems) AS CompletedItems,
            MAX(HasWaiting)     AS HasWaiting,
            MAX([Status])       AS DominantStatus,
            -- NEW: 1 if at least ONE item is Complete (regardless of Waiting)
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
        CASE WHEN R.HasWaiting = 1 THEN 'Waiting'
             WHEN R.DominantStatus IS NOT NULL THEN R.DominantStatus
             ELSE NULL END AS ReqStatus,
        CASE WHEN R.TotalItems IS NULL THEN 0
             WHEN R.CompletedItems = R.TotalItems AND R.TotalItems > 0 THEN 1
             ELSE 0 END AS IsFullyCompleted,
        ISNULL(R.HasAnyComplete, 0) AS HasAnyComplete,  -- NEW column
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

    -- Apply fallback per PartNo for Path_Dwg & Path_Layout only
    UPDATE #BasePlan
    SET Path_Dwg = COALESCE(NULLIF(NULLIF(Path_Dwg, '-'), ''), Auto_Path_Dwg, '-'),
        Path_Layout = COALESCE(NULLIF(NULLIF(Path_Layout, '-'), ''), Auto_Path_Layout, '-');

    -- ─── 2. Latest Revision → #LatestItems ────────────────────────────────────
    ;WITH LatestRev AS (
        SELECT PseudoGroupId, MAX(Revision) AS MaxRev, MAX(PlanDate) AS GroupDate, MAX(Plan_ID) AS GroupMaxId
        FROM #BasePlan
        GROUP BY PseudoGroupId
    )
    SELECT B.*, LR.GroupDate, LR.GroupMaxId, LR.MaxRev
    INTO #LatestItems
    FROM #BasePlan B
    INNER JOIN LatestRev LR ON B.PseudoGroupId = LR.PseudoGroupId AND B.Revision = LR.MaxRev
    WHERE (@FilterDate    IS NULL OR B.PlanDate = @FilterDate)
      AND (@FilterMachine IS NULL OR B.MC_Type  IN (SELECT TRIM(value) FROM string_split(@FilterMachine, ',')))
      AND (@FilterFac     IS NULL OR B.Facility IN (SELECT TRIM(value) FROM string_split(@FilterFac, ',')))
      AND (@FilterProcess IS NULL OR B.Process  IN (SELECT TRIM(value) FROM string_split(@FilterProcess, ',')))
      AND (@FilterPartNo  IS NULL OR B.PartNo   IN (SELECT TRIM(value) FROM string_split(@FilterPartNo, ',')))
      AND (@FilterDivision IS NULL OR B.Division = @FilterDivision);

    -- ─── 3. SubTab Filters ────────────────────────────────────────────────────
    ;WITH FilteredLatest AS (
        SELECT * FROM #LatestItems
        WHERE
            (   @FilterStatus IS NULL
             OR (CASE
                    WHEN UPPER(ISNULL(PlanStatus,'')) = 'CANCELLED' THEN 'Cancelled'
                    WHEN ReqStatus IS NOT NULL THEN ReqStatus
                    ELSE PlanStatus
                 END) IN (SELECT TRIM(value) FROM string_split(@FilterStatus, ','))
            )
        AND (
            @SubTab = 'ALL'

            -- Upcoming: Active, future date, not yet requested
         OR (@SubTab = 'Upcoming'
             AND UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED'
             AND PlanDate >= @Today
             AND UPPER(ISNULL(ReqStatus,'')) NOT IN ('WAITING','COMPLETE','COMPLETED','IN PROGRESS'))

            -- Required: Active, no request yet
         OR (@SubTab = 'Required'
             AND UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED'
             AND (ReqStatus IS NULL OR ReqStatus = ''))

            -- Completed (active): has active request
         OR (@SubTab = 'Completed'
             AND UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED'
             AND UPPER(ISNULL(ReqStatus,'')) IN ('WAITING','COMPLETE','COMPLETED','IN PROGRESS'))

            -- Completed (cancelled): Waiting but NO complete items → stays in Completed
         OR (@SubTab = 'Completed'
             AND UPPER(ISNULL(PlanStatus,'')) = 'CANCELLED'
             AND UPPER(ISNULL(ReqStatus,'')) IN ('WAITING','IN PROGRESS')
             AND HasAnyComplete = 0)

            -- ★ FIXED Return: Cancelled + at least 1 Complete item → Return tab
         OR (@SubTab = 'Return'
             AND UPPER(ISNULL(PlanStatus,'')) = 'CANCELLED'
             AND HasAnyComplete = 1
             AND HasReturned = 0)
        )
    ),
    -- ─── 4. Paginate ──────────────────────────────────────────────────────────
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
    -- ─── Result Set 1: Paginated rows ─────────────────────────────────────────
    SELECT * FROM FinalResultSet
    ORDER BY GroupDate ASC, GroupMaxId DESC, Revision DESC;

    -- ─── Result Set 2: Tab Counts ─────────────────────────────────────────────
    SELECT
        COUNT(*) AS TotalCount,
        SUM(CASE WHEN UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED'
                  AND PlanDate >= @Today
                  AND UPPER(ISNULL(ReqStatus,'')) NOT IN ('WAITING','COMPLETE','COMPLETED','IN PROGRESS')
                 THEN 1 ELSE 0 END) AS UpcomingCount,
        SUM(CASE WHEN UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED'
                  AND (ReqStatus IS NULL OR ReqStatus = '')
                 THEN 1 ELSE 0 END) AS RequiredCount,
        SUM(CASE
                -- Active plans with any request
                WHEN UPPER(ISNULL(PlanStatus,'')) <> 'CANCELLED'
                 AND UPPER(ISNULL(ReqStatus,'')) IN ('WAITING','COMPLETE','COMPLETED','IN PROGRESS')
                THEN 1
                -- Cancelled + Waiting only (no complete items)
                WHEN UPPER(ISNULL(PlanStatus,'')) = 'CANCELLED'
                 AND UPPER(ISNULL(ReqStatus,'')) IN ('WAITING','IN PROGRESS')
                 AND HasAnyComplete = 0
                THEN 1
                ELSE 0
            END) AS CompletedCount,
        -- FIXED: Cancelled + at least 1 Complete + not yet returned
        SUM(CASE WHEN UPPER(ISNULL(PlanStatus,'')) = 'CANCELLED'
                  AND HasAnyComplete = 1
                  AND HasReturned = 0
                 THEN 1 ELSE 0 END) AS ReturnCount
    FROM #LatestItems;

    DROP TABLE #BasePlan;
    DROP TABLE #LatestItems;
END
