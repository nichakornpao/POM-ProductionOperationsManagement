USE [db_Tooling]
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- =============================================
-- Author:      System
-- Create date: 2026-02-12
-- Description: Soft Delete PC Plan by GroupId (All Revisions)
-- =============================================
CREATE OR ALTER PROCEDURE [trans].[Stored_PCPlan_Delete_Group]
    @GroupId NVARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;

    -- Hard Delete: Remove rows permanently
    DELETE FROM [master].[tb_PC_Plan]
    WHERE [GroupId] = @GroupId;

    -- Return number of affected rows
    SELECT @@ROWCOUNT as DeletedCount;
END
GO
