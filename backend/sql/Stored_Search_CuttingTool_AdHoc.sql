-- =============================================
-- Author:      System Generated
-- Create Date: 2026-02-03
-- Description: ค้นหา Cutting Tool แบบ Ad-Hoc (ไม่กรอง MC)
--              ใช้สำหรับ Case อื่นที่ไม่ใช่ SET (USA, BRO, etc.)
-- =============================================

USE [db_Tooling]
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE OR ALTER PROCEDURE [trans].[Stored_Search_CuttingTool_AdHoc]
    @Input_Division NVARCHAR(50),
    @Input_FacilityName NVARCHAR(50) = NULL,
    @Input_ItemNo NVARCHAR(100) = NULL,
    @Input_Process NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- ค้นหาจาก View หลัก (เหมือน Case SET แต่กรองละเอียดกว่า)
    SELECT 
        MAX([Division_Id]) AS [Division_Id],
        MAX([Profit_Center]) AS [Profit_Center],
        [PartNo],
        [ItemNo],
        MAX([ItemName]) AS [ItemName],
        [SPEC],
        [Process],
        [MC],         -- ยังแสดง MC เพื่อให้ User เห็นข้อมูล
        MAX([Usage_pcs]) AS [Usage_pcs],
        [Position],
        MAX([DwgRev]) AS [DwgRev],
        MAX([ACCOUNT]) AS [ACCOUNT],
        
        -- รวมยอด Qty (ถ้าเจอหลาย record ที่ซ้ำกันใน Group นี้)
        ISNULL(SUM([FreshQty]), 0) AS [FreshQty],
        ISNULL(SUM([ReuseQty]), 0) AS [ReuseQty],
        ISNULL(SUM([TotalQty]), 0) AS [TotalQty]

    FROM [viewer].[View_tb_Master_Pur_CuttingTool_PMC_QTY]
    WHERE 
        ([Division_Id] = @Input_Division)
        AND (@Input_ItemNo IS NULL OR [ItemNo] LIKE '%' + @Input_ItemNo + '%') -- กรองด้วย ItemNo (LIKE)
        AND (@Input_Process IS NULL OR [Process] = @Input_Process)
        -- Facility: ถ้าส่งมา = กรอง แต่รวม NULL ด้วย (เพื่อให้เห็นของใน Stock) 
        -- หรือถ้าต้องการเฉพาะ Facility นั้นจริงๆ ก็ตัด OR IS NULL ออก
        -- (Logic เดิม Case SET คือรวม NULL ด้วย แต่นี่ Ad-Hoc อาจจะเคร่งครัดกว่า?)
        -- เอาแบบ Flexible: ถ้า FacilityName ตรง หรือ เป็น NULL (ของส่วนกลาง?) 
        AND (
            @Input_FacilityName IS NULL 
            OR @Input_FacilityName = '' 
            OR [FacilityName] LIKE '%' + @Input_FacilityName
            OR [FacilityName] IS NULL
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
