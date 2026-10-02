USE [db_Tooling]
GO

-- =============================================
-- Author:      Suttichai/Trainee
-- Create Date: 2026-03-10
-- Description: Update Status_To_PH on both request document tables
--              when PC cancels ('Cancelled') or edits key fields ('PC Edit') a plan.
--              Will NOT override if Status_To_PH is already 'Complete'.
-- =============================================
CREATE OR ALTER PROCEDURE [trans].[Stored_UpdateStatusToPH]
    @Unique_Id         NVARCHAR(100),  -- Raw UUID from tb_PCPlan.Unique_Id
    @NewStatus         NVARCHAR(50),   -- 'Cancelled' or 'PC Edit'
    @NewAfterDueDate   DATE = NULL     -- Optional: New Due Date derived from Plan Date
AS
BEGIN
    SET NOCOUNT ON;

    -- Safety: Only update if Unique_Id is provided
    IF @Unique_Id IS NULL OR LEN(LTRIM(RTRIM(@Unique_Id))) = 0
    BEGIN
        RAISERROR('Unique_Id is required.', 16, 1);
        RETURN;
    END

    -- Convert to UNIQUEIDENTIFIER for matching
    DECLARE @UniqueIdGuid UNIQUEIDENTIFIER;
    BEGIN TRY
        SET @UniqueIdGuid = CAST(@Unique_Id AS UNIQUEIDENTIFIER);
    END TRY
    BEGIN CATCH
        RAISERROR('Invalid Unique_Id format. Must be a valid GUID.', 16, 1);
        RETURN;
    END CATCH

    BEGIN TRANSACTION;
    BEGIN TRY

        -- ─────────────────────────────────────────────────────────────────────
        -- Table 1: tb_IssueCuttingTool_Request_Document
        -- ─────────────────────────────────────────────────────────────────────
        UPDATE [dbo].[tb_IssueCuttingTool_Request_Document]
        SET
            [Status_To_PH]   = @NewStatus,
            [Date_Status_PH]  = CAST(GETDATE() AS DATE),
            [After_DueDate]  = ISNULL(@NewAfterDueDate, [After_DueDate]) -- Update only if provided
        WHERE
            [Unique_Id] = @UniqueIdGuid
            AND ISNULL([Status_To_PH], '') <> 'Complete'; -- Never override Complete

        -- ─────────────────────────────────────────────────────────────────────
        -- Table 2: tb_IssueSetupTool_Request_Document
        -- ─────────────────────────────────────────────────────────────────────
        UPDATE [dbo].[tb_IssueSetupTool_Request_Document]
        SET
            [Status_To_PH]   = @NewStatus,
            [Date_Status_PH]  = CAST(GETDATE() AS DATE),
            [After_DueDate]  = ISNULL(@NewAfterDueDate, [After_DueDate]) -- Update only if provided
        WHERE
            [Unique_Id] = @UniqueIdGuid
            AND ISNULL([Status_To_PH], '') <> 'Complete'; -- Never override Complete

        COMMIT TRANSACTION;

    END TRY
    BEGIN CATCH
        ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END
GO
