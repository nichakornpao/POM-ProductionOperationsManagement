-- =============================================
-- Author:      System Generated
-- Create Date: 2026-02-02
-- Description: Stored Procedures สำหรับ Case SET 
--              แสดงยอดรวม และรายละเอียด Box/Shelf
-- =============================================

USE [db_Tooling]
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- =============================================
-- Stored Procedure 1: ดึงข้อมูล CuttingTool สำหรับ Case SET
-- รวมยอด FreshQty + ReuseQty ตาม Facility
-- =============================================
CREATE OR ALTER PROCEDURE [trans].[Stored_Get_CaseSET_CuttingTool]
    @Input_Division NVARCHAR(50) = NULL,
    @Input_PartNo NVARCHAR(100) = NULL,
    @Input_Process NVARCHAR(100) = NULL,
    @Input_MC NVARCHAR(100) = NULL,
    @Input_Facility NVARCHAR(50) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    SELECT 
        [Division_Id],
        [Profit_Center],
        [PartNo],
        [ItemNo],
        [ItemName],
        [SPEC],
        [Process],
        [MC],
        [Usage_pcs],
        [Position],
        [DwgRev],
        [ACCOUNT],
        [Facility],
        -- รวมยอด Qty จากทุก Box/Shelf/Rack ให้เหลือบรรทัดเดียว
        SUM([FreshQty]) AS [FreshQty],
        SUM([ReuseQty]) AS [ReuseQty],
        SUM([TotalQty]) AS [TotalQty]
    FROM [viewer].[View_tb_Master_Pur_CuttingTool_PMC_QTY]
    WHERE 
        (@Input_Division IS NULL OR [Division_Id] = @Input_Division)
        AND (@Input_PartNo IS NULL OR [PartNo] = @Input_PartNo)
        AND (@Input_Process IS NULL OR [Process] = @Input_Process)
        AND (@Input_MC IS NULL OR [MC] = @Input_MC)
        AND (@Input_Facility IS NULL OR [Facility] = @Input_Facility)
    GROUP BY 
        [Division_Id],
        [Profit_Center],
        [PartNo],
        [ItemNo],
        [ItemName],
        [SPEC],
        [Process],
        [MC],
        [Usage_pcs],
        [Position],
        [DwgRev],
        [ACCOUNT],
        [Facility]
    ORDER BY [PartNo], [Process], [MC], [ItemNo];
END
GO

-- =============================================
-- Stored Procedure 2: ดึงรายละเอียด Box/Shelf/Rack 
-- สำหรับแสดงใน Popup/Modal
-- =============================================
CREATE OR ALTER PROCEDURE [trans].[Stored_Get_CaseSET_CuttingTool_Detail]
    @Input_Division NVARCHAR(50) = NULL,
    @Input_ItemNo NVARCHAR(100) = NULL,
    @Input_Facility NVARCHAR(50) = NULL,
    @Input_PartNo NVARCHAR(100) = NULL,
    @Input_Process NVARCHAR(100) = NULL,
    @Input_MC NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    SELECT 
        [ItemNo],
        [ItemName],
        [SPEC],
        [PartNo],
        [Process],
        [MC],
        [Position],
        [Facility],
        [FacilityName],
        [BoxName],
        [ShelfName],
        [RackName],
        [FreshQty],
        [ReuseQty],
        [TotalQty]
    FROM [viewer].[View_tb_Master_Pur_CuttingTool_PMC_QTY]
    WHERE 
        (@Input_Division IS NULL OR [Division_Id] = @Input_Division)
        AND (@Input_ItemNo IS NULL OR [ItemNo] = @Input_ItemNo)
        AND (@Input_Facility IS NULL OR [Facility] = @Input_Facility)
        AND (@Input_PartNo IS NULL OR [PartNo] = @Input_PartNo)
        AND (@Input_Process IS NULL OR [Process] = @Input_Process)
        AND (@Input_MC IS NULL OR [MC] = @Input_MC)
    ORDER BY [BoxName], [ShelfName], [RackName];
END
GO
