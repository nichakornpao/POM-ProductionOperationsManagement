USE [db_Tooling]
GO

/****** Object:  View [viewer].[View_tb_Division_Facility_ALL]    Script Date: 04/02/2026 ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

-- =============================================
-- Description: View สำหรับดึง List รายชื่อ Division และ Facility ที่มีอยู่จริงในระบบ
-- Updated: เพิ่มข้อมูลของ GM (7122) โดยการ UNION จาก View_tb_Master_Pur_CuttingTool_GM
-- Note: GM ใช้ Stock จาก db_ToolingSmartRack
-- =============================================
ALTER VIEW [viewer].[View_tb_Division_Facility_ALL]
AS
-- 1. ส่วนของ PMC (เดิม)
SELECT DISTINCT 
      p.Division_Id
    , p.Profit_Center
    , s.FacilityName
FROM     
    viewer.View_tb_Master_Pur_CuttingTool_PMC AS p 
INNER JOIN 
    db_SmartCuttingTool_PMA.viewer.ToolingStockOnRack AS s 
    ON CAST(p.ItemNo AS nvarchar(100)) = CAST(s.ToolingName AS nvarchar(100))
WHERE 
    s.FacilityName IS NOT NULL

UNION

-- 2. ส่วนของ GM (เพิ่มใหม่)
SELECT DISTINCT 
      g.[Division_Id]
    , g.[Profit_Center]
    , s.[FacilityName]
FROM     
    [db_Tooling].[viewer].[View_tb_Master_Pur_CuttingTool_GM] AS g
INNER JOIN 
    [db_ToolingSmartRack].[viewer].[ToolingStockOnRack] AS s -- Correct DB for GM
    ON CAST(g.[ItemNo] AS nvarchar(100)) = CAST(s.[ToolingName] AS nvarchar(100))
WHERE 
    s.[FacilityName] IS NOT NULL
GO
