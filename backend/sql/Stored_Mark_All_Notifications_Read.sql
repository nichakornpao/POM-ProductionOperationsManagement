USE [db_Tooling];
GO

IF OBJECT_ID('[trans].[Stored_Mark_All_Notifications_Read]', 'P') IS NOT NULL DROP PROCEDURE [trans].[Stored_Mark_All_Notifications_Read];
GO

CREATE PROCEDURE [trans].[Stored_Mark_All_Notifications_Read]
AS
BEGIN
    SET NOCOUNT ON;
    
    UPDATE [master].[tb_Notification_Log]
    SET [IsRead] = 1
    WHERE [IsRead] = 0 AND [Is_Active] = 1;

    -- Return the number of updated rows
    SELECT @@ROWCOUNT AS UpdatedCount;
END;
GO
