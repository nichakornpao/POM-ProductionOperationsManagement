USE [db_Tooling];
GO

IF OBJECT_ID('[trans].[Stored_PCPlan_Update]', 'P') IS NOT NULL
    DROP PROCEDURE [trans].[Stored_PCPlan_Update];
GO

-- =============================================
-- Stored Procedure: Update an existing PC Plan row IN-PLACE
-- Instead of creating a new revision row, this updates the existing record.
-- =============================================
CREATE PROCEDURE [trans].[Stored_PCPlan_Update]
    @Plan_ID       INT,
    @PlanDate      DATE,
    @Division      NVARCHAR(50),
    @MC_Type       NVARCHAR(50),
    @Facility      NVARCHAR(50),
    @Before_Part   NVARCHAR(100),
    @Process       NVARCHAR(50),
    @MC_No         NVARCHAR(50),
    @PartNo        NVARCHAR(100),
    @QTY           INT,
    @Time          INT,
    @Comment       NVARCHAR(MAX),
    @Path_Dwg      NVARCHAR(500) = NULL,
    @Path_Layout   NVARCHAR(500) = NULL,
    @Path_IIQC     NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE [trans].[tb_PC_Plan]
    SET
        [PlanDate]     = @PlanDate,
        [Division]     = @Division,
        [MC_Type]      = @MC_Type,
        [Facility]     = @Facility,
        [Before_Part]  = @Before_Part,
        [Process]      = @Process,
        [MC_No]        = @MC_No,
        [PartNo]       = @PartNo,
        [QTY]          = @QTY,
        [Time]         = @Time,
        [Comment]      = @Comment,
        [Path_Dwg]     = @Path_Dwg,
        [Path_Layout]  = @Path_Layout,
        [Path_IIQC]    = @Path_IIQC
    WHERE [Plan_ID] = @Plan_ID;

    SELECT @@ROWCOUNT AS AffectedRows;
END;
GO
