USE [db_Tooling];
GO

-- 1. Drop Old/Wrong Tables/SPs if they exist
IF OBJECT_ID('[trans].[Notification_Log]', 'U') IS NOT NULL DROP TABLE [trans].[Notification_Log];
IF OBJECT_ID('[master].[tb_Notification_Log]', 'U') IS NOT NULL DROP TABLE [master].[tb_Notification_Log];
IF OBJECT_ID('[trans].[Stored_Insert_Notification_Log]', 'P') IS NOT NULL DROP PROCEDURE [trans].[Stored_Insert_Notification_Log];
GO

-- 2. Create Table in [master] schema
CREATE TABLE [master].[tb_Notification_Log] (
    [Notification_ID] INT IDENTITY(1,1) PRIMARY KEY,
    [Event_Type] NVARCHAR(50), -- 'NEW_PLAN', 'UPDATE_PLAN', 'CANCEL_PLAN'
    [Message] NVARCHAR(MAX),
    [Doc_No] NVARCHAR(50),
    [Action_By] NVARCHAR(100),
    [Created_At] DATETIME DEFAULT GETDATE(),
    [Is_Active] BIT DEFAULT 1,
    [IsRead] BIT DEFAULT 0
);
GO

-- 3. Create Insert SP in [trans] schema
CREATE PROCEDURE [trans].[Stored_Insert_Notification_Log]
    @Event_Type NVARCHAR(50),
    @Message NVARCHAR(MAX),
    @Doc_No NVARCHAR(50),
    @Action_By NVARCHAR(100)
AS
BEGIN
    INSERT INTO [master].[tb_Notification_Log] (Event_Type, Message, Doc_No, Action_By)
    VALUES (@Event_Type, @Message, @Doc_No, @Action_By);
    
    SELECT @@IDENTITY AS Notification_ID;
END;
