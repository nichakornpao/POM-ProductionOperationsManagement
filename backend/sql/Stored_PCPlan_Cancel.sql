USE [db_Tooling];
GO

IF OBJECT_ID('[trans].[Stored_PCPlan_Cancel]', 'P') IS NOT NULL
    DROP PROCEDURE [trans].[Stored_PCPlan_Cancel];
GO

-- =============================================
-- Stored Procedure: Cancel an existing PC Plan IN-PLACE
-- Sets PlanStatus to 'Cancelled' without creating a new row.
-- =============================================
CREATE PROCEDURE [trans].[Stored_PCPlan_Cancel]
    @Plan_ID INT
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE [trans].[tb_PC_Plan]
    SET [PlanStatus] = 'Cancelled'
    WHERE [Plan_ID] = @Plan_ID;

    SELECT @@ROWCOUNT AS AffectedRows;
END;
GO
