USE [db_Tooling]
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- =============================================
-- Author:      Suttichai/Trainee + Antigravity
-- Create date: Update 16/3/2569
-- Description: Stored_Get_Notification_Log V4 - Supports Role + Username targeting + CreatedAt Filter
-- =============================================
CREATE OR ALTER PROCEDURE [trans].[Stored_Get_Notification_Log]
    @Role     NVARCHAR(50)  = NULL,
    @Is_Trash BIT           = 0,
    @Username NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON

    -- ดึงวันที่สร้าง Account ของพนักงานคนนี้
    DECLARE @UserCreatedAt DATETIME = (
        SELECT TOP 1 [DateTime_Record] 
        FROM [dbo].[tb_CuttingTool_Employee] 
        WHERE [Username] = @Username
    );

    SELECT TOP 100
        n.[Notification_ID],
        n.[Event_Type],
        n.[Subject],
        n.[Message],
        n.[Message_TH],
        n.[Doc_No],
        n.[Action_By],
        n.[Target_Roles],
        n.[CTA_Route],
        n.[Details_JSON],
        n.[Created_At],
        ISNULL(s.[IsRead],     0) AS [IsRead],
        ISNULL(s.[Is_Deleted], 0) AS [Is_Deleted],
        s.[Deleted_At]
    FROM [master].[tb_Notification_Log] n
    LEFT JOIN [master].[tb_Notification_User_State] s
           ON s.[Notification_ID] = n.[Notification_ID]
          AND s.[Username]        = @Username
    WHERE n.[Is_Active] = 1
      AND (
          -- If fetching INBOX (@Is_Trash = 0): Must not be explicitly deleted AND must be less than 30 days old
          (@Is_Trash = 0 AND ISNULL(s.[Is_Deleted], 0) = 0 AND n.[Created_At] >= DATEADD(DAY, -30, GETDATE()))
          OR
          -- If fetching TRASH (@Is_Trash = 1): Find explicitly deleted items OR implicitly expired items (>= 30 days old)
          (@Is_Trash = 1 AND (ISNULL(s.[Is_Deleted], 0) = 1 OR n.[Created_At] < DATEADD(DAY, -30, GETDATE())))
      )
      
      -- กรองเฉพาะข้อความที่สร้างหลังจาก User ถูกสร้าง (ถ้าไม่มีวันที่สร้าง ให้ย้อนไปปี 2000 ถือว่าเห็นหมด)
      AND (n.[Created_At] >= ISNULL(@UserCreatedAt, '2000-01-01')) 

      AND (
            @Role IS NULL
            OR n.[Target_Roles] = 'ALL'
            OR (@Role IS NOT NULL AND n.[Target_Roles] LIKE N'%' + @Role + N'%')
            OR @Role = 'admin'
            -- NEW: เพิ่มการตรวจสอบชื่อ Username โดยตรง (สำหรับส่งแจ้งเตือนรายบุคคล)
            OR (@Username IS NOT NULL AND n.[Target_Roles] LIKE N'%' + @Username + N'%')
          )
    ORDER BY n.[Created_At] DESC
END
GO
