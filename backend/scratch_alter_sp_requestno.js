const { poolPromise, sql } = require('./src/config/database');

async function run() {
  try {
    const pool = await poolPromise;
    console.log('Altering SP to add RequestNo logic...');
    
    await pool.request().query(`
CREATE OR ALTER PROCEDURE [trans].[Stored_PCPlan_Insert_All_Snapshot_Excel]
    @JsonData    NVARCHAR(MAX),  -- Input List as JSON
    @Division    NVARCHAR(50),
    @TargetDate  DATE            -- Reference date (Month/Year)
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
        Unique_Id       NVARCHAR(36)
    );

    -- 2. Handle Buddhist Era Year (BE → AD)
    IF YEAR(@TargetDate) > 2400 SET @TargetDate = DATEADD(YEAR, -543, @TargetDate);
    UPDATE #IncomingData SET PlanDate = DATEADD(YEAR, -543, PlanDate) WHERE YEAR(PlanDate) > 2400;

    -- 3. Add computed column: Cast Unique_Id → UNIQUEIDENTIFIER
    ALTER TABLE #IncomingData ADD Unique_Id_Cast UNIQUEIDENTIFIER NULL;
    UPDATE #IncomingData
    SET Unique_Id_Cast = TRY_CAST(
        CASE WHEN LTRIM(RTRIM(ISNULL(Unique_Id, ''))) = '' THEN NULL ELSE Unique_Id END
    AS UNIQUEIDENTIFIER);

    -- =============================================
    -- 4. UPSERT: UPDATE rows where Unique_Id already exists in DB
    -- =============================================
    UPDATE existing
    SET
        existing.PlanDate    = new.PlanDate,
        existing.Employee_ID = new.Employee_ID,
        existing.Division    = @Division,
        existing.MC_Type     = new.MC_Type,
        existing.Facility    = new.Facility,
        existing.Before_Part = new.Before_Part,
        existing.Process     = new.Process,
        existing.MC_No       = new.MC_No,
        existing.PartNo      = new.PartNo,
        existing.Bar_Type    = new.Bar_Type,
        existing.QTY         = new.QTY,
        existing.[Time]      = new.[Time],
        existing.Comment     = new.Comment,
        existing.PlanStatus  = CASE 
                                   WHEN new.PlanStatus = 'Cancelled' THEN 'Cancelled'
                                   WHEN existing.PlanStatus = 'Cancelled' THEN 'Cancelled'
                                   ELSE ISNULL(new.PlanStatus, 'Active')
                               END
    FROM [master].[tb_PC_Plan] existing
    INNER JOIN #IncomingData new
        ON existing.Unique_Id = new.Unique_Id_Cast
    WHERE existing.IsActive = 1
      AND new.Unique_Id_Cast IS NOT NULL
      AND ISNULL(new.Revision, 0) = 0; -- Only UPSERT if it's an Excel Import (Revision = 0)

    -- =============================================
    -- 5. INSERT rows where Unique_Id does NOT exist in DB (or is NULL) OR it's a new Revision
    -- =============================================
    INSERT INTO [master].[tb_PC_Plan] (
        PlanDate, Employee_ID, Division, MC_Type, Facility,
        Before_Part, Process, MC_No, PartNo, Bar_Type, QTY, [Time],
        Comment, Revision, GroupId, IsActive, PlanStatus,
        Path_Dwg, Path_Layout, Path_IIQC, Unique_Id
    )
    SELECT
        new.PlanDate, new.Employee_ID, @Division, new.MC_Type, new.Facility,
        new.Before_Part, new.Process, new.MC_No, new.PartNo, new.Bar_Type,
        new.QTY, new.[Time],
        new.Comment,
        ISNULL(new.Revision, 0),
        CASE
            WHEN new.GroupId IS NULL OR new.GroupId = '' OR new.GroupId = '-'
            THEN CONVERT(NVARCHAR(50), NEWID()) 
            ELSE new.GroupId
        END,
        1,                                         -- IsActive
        ISNULL(new.PlanStatus, 'Active'),
        new.Path_Dwg, new.Path_Layout, new.Path_IIQC,
        ISNULL(new.Unique_Id_Cast, NEWID())        -- AUTO-FILL UNIQUE ID IF MISSING!
    FROM #IncomingData new
    WHERE
        ISNULL(new.Revision, 0) > 0 -- ALWAYS insert if it's an explicit Revision edit/cancel
        OR new.Unique_Id_Cast IS NULL -- ALWAYS insert if there is no Unique_Id
        OR NOT EXISTS (
            SELECT 1
            FROM [master].[tb_PC_Plan] existing
            WHERE existing.Unique_Id = new.Unique_Id_Cast
              AND existing.IsActive = 1
        );

    -- =============================================
    -- 6. UPDATE RequestNo for newly inserted records
    -- =============================================
    UPDATE [master].[tb_PC_Plan]
    SET RequestNo = 'PLAN-' + CAST(Plan_ID AS VARCHAR)
    WHERE RequestNo IS NULL;

    -- Cleanup
    DROP TABLE #IncomingData;
END
    `);
    
    console.log('SP updated successfully!');
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}
run();
