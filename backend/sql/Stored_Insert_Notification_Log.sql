USE [db_Tooling]
GO
-- =============================================
-- Author:      Suttichai/Trainee 
-- Create date: 16.3.2569
-- Description: Stored_Insert_Notification_Log
--              1. Atomic Upsert for Doc_No consistency
--              2. Case-insensitive handling for 'ALL'/'all'
--              3. Audience expansion for major roles (PH, PD, ENG)
--              4. Recycled notification reset (Is_Deleted = 0)
-- =============================================
CREATE OR ALTER PROCEDURE [trans].[Stored_Insert_Notification_Log]
    @Event_Type   NVARCHAR(50),
    @Message      NVARCHAR(MAX),
    @Doc_No       NVARCHAR(50),
    @Action_By    NVARCHAR(100),
    @Subject      NVARCHAR(255) = NULL,
    @Message_TH   NVARCHAR(MAX) = NULL,
    @Target_Roles NVARCHAR(255) = 'all',
    @CTA_Route    NVARCHAR(255) = NULL,
    @Details_JSON NVARCHAR(MAX) = NULL,  -- Item snapshot (stored for REQUEST_SENT fast-path)
    @Exclude_Username NVARCHAR(100) = NULL,
    @Division_Id  INT           = NULL  --- New Dedicated Column
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Notification_ID INT;

    -- 1. Atomic Upsert Logic
    SELECT TOP 1 @Notification_ID = Notification_ID
    FROM [master].[tb_Notification_Log]
    WHERE Event_Type = @Event_Type AND Doc_No = @Doc_No AND Is_Active = 1
    ORDER BY Created_At DESC;

    IF (@Notification_ID IS NOT NULL)
    BEGIN
        UPDATE [master].[tb_Notification_Log]
        SET Message = @Message, Message_TH = @Message_TH, Subject = @Subject,
            Action_By = @Action_By, Target_Roles = @Target_Roles, 
            Created_At = GETDATE(), IsRead = 0,
            Division_Id = @Division_Id, -- Update Dedicated Column
            Details_JSON = @Details_JSON  -- Preserve/update snapshot
        WHERE Notification_ID = @Notification_ID;

        -- Ensure recycled notifications reappear for all users
        UPDATE [master].[tb_Notification_User_State]
        SET IsRead = 0, Is_Deleted = 0, Deleted_At = NULL
        WHERE Notification_ID = @Notification_ID;
    END
    ELSE
    BEGIN
        INSERT INTO [master].[tb_Notification_Log]
            (Event_Type, Message, Doc_No, Action_By, Subject, Message_TH, Target_Roles, CTA_Route, Division_Id, Details_JSON)
        VALUES
            (@Event_Type, @Message, @Doc_No, @Action_By, @Subject, @Message_TH, @Target_Roles, @CTA_Route, @Division_Id, @Details_JSON);
        SET @Notification_ID = SCOPE_IDENTITY();
    END

    -- 2. Audience Expansion 
    DECLARE @lcTarget NVARCHAR(MAX) = LOWER(ISNULL(@Target_Roles, 'all'));
    DECLARE @ExpandedTargets NVARCHAR(MAX) = @lcTarget;

    IF @lcTarget LIKE '%ph%' OR @lcTarget LIKE '%purchase%' SET @ExpandedTargets += ',ph,purchase';
    IF @lcTarget LIKE '%pd%' OR @lcTarget LIKE '%production%' SET @ExpandedTargets += ',pd,production';
    IF @lcTarget LIKE '%eng%' OR @lcTarget LIKE '%engineer%' OR @lcTarget LIKE '%en%' SET @ExpandedTargets += ',engineer,eng,en';

    INSERT INTO [master].[tb_Notification_User_State] (Notification_ID, Username, IsRead, Is_Deleted)
    SELECT DISTINCT @Notification_ID, e.Username, 0, 0
    FROM [dbo].[tb_CuttingTool_Employee] e
    WHERE (
        @lcTarget = 'all' 
        OR (',' + @ExpandedTargets + ',' LIKE '%,' + LOWER(e.Role) + ',%')
        OR (',' + @ExpandedTargets + ',' LIKE '%,' + LOWER(e.Username) + ',%')
    )
    AND NOT EXISTS (
        SELECT 1 FROM [master].[tb_Notification_User_State] us 
        WHERE us.Notification_ID = @Notification_ID AND us.Username = e.Username
    );

    SELECT @Notification_ID AS Notification_ID;
END;
GO
