USE [db_Tooling]
GO

-- =============================================
-- SP: Stored_Export_PC_Plan_History
-- Purpose: Export PC Plan history filtered by TargetMonth and TargetYear
-- Uses View: [viewer].[View_tb_PC_Plan]
-- =============================================
CREATE OR ALTER PROCEDURE [trans].[Stored_Export_PC_Plan_History]
    @TargetMonth    INT,   -- 1-12
    @TargetYear     INT    -- e.g. 2025
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        Plan_ID,
        Division,
        CONVERT(NVARCHAR(10), PlanDate, 103) AS PlanDate,   -- DD/MM/YYYY
        Employee_ID,
        MC_Type,
        Bar_Type,
        Facility,
        Before_Part,
        Process,
        MC_No,
        PartNo,
        QTY,
        [Time],
        Comment,
        PlanStatus,
        GroupId,
        Revision,
        IsActive,
        Path_Dwg,
        Path_Layout,
        Path_IIQC,
        Unique_Id
    FROM [master].[tb_PC_Plan]
    WHERE
        DATEPART(MONTH, PlanDate) = @TargetMonth
        AND DATEPART(YEAR, PlanDate)  = @TargetYear
    ORDER BY PlanDate ASC, Division, MC_No;
END
GO
