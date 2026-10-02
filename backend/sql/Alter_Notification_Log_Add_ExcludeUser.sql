USE [db_Tooling]
GO

-- =============================================
-- Author:      Suttichai/Trainee
-- Create date: 14.2.2569 / Update 11/3/2569 (Antigravity)
-- Description: Stored_Insert_Notification_Log (Added Exclude_Username)
-- =============================================
ALTER PROCEDURE [trans].[Stored_Insert_Notification_Log]
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
    INSERT INTO [master].[tb_Notification_Log]
        (Event_Type, Message, Doc_No, Action_By, Subject, Message_TH, Target_Roles, CTA_Route, Details_JSON)
    VALUES
        (@Event_Type, @Message, @Doc_No, @Action_By, @Subject, @Message_TH, @Target_Roles, @CTA_Route, @Details_JSON);
    
    DECLARE @NewID INT = @@IDENTITY;

    -- If Exclude_Username is provided, pre-insert a user state marking it as Read + Deleted
    -- so that the user who triggered the action does not see it in their Inbox.
    IF (@Exclude_Username IS NOT NULL AND LTRIM(RTRIM(@Exclude_Username)) <> '')
    BEGIN
        INSERT INTO [master].[tb_Notification_User_State]
            ([Notification_ID], [Username], [IsRead], [Is_Deleted], [Deleted_At])
        VALUES
            (@NewID, RTRIM(LTRIM(@Exclude_Username)), 1, 1, GETDATE());
    END
    
    SELECT @NewID AS Notification_ID;
END;
GO
