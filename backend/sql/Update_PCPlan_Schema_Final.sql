-- update_pcplan_schema_final.sql
use [db_Tooling]
GO

-- 1. Add PlanStatus Column (if missing)
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[master].[tb_PC_Plan]') AND name = 'PlanStatus')
BEGIN
    ALTER TABLE [master].[tb_PC_Plan] ADD [PlanStatus] NVARCHAR(20) DEFAULT 'Active';
END
GO
UPDATE [master].[tb_PC_Plan] SET PlanStatus = 'Active' WHERE PlanStatus IS NULL;
GO

-- 2. Backfill GroupId for existing records (Critical for history tracking)
UPDATE [master].[tb_PC_Plan] 
SET GroupId = NEWID() 
WHERE GroupId IS NULL;
GO

-- =============================================
-- SP: Unified Fresh Insert for Excel/Bulk Import
-- Logic: ALWAYS perform a fresh INSERT with Revision 0 and a new GroupId.
-- No fuzzy matching or upsert.
-- =============================================
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[trans].[Stored_PCPlan_Insert_GM]') AND type in (N'P', N'PC'))
    DROP PROCEDURE [trans].[Stored_PCPlan_Insert_GM];
GO

IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[trans].[Stored_PCPlan_Insert_PMC_Snapshot]') AND type in (N'P', N'PC'))
    DROP PROCEDURE [trans].[Stored_PCPlan_Insert_PMC_Snapshot];
GO

CREATE OR ALTER PROCEDURE [trans].[Stored_PCPlan_Insert_All_Snapshot_Excel]
    @JsonData NVARCHAR(MAX),  -- Input List as JSON
    @Division NVARCHAR(50),
    @TargetDate DATE          -- Reference date (Month/Year)
AS
BEGIN
    SET NOCOUNT ON;
    
    -- 1. Parse JSON into Temp Table
    SELECT * INTO #IncomingData
    FROM OPENJSON(@JsonData)
    WITH (
        PlanDate DATE,
        Employee_ID NVARCHAR(50),
        MC_Type NVARCHAR(50),
        Bar_Type NVARCHAR(100),
        Facility NVARCHAR(50),
        Before_Part NVARCHAR(50),
        Process NVARCHAR(50),
        MC_No NVARCHAR(50),
        PartNo NVARCHAR(50),
        QTY FLOAT,
        [Time] INT,
        Comment NVARCHAR(255),
        PlanStatus NVARCHAR(20),
        GroupId NVARCHAR(50),
        Revision INT,             
        Path_Dwg NVARCHAR(255),    
        Path_Layout NVARCHAR(255), 
        Path_IIQC NVARCHAR(255),
        Unique_Id NVARCHAR(100)
    );

    -- 2. Handle Buddhist Era Year (BE -> AD) conversion
    IF YEAR(@TargetDate) > 2400 SET @TargetDate = DATEADD(YEAR, -543, @TargetDate);

    UPDATE #IncomingData 
    SET PlanDate = DATEADD(YEAR, -543, PlanDate) 
    WHERE YEAR(PlanDate) > 2400;

    -- 2.5 Invalidate older revisions for updated/cancelled items
    UPDATE [master].[tb_PC_Plan]
    SET IsActive = 0
    WHERE GroupId IN (
        SELECT GroupId FROM #IncomingData 
        WHERE ISNULL(Revision, 0) > 0 AND GroupId IS NOT NULL AND GroupId != '' AND GroupId != '-'
    )
    AND IsActive = 1;

    -- 3. INSERT NEW REVISIONS AND NEW ITEMS
    -- New items get a fresh GroupId and Revision 0.
    -- Edits/Cancellations get the existing GroupId and Revision N+1.
    
    INSERT INTO [master].[tb_PC_Plan] (
        PlanDate, Employee_ID, Division, MC_Type, Bar_Type, Facility, 
        Before_Part, Process, MC_No, PartNo, QTY, [Time], 
        Comment, Revision, GroupId, IsActive, PlanStatus,
        Path_Dwg, Path_Layout, Path_IIQC, Unique_Id
    )
    SELECT 
        New.PlanDate, New.Employee_ID, @Division, New.MC_Type, New.Bar_Type, New.Facility, 
        New.Before_Part, New.Process, New.MC_No, New.PartNo, New.QTY, New.[Time], 
        New.Comment, 
        ISNULL(New.Revision, 0),    -- Use Revision from payload (0 for bulk import, N+1 for edit/cancel)
        CASE 
            WHEN New.GroupId IS NULL OR New.GroupId = '' OR New.GroupId = '-' 
            THEN CONVERT(NVARCHAR(50), NEWID())  -- Fresh GroupId for new/bulk items
            ELSE New.GroupId                      -- Preserve existing GroupId for edit/cancel revisions
        END,
        1,                                       -- IsActive
        ISNULL(New.PlanStatus, 'Active'),         -- Use PlanStatus from payload (e.g. 'Cancelled'), default 'Active'
        New.Path_Dwg, New.Path_Layout, New.Path_IIQC,
        TRY_CAST(New.Unique_Id AS UNIQUEIDENTIFIER) -- Save the ID
    FROM #IncomingData New;

    -- Cleanup
    DROP TABLE #IncomingData;
END
GO

-- 3. Update Query SP to filter by Latest Revision per GroupId OR Show All
CREATE OR ALTER PROCEDURE [trans].[Stored_PCPlan_Query]
    @ShowHistory BIT = 0
AS
BEGIN
    SET NOCOUNT ON;

    -- Define Date Range: Beginning of Last Month to End of Next Year
    DECLARE @StartDate DATE = DATEADD(month, DATEDIFF(month, 0, GETDATE()) - 1, 0); 
    DECLARE @EndDate DATE = DATEADD(year, DATEDIFF(year, 0, GETDATE()) + 2, 0); 

    IF @ShowHistory = 1
    BEGIN
        -- Show ALL records (Active + History) within range
        SELECT *
        FROM [master].[tb_PC_Plan]
        WHERE IsActive = 1
          AND PlanDate >= @StartDate AND PlanDate < @EndDate
        -- Order by Date ASC (Soonest first), then Group items together, then Latest Rev first
        ORDER BY PlanDate ASC, GroupId, Revision DESC;
    END
    ELSE
    BEGIN
        -- Show LATEST only within range
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

-- 4. Get History by GroupId
CREATE OR ALTER PROCEDURE [trans].[Stored_PCPlan_GetHistory]
    @GroupId NVARCHAR(50)
AS
BEGIN
    SELECT *
    FROM [master].[tb_PC_Plan]
    WHERE GroupId = @GroupId
    ORDER BY Revision DESC;
END
GO

-- 5. Update Paths ONLY (No Revision Increase)
CREATE OR ALTER PROCEDURE [trans].[Stored_PCPlan_Update_Paths]
    @GroupId NVARCHAR(50),
    @Path_Dwg NVARCHAR(255) = NULL,
    @Path_Layout NVARCHAR(255) = NULL,
    @Path_IIQC NVARCHAR(255) = NULL
AS
BEGIN
    -- Update the LATEST revision for this GroupId
    UPDATE [master].[tb_PC_Plan]
    SET Path_Dwg = @Path_Dwg,
        Path_Layout = @Path_Layout,
        Path_IIQC = @Path_IIQC
    WHERE GroupId = @GroupId 
      AND IsActive = 1
      AND Revision = (
          SELECT MAX(Revision) 
          FROM [master].[tb_PC_Plan] 
          WHERE GroupId = @GroupId AND IsActive = 1
      );
END
GO
