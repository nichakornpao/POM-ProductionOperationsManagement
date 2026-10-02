-- =============================================
-- Author:      System Generated
-- Create Date: 2026-02-03
-- Description: Stored Procedure สำหรับดูรายละเอียด Box/Shelf/Rack
--              ใช้กับปุ่ม View Detail บนหน้าเว็บ
--              ลบ @Input_MC ออก และใช้ FacilityName แทน Facility
-- =============================================

USE [db_Tooling]
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE OR ALTER PROCEDURE [trans].[Stored_Get_CaseSET_CuttingTool_Detail]
    @Input_Division NVARCHAR(50) = NULL,
    @Input_ItemNo NVARCHAR(100) = NULL,
    @Input_FacilityName NVARCHAR(100) = NULL,
    @Input_PartNo NVARCHAR(100) = NULL, -- Kept for compatibility but not used for filter
    @Input_Process NVARCHAR(100) = NULL  -- Kept for compatibility but not used for filter
AS
BEGIN
    SET NOCOUNT ON;

    -- Use exactly the same data source as the main search for consistency
    SELECT 
        S.ToolingName AS [ItemNo],
        S.FacilityName,
        S.BoxName,
        S.ShelfName,
        S.RackName,
        ISNULL(S.FreshQty, 0) AS [FreshQty],
        ISNULL(S.ReuseQty, 0) AS [ReuseQty],
        ISNULL(S.FreshQty + S.ReuseQty, 0) AS [TotalQty]
    FROM (
        SELECT ToolingName, FacilityName, BoxName, ShelfName, RackName, FreshQty, ReuseQty, '71DZ' as PC 
        FROM [db_SmartCuttingTool_PMA].[viewer].[ToolingStockOnRack]
        UNION ALL
        SELECT ToolingName, FacilityName, BoxName, ShelfName, RackName, FreshQty, ReuseQty, '7122' as PC 
        FROM [db_ToolingSmartRack].[viewer].[ToolingStockOnRack]
    ) S
    WHERE S.ToolingName = @Input_ItemNo
      AND (S.PC = @Input_Division OR @Input_Division IS NULL OR @Input_Division = '')
      AND (@Input_FacilityName IS NULL OR @Input_FacilityName = '' OR S.FacilityName LIKE '%' + @Input_FacilityName + '%')
    ORDER BY S.BoxName, S.ShelfName, S.RackName;
END
GO
