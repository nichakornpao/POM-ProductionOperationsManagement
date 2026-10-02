USE [db_Tooling]
GO

/****** Reference Object: View [viewer].[View_Get_Pc_Plan_All_Data] ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

-- =============================================
-- Description: View สำหรับดึง Master Data (MC, Process, PartNo) รวมทุก Division
-- Updated: เพิ่มข้อมูลของ GM (7122) โดยการ UNION จาก View_tb_Master_Pur_CuttingTool_GM
-- =============================================
CREATE OR ALTER VIEW [viewer].[View_Get_Pc_Plan_All_Data]
AS
-- 1. ส่วนของ PMC (เดิม)
SELECT 
      [Division_Id]
    , [MC]
    , [Process]
    , [PartNo]
FROM     
    [db_Tooling].[viewer].[View_tb_Master_Pur_CuttingTool_PMC]
WHERE 
      [MC] IS NOT NULL 
   OR [Process] IS NOT NULL 
   OR [PartNo] IS NOT NULL

UNION ALL

-- 2. ส่วนของ GM (เพิ่มใหม่)
SELECT 
      [Division_Id]
    , [MC]
    , [Process]
    , [PartNo]
FROM     
    [db_Tooling].[viewer].[View_tb_Master_Pur_CuttingTool_GM]
WHERE 
      [MC] IS NOT NULL 
   OR [Process] IS NOT NULL 
   OR [PartNo] IS NOT NULL
GO
