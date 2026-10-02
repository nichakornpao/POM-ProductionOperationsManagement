-- =============================================
-- CREATE/RECREATE STAGING TABLE FOR GM
-- ให้ตรงกับ SP และ Controller
-- =============================================

USE [db_Tooling]
GO

-- Drop old table if exists
IF OBJECT_ID('[master].[Staging_ToolingData_GM]', 'U') IS NOT NULL
    DROP TABLE [master].[Staging_ToolingData_GM]
GO

-- Create new Staging table
CREATE TABLE [master].[Staging_ToolingData_GM](
    [StagingID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    [BatchID] UNIQUEIDENTIFIER NOT NULL,
    [PartNo] NVARCHAR(100) NULL,
    [ItemNo] NVARCHAR(100) NULL,
    [Spec] NVARCHAR(100) NULL,
    [Process] NVARCHAR(100) NULL,
    [MC] NVARCHAR(100) NULL,
    [DwgRev] NVARCHAR(50) NULL,
    [DwgUpdate] NVARCHAR(50) NULL,
    [Usage_pcs] NVARCHAR(50) NULL,
    [CT_sec] NVARCHAR(50) NULL,
    [Position] NVARCHAR(50) NULL,
    [Res] NVARCHAR(50) NULL,
    [Date_update] NVARCHAR(50) NULL,
    [Insert_Maker] NVARCHAR(100) NULL,
    [Holder_Spec] NVARCHAR(100) NULL,
    [Holder_No] NVARCHAR(100) NULL,
    [Holder_Maker] NVARCHAR(100) NULL,
    [Conner] NVARCHAR(50) NULL,
    [Usage_Conner] NVARCHAR(50) NULL,
    [Cutting_Layout_No] NVARCHAR(100) NULL,
    [Cutting_Layout_Rev] NVARCHAR(50) NULL,
    [Program_cutting_No] NVARCHAR(100) NULL,
    [Position_Code] NVARCHAR(100) NULL
)
GO

CREATE NONCLUSTERED INDEX [IX_Staging_GM_BatchID] ON [master].[Staging_ToolingData_GM]([BatchID])
GO

PRINT 'Staging_ToolingData_GM created successfully!'
GO
