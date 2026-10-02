USE [db_Tooling]
GO
/****** Object:  StoredProcedure [trans].[Stored_Dropdown_Division]    Script Date: 1/22/2026 2:50:39 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- =============================================
-- Author:       Suttichai /Trainee
-- Date:         22/1/2569 (แก้ไขล่าสุด)
-- Description:  Stored_Request_Dropdown_Division
-- =============================================
CREATE PROCEDURE [trans].[Stored_Dropdown_Division]
AS
BEGIN
    SET NOCOUNT ON;

    -- เลือกข้อมูล Division ออกมา (ใช้ DISTINCT เพื่อตัดตัวซ้ำทิ้ง)
    SELECT DISTINCT 
        [Division_Id] AS [Value],       -- ค่าที่จะส่งไปหลังบ้าน
        [Profit_Center] AS [Text],      -- ค่าที่จะแสดงให้ User เห็น (ตามที่ขอ)
        [Division_Name]                 -- เผื่อไว้ใช้แสดง Tooltip หรือข้อมูลเสริม
    FROM [viewer].[View_tb_Division_Facility_ALL]
    ORDER BY [Profit_Center];
END
GO
