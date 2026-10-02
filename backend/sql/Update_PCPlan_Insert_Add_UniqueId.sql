-- ==========================================================
-- Update Stored Procedure: Stored_PCPlan_Insert_All_Snapshot_Excel
-- Purpose: Add Unique_Id (uniqueidentifier) support so that the
--          ID generated at Excel download time is persisted into
--          [master].[tb_PC_Plan].
-- Column type: [Unique_Id] [uniqueidentifier] NULL (already exists)
-- Note: Frontend sends the raw UUID string (strips "PLAN-" prefix
--       before calling API). SQL casts NVARCHAR -> uniqueidentifier.
-- ==========================================================
USE [db_Tooling]
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
        PlanDate        DATE,
        Employee_ID     NVARCHAR(50),
        MC_Type         NVARCHAR(50),
        Facility        NVARCHAR(50),
        Before_Part     NVARCHAR(50),
        Process         NVARCHAR(50),
        MC_No           NVARCHAR(50),
        PartNo          NVARCHAR(50),
        Bar_Type        NVARCHAR(50),
        QTY             FLOAT,
        [Time]          INT,
        Comment         NVARCHAR(255),
        PlanStatus      NVARCHAR(20),
        GroupId         NVARCHAR(50),
        Revision        INT,             
        Path_Dwg        NVARCHAR(255),    
        Path_Layout     NVARCHAR(255), 
        Path_IIQC       NVARCHAR(255),
        Unique_Id       NVARCHAR(36)    -- Raw UUID string, e.g. "550e8400-e29b-41d4-a716-446655440000"
    );

    -- 2. Handle Buddhist Era Year (BE -> AD) conversion
    IF YEAR(@TargetDate) > 2400 SET @TargetDate = DATEADD(YEAR, -543, @TargetDate);

    UPDATE #IncomingData 
    SET PlanDate = DATEADD(YEAR, -543, PlanDate) 
    WHERE YEAR(PlanDate) > 2400;

    -- 3. FRESH INSERT ONLY
    -- Every record imported from Excel will get a NEW GroupId and Revision 0
    -- This ensures no overwriting of existing plans.
    
    INSERT INTO [master].[tb_PC_Plan] (
        PlanDate, Employee_ID, Division, MC_Type, Facility, 
        Before_Part, Process, MC_No, PartNo, Bar_Type, QTY, [Time], 
        Comment, Revision, GroupId, IsActive, PlanStatus,
        Path_Dwg, Path_Layout, Path_IIQC, Unique_Id
    )
    SELECT 
        New.PlanDate, New.Employee_ID, @Division, New.MC_Type, New.Facility, 
        New.Before_Part, New.Process, New.MC_No, New.PartNo, New.Bar_Type,
        New.QTY, New.[Time], 
        New.Comment, 
        ISNULL(New.Revision, 0),    -- Use Revision from payload (0 for bulk import, N+1 for edit/cancel)
        CASE 
            WHEN New.GroupId IS NULL OR New.GroupId = '' OR New.GroupId = '-' 
            THEN CONVERT(NVARCHAR(50), NEWID())  -- Fresh GroupId for new/bulk items
            ELSE New.GroupId                      -- Preserve existing GroupId for edit/cancel revisions
        END,
        1,                                       -- IsActive
        ISNULL(New.PlanStatus, 'Active'),         -- Use PlanStatus from payload, default 'Active'
        New.Path_Dwg, New.Path_Layout, New.Path_IIQC,
        -- Store Unique_Id: cast NVARCHAR to uniqueidentifier (NULL if blank/invalid)
        TRY_CAST(
            CASE 
                WHEN New.Unique_Id IS NULL OR LTRIM(RTRIM(New.Unique_Id)) = '' THEN NULL
                ELSE New.Unique_Id
            END
        AS UNIQUEIDENTIFIER)
    FROM #IncomingData New;

    -- Cleanup
    DROP TABLE #IncomingData;
END
GO
