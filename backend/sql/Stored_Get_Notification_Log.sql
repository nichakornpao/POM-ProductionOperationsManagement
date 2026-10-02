USE [db_Tooling]
GO

-- =============================================
-- Author:      Suttichai/Trainee + Antigravity
-- Modified:    17.3.2569
-- Description: Stored_Get_Notification_Log V-Fixed
--              1. Aligned role matching to use strict comma-delimited check (matches Insert SP)
--              2. Relaxed @UserCreatedAt filter: uses DATEADD(-90 days) fallback instead of user's record date
--              3. Explicit alias expansion for PH/Purchase, PD/Production
-- =============================================
CREATE OR ALTER PROCEDURE [trans].[Stored_Get_Notification_Log]
    @Role     NVARCHAR(50)  = NULL,
    @Is_Trash BIT           = 0,
    @Username NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- 1. Expand Role Aliases (ฉบับแก้ไขให้ครอบคลุมตาม Alias จริง)
    DECLARE @ExpandedRoles NVARCHAR(500) = '';
    IF @Role IS NOT NULL
    BEGIN
        DECLARE @lcRole NVARCHAR(50) = LOWER(@Role);
        SET @ExpandedRoles = CASE 
            WHEN @lcRole IN ('ph', 'purchase') THEN 'ph,purchase'
            WHEN @lcRole IN ('pd', 'production') THEN 'pd,production'
            WHEN @lcRole IN ('pc', 'planner', 'production control') THEN 'pc,planner,production control'
            WHEN @lcRole IN ('qc') THEN 'qc'
            WHEN @lcRole IN ('engineer', 'eng', 'en') THEN 'engineer,eng,en'
            WHEN @lcRole IN ('gague', 'gauge') THEN 'gague,gauge' -- เผื่อตัวสะกดที่ถูกไว้ด้วย
            WHEN @lcRole IN ('cost') THEN 'cost'
            WHEN @lcRole IN ('view') THEN 'view'
            WHEN @lcRole IN ('admin') THEN 'admin'
            WHEN @lcRole IN ('default') THEN 'default'
            ELSE @lcRole
        END;
    END

    -- 2. Safe date boundary: only show notifications from the last 90 days
    --    (Removed the @UserCreatedAt dependency on tb_CuttingTool_Employee.DateTime_Record
    --     which was causing valid notifications to be hidden when the employee record
    --     had an incorrect or recently updated timestamp)
    DECLARE @DateBoundary DATETIME = DATEADD(DAY, -90, GETDATE());

    -- 3. Select Notifications using STRICT comma-delimited role matching
    --    (Aligned with Insert SP's audience expansion logic)
    SELECT 
        n.[Notification_ID],
        n.[Event_Type],
        n.[Message],
        n.[Doc_No],
        n.[Action_By],
        n.[Created_At],
        n.[Subject],
        n.[Message_TH],
        n.[Target_Roles],
        n.[CTA_Route],
        n.[Division_Id], -- Dedicated Column for instant filtering
        n.[Details_JSON],                -- Restored: required for REQUEST_SENT item snapshot
        ISNULL(s.[IsRead], 0) AS [IsRead],
        ISNULL(s.[Is_Deleted], 0) AS [Is_Deleted]
    FROM [master].[tb_Notification_Log] n
    LEFT JOIN [master].[tb_Notification_User_State] s 
        ON n.Notification_ID = s.Notification_ID AND s.Username = @Username
    WHERE 
        -- User state filter: show if user has a state row, OR if no state row exists (LEFT JOIN null)
        (s.Username = @Username OR s.Username IS NULL)
        -- Trash filter
        AND ISNULL(s.Is_Deleted, 0) = @Is_Trash
        -- Role/Target filter (strict comma-delimited matching — aligned with Insert SP)
        AND (
            LOWER(n.[Target_Roles]) = 'all'
            OR @Role = 'admin'
            -- Strict comma-delimited role check (matches Insert SP exactly)
            OR (',' + LOWER(n.[Target_Roles]) + ',' LIKE '%,' + LOWER(@Role) + ',%')
            -- Expanded alias check (e.g., user is 'PH' → also check for 'purchase')
            OR (@ExpandedRoles <> '' AND EXISTS (
                SELECT 1 FROM STRING_SPLIT(@ExpandedRoles, ',') AS alias
                WHERE ',' + LOWER(n.[Target_Roles]) + ',' LIKE '%,' + LTRIM(RTRIM(alias.value)) + ',%'
            ))
            -- Direct username targeting check
            OR (@Username IS NOT NULL AND ',' + LOWER(n.[Target_Roles]) + ',' LIKE '%,' + LOWER(@Username) + ',%')
        )
        -- Date boundary (90-day rolling window instead of user account creation date)
        AND n.Created_At >= @DateBoundary
        AND n.Is_Active = 1
    ORDER BY n.Created_At DESC;
END;
GO
