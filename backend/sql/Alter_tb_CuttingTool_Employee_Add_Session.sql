USE [db_Tooling]
GO

-- Add session tracking columns for Single Session Blocking
ALTER TABLE [dbo].[tb_CuttingTool_Employee]
ADD 
    [IsLoggedIn] BIT NOT NULL DEFAULT 0,
    [LastActive] DATETIME NULL;
GO
