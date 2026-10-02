USE [db_Tooling];

IF NOT EXISTS(SELECT * FROM sys.indexes WHERE name = 'IX_Cutting_UniqueId' AND object_id = OBJECT_ID('dbo.tb_IssueCuttingTool_Request_Document'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_Cutting_UniqueId ON dbo.tb_IssueCuttingTool_Request_Document (Unique_Id);
END

IF NOT EXISTS(SELECT * FROM sys.indexes WHERE name = 'IX_Setup_UniqueId' AND object_id = OBJECT_ID('dbo.tb_IssueSetupTool_Request_Document'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_Setup_UniqueId ON dbo.tb_IssueSetupTool_Request_Document (Unique_Id);
END
