USE [db_Tooling]
GO

-- =============================================
-- Author:      Suttichai/Trainee + Antigravity
-- Create date: 16.3.2569
-- Description: Stored_Insert_Notification_Log V6 - Fixes state reset bug (Preserves TRASH status)
-- =============================================
CREATE OR ALTER PROCEDURE [trans].[Stored_Insert_Notification_Log]
    @Event_Type   NVARCHAR(50),
    @Message      NVARCHAR(MAX),
    @Doc_No       NVARCHAR(50),
    @Action_By    NVARCHAR(100),
    @Subject      NVARCHAR(255) = NULL,
    @Message_TH   NVARCHAR(MAX) = NULL,
    @Target_Roles NVARCHAR(255) = 'ALL',
    @CTA_Route    NVARCHAR(255) = NULL,
    @Details_JSON NVARCHAR(MAX) = NULL,
    @Exclude_Username NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Notification_ID INT;

    -- 1. Check if a dynamic/grouped notification already exists for this set
    SELECT TOP 1 @Notification_ID = Notification_ID
    FROM [master].[tb_Notification_Log]
    WHERE Event_Type = @Event_Type
      AND Doc_No = @Doc_No
      AND Target_Roles = @Target_Roles
      AND Is_Active = 1
    ORDER BY Created_At DESC;

    IF (@Notification_ID IS NOT NULL)
    BEGIN
        -- UPDATE existing notification
        UPDATE [master].[tb_Notification_Log]
        SET Message = @Message,
            Message_TH = @Message_TH,
            Subject = @Subject,
            Details_JSON = @Details_JSON,
            Action_By = @Action_By,
            Created_At = GETDATE(), -- Refresh timestamp
            IsRead = 0
        WHERE Notification_ID = @Notification_ID;

        -- ❗ CRITICAL FIX: DO NOT DELETE USER STATES. 
        -- Instead, mark as Unread only for those who still have it in their Inbox.
        -- If they deleted it (Is_Deleted = 1), leave it in the Trash.
        UPDATE [master].[tb_Notification_User_State]
        SET IsRead = 0
        WHERE Notification_ID = @Notification_ID 
          AND (Is_Deleted = 0 OR Is_Deleted IS NULL)
          -- AND (Username <> @Exclude_Username OR @Exclude_Username IS NULL);
    END
    ELSE
    BEGIN
        -- INSERT new notification
        INSERT INTO [master].[tb_Notification_Log]
            (Event_Type, Message, Doc_No, Action_By, Subject, Message_TH, Target_Roles, CTA_Route, Details_JSON)
        VALUES
            (@Event_Type, @Message, @Doc_No, @Action_By, @Subject, @Message_TH, @Target_Roles, @CTA_Route, @Details_JSON);
        
        SET @Notification_ID = @@IDENTITY;
    END

    /* 
    -- 2. Handle Exclude_Username (Self-notification suppression)
    IF (@Exclude_Username IS NOT NULL AND LTRIM(RTRIM(@Exclude_Username)) <> '')
    BEGIN
        IF EXISTS (SELECT 1 FROM [master].[tb_Notification_User_State] WHERE Notification_ID = @Notification_ID AND Username = @Exclude_Username)
        BEGIN
            UPDATE [master].[tb_Notification_User_State]
            SET IsRead = 1, Is_Deleted = 1, Deleted_At = GETDATE()
            WHERE Notification_ID = @Notification_ID AND Username = @Exclude_Username;
        END
        ELSE
        BEGIN
            INSERT INTO [master].[tb_Notification_User_State]
                ([Notification_ID], [Username], [IsRead], [Is_Deleted], [Deleted_At])
            VALUES
                (@Notification_ID, RTRIM(LTRIM(@Exclude_Username)), 1, 1, GETDATE());
        END
    END
    */
    
    SELECT @Notification_ID AS Notification_ID;
END;
GO
