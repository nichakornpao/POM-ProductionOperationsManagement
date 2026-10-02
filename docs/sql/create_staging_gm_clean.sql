USE [db_Tooling]
GO

CREATE TABLE [master].[Staging_ToolingData_GM](
    [StagingGM_ID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    [BatchID] UNIQUEIDENTIFIER NOT NULL,
    [UploadedDate] DATETIME DEFAULT GETDATE(),
    [PartNo] NVARCHAR(100) NULL,
    [Process] NVARCHAR(100) NULL,
    [MC] NVARCHAR(100) NULL,
    [Position] NVARCHAR(50) NULL,
    [Spec] NVARCHAR(100) NULL,
    [ItemNo] NVARCHAR(100) NULL,
    [DwgRev] NVARCHAR(50) NULL,
    [DwgUpdate] NVARCHAR(50) NULL,
    [Usage_pcs] NVARCHAR(50) NULL,
    [CT_sec] NVARCHAR(50) NULL,
    [Res] NVARCHAR(50) NULL,
    [Date_update] NVARCHAR(50) NULL,
    [Insert_Maker] NVARCHAR(100) NULL,
    [Conner] NVARCHAR(50) NULL,
    [Usage_Conner] NVARCHAR(50) NULL,
    [Cutting_Layout_No] NVARCHAR(100) NULL,
    [Cutting_Layout_Rev] NVARCHAR(50) NULL,
    [Program_cutting_No] NVARCHAR(100) NULL,
    [Position_Code] NVARCHAR(100) NULL,
    [Holder_Spec] NVARCHAR(100) NULL,
    [Holder_No] NVARCHAR(100) NULL,
    [Holder_Maker] NVARCHAR(100) NULL
)
GO

CREATE NONCLUSTERED INDEX [IX_Staging_GM_BatchID] 
ON [master].[Staging_ToolingData_GM] ([BatchID])
GO
