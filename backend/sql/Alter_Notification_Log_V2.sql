USE [db_Tooling];
GO

-- ═══════════════════════════════════════════════════
-- Notification System V2 - Schema Migration
-- Adds: Subject, Message_TH, Target_Roles, CTA_Route
-- ═══════════════════════════════════════════════════

-- 1. Add new columns to existing table
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = 'master' AND TABLE_NAME = 'tb_Notification_Log' AND COLUMN_NAME = 'Subject')
BEGIN
    ALTER TABLE [master].[tb_Notification_Log]
    ADD [Subject] NVARCHAR(255) NULL;
END;
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = 'master' AND TABLE_NAME = 'tb_Notification_Log' AND COLUMN_NAME = 'Message_TH')
BEGIN
    ALTER TABLE [master].[tb_Notification_Log]
    ADD [Message_TH] NVARCHAR(MAX) NULL;
END;
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = 'master' AND TABLE_NAME = 'tb_Notification_Log' AND COLUMN_NAME = 'Target_Roles')
BEGIN
    ALTER TABLE [master].[tb_Notification_Log]
    ADD [Target_Roles] NVARCHAR(255) NULL DEFAULT 'ALL';
END;
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = 'master' AND TABLE_NAME = 'tb_Notification_Log' AND COLUMN_NAME = 'CTA_Route')
BEGIN
    ALTER TABLE [master].[tb_Notification_Log]
    ADD [CTA_Route] NVARCHAR(255) NULL;
END;
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = 'master' AND TABLE_NAME = 'tb_Notification_Log' AND COLUMN_NAME = 'Details_JSON')
BEGIN
    ALTER TABLE [master].[tb_Notification_Log]
    ADD [Details_JSON] NVARCHAR(MAX) NULL;
END;
GO

-- 2. Update Insert SP to accept new fields
IF OBJECT_ID('[trans].[Stored_Insert_Notification_Log]', 'P') IS NOT NULL
    DROP PROCEDURE [trans].[Stored_Insert_Notification_Log];
GO

CREATE PROCEDURE [trans].[Stored_Insert_Notification_Log]
    @Event_Type   NVARCHAR(50),
    @Message      NVARCHAR(MAX),
    @Doc_No       NVARCHAR(50),
    @Action_By    NVARCHAR(100),
    @Subject      NVARCHAR(255) = NULL,
    @Message_TH   NVARCHAR(MAX) = NULL,
    @Target_Roles NVARCHAR(255) = 'ALL',
    @CTA_Route    NVARCHAR(255) = NULL,
    @Details_JSON NVARCHAR(MAX) = NULL
AS
BEGIN
    INSERT INTO [master].[tb_Notification_Log]
        (Event_Type, Message, Doc_No, Action_By, Subject, Message_TH, Target_Roles, CTA_Route, Details_JSON)
    VALUES
        (@Event_Type, @Message, @Doc_No, @Action_By, @Subject, @Message_TH, @Target_Roles, @CTA_Route, @Details_JSON);
    
    SELECT @@IDENTITY AS Notification_ID;
END;
GO

-- 3. Update Get SP to support role-based filtering
IF OBJECT_ID('[trans].[Stored_Get_Notification_Log]', 'P') IS NOT NULL
    DROP PROCEDURE [trans].[Stored_Get_Notification_Log];
GO

CREATE PROCEDURE [trans].[Stored_Get_Notification_Log]
    @Role NVARCHAR(50) = NULL
AS
BEGIN
    SELECT TOP 100
        Notification_ID,
        Event_Type,
        Subject,
        Message,
        Message_TH,
        Doc_No,
        Action_By,
        Target_Roles,
        CTA_Route,
        Details_JSON,
        Created_At,
        IsRead
    FROM [master].[tb_Notification_Log]
    WHERE Is_Active = 1
        AND (
            @Role IS NULL
            OR Target_Roles = 'ALL'
            OR Target_Roles LIKE '%' + @Role + '%'
            OR @Role = 'admin'
        )
    ORDER BY Created_At DESC;
END;
GO

PRINT 'Notification V2 migration completed successfully.';
