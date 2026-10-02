-- =============================================
-- Author:      System Generated
-- Create Date: 2026-02-03
-- Description: ดึง Machine Type (MC) ตาม Division
--              ใช้แสดงใน Dropdown เท่านั้น ไม่ใช้กรองข้อมูล
-- =============================================

USE [db_Tooling]
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE OR ALTER PROCEDURE [trans].[Stored_Get_MC_ByDivision]
    @Input_Division NVARCHAR(50) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    SELECT DISTINCT [MC]
    FROM [viewer].[View_tb_Master_Pur_CuttingTool_PMC_QTY]
    WHERE 
        (@Input_Division IS NULL OR [Division_Id] = @Input_Division)
        AND [MC] IS NOT NULL
        AND [MC] <> ''
    ORDER BY [MC];
END
GO
