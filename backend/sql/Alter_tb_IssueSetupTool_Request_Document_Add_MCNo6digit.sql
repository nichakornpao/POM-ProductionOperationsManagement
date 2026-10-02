-- =============================================
-- Author:       Aon(Trainee)
-- Create date:  2026-05-29
-- Update date:  2026-06-04 (Updated to use tb_Machine_Model)
-- Description:  Add MCNo6Digit column to tb_IssueSetupTool_Request_Document
--               followed by purchase request wanting 6 digit (MCTYPE Code (3 Digit) + M/C NO. (3 Digit))
--               using for cutting MC/NO in AS400 6 digit
-- =============================================
USE [db_Tooling]
GO

SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

-- Add MCNo6Digit column if it doesn't exist
IF NOT EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID('[dbo].[tb_IssueSetupTool_Request_Document]')
      AND name = 'MCNo6Digit'
)
BEGIN
    ALTER TABLE [dbo].[tb_IssueSetupTool_Request_Document]
    ADD [MCNo6Digit] VARCHAR(6) NULL;
END
GO

-- Update existing records by joining with [dbo].[tb_Machine_Model] (Case-Insensitive using UPPER)
UPDATE req
SET req.[MCNo6Digit] = CAST(ISNULL(LTRIM(RTRIM(mac.[MC_Code])), '') + ISNULL(LTRIM(RTRIM(req.[MCNo])), '') AS VARCHAR(6))
FROM [dbo].[tb_IssueSetupTool_Request_Document] req
INNER JOIN [dbo].[tb_Machine_Model] mac
    ON UPPER(LTRIM(RTRIM(req.[MCType]))) = UPPER(LTRIM(RTRIM(mac.[MC_Name])))
WHERE req.[MCNo6Digit] IS NULL
   OR req.[MCNo6Digit] <> CAST(ISNULL(LTRIM(RTRIM(mac.[MC_Code])), '') + ISNULL(LTRIM(RTRIM(req.[MCNo])), '') AS VARCHAR(6));
GO
