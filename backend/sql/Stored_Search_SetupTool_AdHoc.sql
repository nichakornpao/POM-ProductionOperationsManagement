-- =============================================
-- Author:      System Generated
-- Create Date: 2026-02-03
-- Description: ค้นหา Setup Tool แบบ Ad-Hoc (ไม่กรอง MC)
--              ใช้สำหรับ Case อื่นที่ไม่ใช่ SET
-- =============================================

USE [db_Tooling]
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE OR ALTER PROCEDURE [trans].[Stored_Search_SetupTool_AdHoc]
    @Input_Division NVARCHAR(50),
    @Input_ItemNo NVARCHAR(100) = NULL,
    @Input_Process NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- ค้นหาจาก Table Setup Tool
    SELECT 
        [Setup_PartNo] AS [PartNo], -- Alias ให้ตรงกับ Frontend
        [Holder_No] AS [ItemNo],
        [Holder_Name] AS [ItemName],
        [Spec] AS [SPEC],
        [Setup_Process] AS [Process],
        [Setup_MC] AS [MC],
        [Position],
        MAX([Usage_pcs]) AS [Usage_pcs],
        
        -- Qty (Setup Tool ส่วนใหญ่เป็น Permanent แต่นับ Qty ได้)
        COUNT(*) AS [QTY] -- หรือใช้ 1 ถ้าต้องการแค่รายการ

    FROM [dbo].[tb_Master_SetupTool_PMC]
    WHERE 
        ([Division_id] = @Input_Division)
        AND (@Input_ItemNo IS NULL OR [Holder_No] LIKE '%' + @Input_ItemNo + '%')
        AND (@Input_Process IS NULL OR [Setup_Process] = @Input_Process)
        -- Setup Tool อาจไม่มี Facility filter แบบละเอียด

    GROUP BY 
        [Setup_PartNo],
        [Holder_No],
        [Holder_Name],
        [Spec],
        [Setup_Process],
        [Setup_MC],
        [Position]

    ORDER BY [Setup_PartNo], [Setup_Process], [Setup_MC];
END
GO
