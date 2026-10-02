USE [db_Tooling]
GO

-- =============================================
-- Author:      Suttichai/Trainee + Antigravity
-- Create date: 16.3.2569
-- Description: Stored_Insert_Notification_Log V7 - FIX: Populates User State with Role Aliases (PH/PD)
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

    -- 1. Atomic Upsert Logic
    SELECT TOP 1 @Notification_ID = Notification_ID
    FROM [master].[tb_Notification_Log]
    WHERE Event_Type = @Event_Type
      AND Doc_No = @Doc_No
      AND Target_Roles = @Target_Roles
      AND Is_Active = 1
    ORDER BY Created_At DESC;

    IF (@Notification_ID IS NOT NULL)
    BEGIN
        UPDATE [master].[tb_Notification_Log]
        SET Message = @Message,
            Message_TH = @Message_TH,
            Subject = @Subject,
            Details_JSON = @Details_JSON,
            Action_By = @Action_By,
            Created_At = GETDATE(),
            IsRead = 0
        WHERE Notification_ID = @Notification_ID;

        -- Reset Per-User States for this notification (so it pops up as 'new' for others)
        -- We only reset IsRead for existing states, but below we will add missing ones.
        UPDATE [master].[tb_Notification_User_State]
        SET IsRead = 0
        WHERE Notification_ID = @Notification_ID 
          AND (Is_Deleted = 0 OR Is_Deleted IS NULL);
    END
    ELSE
    BEGIN
        INSERT INTO [master].[tb_Notification_Log]
            (Event_Type, Message, Doc_No, Action_By, Subject, Message_TH, Target_Roles, CTA_Route, Details_JSON)
        VALUES
            (@Event_Type, @Message, @Doc_No, @Action_By, @Subject, @Message_TH, @Target_Roles, @CTA_Route, @Details_JSON);
        
        SET @Notification_ID = @@IDENTITY;
    END

    -- 2. Audience Expansion (Populate User State Table)
    -- This ensures the inbox query is fast and handles aliases correctly.
    
    -- We target users whose role matches Target_Roles OR if Target_Roles contains aliases.
    -- e.g. If @Target_Roles = 'purchase', we also include role 'PH'.
    -- e.g. If @Target_Roles = 'production', we also include role 'PD'.
    
    INSERT INTO [master].[tb_Notification_User_State] (Notification_ID, Username, IsRead, Is_Deleted)
    SELECT DISTINCT @Notification_ID, e.Username, 0, 0
    FROM [dbo].[tb_CuttingTool_Employee] e
    WHERE (
        @Target_Roles = 'ALL'
        OR @Target_Roles LIKE '%' + e.Role + '%' 
        OR (@Target_Roles LIKE '%purchase%'   AND e.Role = 'PH')
        OR (@Target_Roles LIKE '%ph%'         AND e.Role = 'purchase')
        OR (@Target_Roles LIKE '%production%' AND e.Role = 'PD')
        OR (@Target_Roles LIKE '%pd%'         AND e.Role = 'production')
        OR @Target_Roles LIKE '%' + e.Username + '%'
    )
    AND NOT EXISTS (
        SELECT 1 FROM [master].[tb_Notification_User_State] us 
        WHERE us.Notification_ID = @Notification_ID AND us.Username = e.Username
    );

    -- 3. Handle Exclude_Username (Testing / Self-suppression)
    -- Temporarily commented out as per implementation plan to allow multi-role testing
    /*
    IF (@Exclude_Username IS NOT NULL AND LTRIM(RTRIM(@Exclude_Username)) <> '')
    BEGIN
        UPDATE [master].[tb_Notification_User_State]
        SET IsRead = 1, Is_Deleted = 1, Deleted_At = GETDATE()
        WHERE Notification_ID = @Notification_ID AND Username = @Exclude_Username;
    END
    */

    SELECT @Notification_ID AS Notification_ID;
END;
GO
