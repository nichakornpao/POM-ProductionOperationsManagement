-- =============================================
-- Author:      Antigravity
-- Create date: 2026-03-24
-- Description: Add SessionToken column to support
--              per-session identity verification via Heartbeat.
--              Token is generated on every successful login (NEWID())
--              and set to NULL on logout.
-- =============================================

IF NOT EXISTS (
    SELECT 1 FROM sys.columns 
    WHERE object_id = OBJECT_ID('[dbo].[tb_CuttingTool_Employee]') 
      AND name = 'SessionToken'
)
BEGIN
    ALTER TABLE [dbo].[tb_CuttingTool_Employee]
    ADD SessionToken NVARCHAR(50) NULL;

    PRINT 'SessionToken column added successfully.';
END
ELSE
BEGIN
    PRINT 'SessionToken column already exists. Skipping.';
END
