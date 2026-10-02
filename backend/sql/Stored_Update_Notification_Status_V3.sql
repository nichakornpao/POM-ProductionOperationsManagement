CREATE OR ALTER PROCEDURE [trans].[Stored_Update_Notification_Status]
    @Action          NVARCHAR(50),
    @Username        NVARCHAR(100) = NULL,
    @Notification_ID INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- 1. MARK AS READ (Single Click)
    IF @Action = 'READ' AND @Notification_ID IS NOT NULL AND @Username IS NOT NULL
    BEGIN
        IF EXISTS (SELECT 1 FROM [master].[tb_Notification_User_State] WHERE Notification_ID = @Notification_ID AND Username = @Username)
            UPDATE [master].[tb_Notification_User_State] SET IsRead = 1 WHERE Notification_ID = @Notification_ID AND Username = @Username;
        ELSE
            INSERT INTO [master].[tb_Notification_User_State] (Notification_ID, Username, IsRead) VALUES (@Notification_ID, @Username, 1);
    END

    -- 2. MARK ALL AS READ (Robust & Alias-Aware)
    ELSE IF @Action = 'MARK_ALL_READ' AND @Username IS NOT NULL
    BEGIN
        -- Extracted from Stored_Get_Notification_Log: Get role and define alias expansions
        DECLARE @Role NVARCHAR(50) = (SELECT TOP 1 [Role] FROM [dbo].[tb_CuttingTool_Employee] WHERE Username = @Username);
        DECLARE @lcRole NVARCHAR(50) = LOWER(RTRIM(LTRIM(ISNULL(@Role, ''))));
        DECLARE @ExpandedRoles NVARCHAR(MAX) = '';

        IF @lcRole <> ''
        BEGIN
            SET @ExpandedRoles = CASE 
                WHEN @lcRole IN ('ph', 'purchase') THEN 'ph,purchase'
                WHEN @lcRole IN ('pd', 'production') THEN 'pd,production'
                WHEN @lcRole IN ('pc', 'planner', 'production control') THEN 'pc,planner,production control'
                WHEN @lcRole IN ('qc') THEN 'qc'
                WHEN @lcRole IN ('engineer', 'eng', 'en') THEN 'engineer,eng,en'
                WHEN @lcRole IN ('gague', 'gauge') THEN 'gague,gauge'
                WHEN @lcRole IN ('cost') THEN 'cost'
                
                WHEN @lcRole IN ('view') THEN 'view'
                WHEN @lcRole IN ('admin') THEN 'admin'
                WHEN @lcRole IN ('default') THEN 'default'
                ELSE @lcRole
            END;
        END

        DECLARE @DateBoundary DATETIME = DATEADD(DAY, -90, GETDATE());

        -- Step A: Update existing unread entries for this user
        UPDATE [master].[tb_Notification_User_State]
        SET IsRead = 1
        WHERE Username = @Username AND IsRead = 0;

        -- Step B: Insert missing entries for all visible notifications that belong to this user
        INSERT INTO [master].[tb_Notification_User_State] (Notification_ID, Username, IsRead)
        SELECT n.Notification_ID, @Username, 1
        FROM [master].[tb_Notification_Log] n
        LEFT JOIN [master].[tb_Notification_User_State] s 
            ON s.Notification_ID = n.Notification_ID AND s.Username = @Username
        WHERE n.Is_Active = 1
          AND n.Created_At >= @DateBoundary
          AND s.Notification_ID IS NULL -- Not currently tracked for this user
          AND (
                LOWER(n.[Target_Roles]) = 'all'
                OR @lcRole = 'admin'
                OR (',' + LOWER(n.[Target_Roles]) + ',' LIKE '%,' + @lcRole + ',%')
                OR (@ExpandedRoles <> '' AND EXISTS (
                    SELECT 1 FROM STRING_SPLIT(@ExpandedRoles, ',') AS alias
                    WHERE ',' + LOWER(n.[Target_Roles]) + ',' LIKE '%,' + LTRIM(RTRIM(alias.value)) + ',%'
                ))
                OR (@Username IS NOT NULL AND ',' + LOWER(n.[Target_Roles]) + ',' LIKE '%,' + LOWER(@Username) + ',%')
              );
        
        SELECT @@ROWCOUNT AS UpdatedCount;
    END

    -- 3. DELETE READ (Move to Trash)
    ELSE IF @Action = 'DELETE_READ' AND @Username IS NOT NULL
    BEGIN
        UPDATE [master].[tb_Notification_User_State] 
        SET Is_Deleted = 1, Deleted_At = GETDATE() 
        WHERE Username = @Username AND (Is_Deleted = 0 OR Is_Deleted IS NULL) AND IsRead = 1;

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

    -- 6. PURGE OLD LOGS (Global cleanup)
    -- This ensures we don't hold global notification logs forever. Once a broadcast is 33 days old (30 days inbox + 3 days trash), it is wiped.
    ELSE IF @Action = 'PURGE_OLD_LOGS'
    BEGIN
        -- Step A: Clear child table (State) first to prevent orphaned records or constraint errors
        DELETE FROM [master].[tb_Notification_User_State]
        WHERE Notification_ID IN (
            SELECT Notification_ID 
            FROM [master].[tb_Notification_Log] 
            WHERE Created_At < DATEADD(DAY, -33, GETDATE())
        );

        -- Step B: Clear parent table (Log)
        DELETE FROM [master].[tb_Notification_Log] 
        WHERE Created_At < DATEADD(DAY, -33, GETDATE());
    END
END;
