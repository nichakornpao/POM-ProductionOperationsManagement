USE [db_Tooling]
GO
/****** Object:  StoredProcedure [trans].[Stored_Get_PCPlan_Dropdown_Division]    Script Date: 1/23/2026 4:46:44 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- =============================================
-- Author:      Suttichai/Trainee
-- Description: ดึงรายชื่อ Profit Center ทั้งหมดมาแสดงใน Dropdown
-- =============================================
ALTER PROCEDURE [trans].[Stored_Get_PCPlan_Dropdown_Division]
AS
BEGIN
    SET NOCOUNT ON;

    -- ดึงเฉพาะ Profit_Center ที่ไม่ซ้ำกันออกมา
    SELECT DISTINCT 
        [Profit_Center]
    FROM [db_Tooling].[viewer].[View_tb_Division_Facility_Process_MC_GM_PMC_SUM]
    ORDER BY [Profit_Center]; -- เรียงลำดับจากน้อยไปมาก

END
GO
