-- =============================================
-- Author:      System Generated
-- Create Date: 2026-02-03
-- Description: ดึงข้อมูล CuttingTool รวมยอด FreshQty + ReuseQty
--              - Facility เป็น optional (ไม่บังคับ)
--              - รวม record ที่ FacilityName เป็น NULL ด้วย
--              - ถ้าค่า Qty เป็น NULL แสดงเป็น 0
-- =============================================

USE [db_Tooling]
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE OR ALTER PROCEDURE [trans].[Stored_Get_CaseSET_CuttingTool]
    @Input_Division NVARCHAR(50) = NULL,
    @Input_PartNo NVARCHAR(100) = NULL,
    @Input_Process NVARCHAR(100) = NULL,
    @Input_FacilityName NVARCHAR(100) = NULL  -- Optional: ถ้าไม่ส่งมา = ดึงทุก Facility
AS
BEGIN
    SET NOCOUNT ON;

    SELECT 
        MAX([Division_Id]) AS [Division_Id],
        MAX([Profit_Center]) AS [Profit_Center],
        [PartNo],
        [ItemNo],
        MAX([ItemName]) AS [ItemName],
        [SPEC],
        [Process],
        [MC],
        MAX([Usage_pcs]) AS [Usage_pcs],
        [Position],
        MAX([DwgRev]) AS [DwgRev],
        MAX([ACCOUNT]) AS [ACCOUNT],
        
        -- รวมยอด Qty และแสดง 0 ถ้าเป็น NULL
        ISNULL(SUM([FreshQty]), 0) AS [FreshQty],
        ISNULL(SUM([ReuseQty]), 0) AS [ReuseQty],
        ISNULL(SUM([TotalQty]), 0) AS [TotalQty]

    FROM [viewer].[View_tb_Master_Pur_CuttingTool_PMC_QTY]
    WHERE 
        (@Input_Division IS NULL OR [Division_Id] = @Input_Division)
        AND (@Input_PartNo IS NULL OR [PartNo] = @Input_PartNo)
        AND (@Input_Process IS NULL OR [Process] = @Input_Process)
        -- Facility: ถ้าไม่ส่งมา = ดึงทั้งหมด, ถ้าส่งมา = กรอง แต่รวม NULL ด้วย
        AND (
            @Input_FacilityName IS NULL 
            OR @Input_FacilityName = '' 
            OR [FacilityName] LIKE '%' + @Input_FacilityName
            OR [FacilityName] IS NULL  -- รวม record ที่ไม่มี Facility
        )
    
    GROUP BY 
        [PartNo],
        [ItemNo],
        [SPEC],
        [Process],
        [MC],
        [Position]

    ORDER BY [PartNo], [Process], [MC], [ItemNo];
END
GO
