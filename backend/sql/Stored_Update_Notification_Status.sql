USE [db_Tooling]
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- =============================================
-- Author:      Antigravity
-- Create date: 16.3.2569
-- Description: Stored_Update_Notification_Status V2 - Robust MARK_ALL_READ
-- =============================================
CREATE OR ALTER PROCEDURE [trans].[Stored_Update_Notification_Status]
    @Action          NVARCHAR(50),
    @Username        NVARCHAR(100) = NULL,
    @Notification_ID INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- 1. MARK AS READ (Single)
    IF @Action = 'READ' AND @Notification_ID IS NOT NULL AND @Username IS NOT NULL
    BEGIN
        IF EXISTS (SELECT 1 FROM [master].[tb_Notification_User_State] WHERE Notification_ID = @Notification_ID AND Username = @Username)
            UPDATE [master].[tb_Notification_User_State] SET IsRead = 1 WHERE Notification_ID = @Notification_ID AND Username = @Username;
        ELSE
            INSERT INTO [master].[tb_Notification_User_State] (Notification_ID, Username, IsRead) VALUES (@Notification_ID, @Username, 1);
    END

    -- 2. MARK ALL AS READ (Robust)
    ELSE IF @Action = 'MARK_ALL_READ' AND @Username IS NOT NULL
    BEGIN
        -- Get target user's role for filtering
        DECLARE @Role NVARCHAR(50) = (SELECT TOP 1 Role FROM [dbo].[tb_CuttingTool_Employee] WHERE Username = @Username);

        -- Step A: Update existing entries for this user
        UPDATE [master].[tb_Notification_User_State]
        SET IsRead = 1
        WHERE Username = @Username AND IsRead = 0;

        -- Step B: Insert missing entries for all visible notifications
        -- Logic mirrors Stored_Get_Notification_Log filtering
        INSERT INTO [master].[tb_Notification_User_State] (Notification_ID, Username, IsRead)
        SELECT n.Notification_ID, @Username, 1
        FROM [master].[tb_Notification_Log] n
        LEFT JOIN [master].[tb_Notification_User_State] s ON s.Notification_ID = n.Notification_ID AND s.Username = @Username
        WHERE n.Is_Active = 1
          AND s.Notification_ID IS NULL -- Not currently tracked for this user
          AND (
                @Role = 'admin'
                OR n.Target_Roles = 'ALL'
                OR (@Role IS NOT NULL AND n.Target_Roles LIKE '%' + @Role + '%')
                OR n.Target_Roles LIKE '%' + @Username + '%'
              );
        
        SELECT @@ROWCOUNT AS UpdatedCount;
    END

    -- 3. DELETE READ (Move to Trash)
    ELSE IF @Action = 'DELETE_READ' AND @Username IS NOT NULL
    BEGIN
        UPDATE [master].[tb_Notification_User_State] 
        SET Is_Deleted = 1, Deleted_At = GETDATE() 
        WHERE Username = @Username AND IsRead = 1 AND (Is_Deleted = 0 OR Is_Deleted IS NULL);

        SELECT @@ROWCOUNT AS AffectedRows;
    END

    -- 4. RESTORE FROM TRASH
    ELSE IF @Action = 'RESTORE' AND @Notification_ID IS NOT NULL AND @Username IS NOT NULL
    BEGIN
        UPDATE [master].[tb_Notification_User_State] 
        SET Is_Deleted = 0, Deleted_At = NULL 
        WHERE Notification_ID = @Notification_ID AND Username = @Username;
    END

    -- 5. PURGE OLD TRASH
    ELSE IF @Action = 'PURGE_OLD'
    BEGIN
        DELETE FROM [master].[tb_Notification_User_State] 
        WHERE Is_Deleted = 1 AND Deleted_At < DATEADD(DAY, -3, GETDATE());
        
        SELECT @@ROWCOUNT AS PurgedCount;
    END
END;
GO
