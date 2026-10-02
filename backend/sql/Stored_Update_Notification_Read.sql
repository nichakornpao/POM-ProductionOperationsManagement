USE [db_Tooling];
GO

IF OBJECT_ID('[trans].[Stored_Update_Notification_Read]', 'P') IS NOT NULL DROP PROCEDURE [trans].[Stored_Update_Notification_Read];
GO

CREATE PROCEDURE [trans].[Stored_Update_Notification_Read]
    @Notification_ID INT
AS
BEGIN
    UPDATE [master].[tb_Notification_Log]
    SET [IsRead] = 1
    WHERE [Notification_ID] = @Notification_ID;
END;
