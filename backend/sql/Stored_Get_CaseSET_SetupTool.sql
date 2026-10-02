-- =============================================
-- Author:      System Generated
-- Create Date: 2026-02-03
-- Description: ดึงข้อมูล SetupTool สำหรับ Case SET
--              ใช้ DISTINCT เพื่อลบข้อมูลซ้ำ
-- =============================================

USE [db_Tooling]
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE OR ALTER PROCEDURE [trans].[Stored_Get_CaseSET_SetupTool]
    @Input_Division NVARCHAR(50) = NULL,
    @Input_PartNo NVARCHAR(100) = NULL,
    @Input_Process NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    SELECT DISTINCT
        [Division_Id],
        [Profit_Center],
        [PartNo],
        [Holder_No] AS [ItemNo],        -- Map: Holder_No -> ItemNo
        [Holder_Name] AS [ItemName],    -- Map: Holder_Name -> ItemName
        [SPEC],
        [Process],
        [MC],
        [Position],
        [DwgRev],
        [ACCOUNT],
        [VENDOR_NAME],
        [UNIT_PRICE],
        [CURRENCY],
        [Brand],
        [ON_HAND],
        [SAFETY_STOCK],
        [UNIT],
        [REMARK]
    FROM [viewer].[View_tb_Master_Pur_SetupTool_PMC]
    WHERE 
        (@Input_Division IS NULL OR [Division_Id] = @Input_Division)
        AND (@Input_PartNo IS NULL OR [PartNo] = @Input_PartNo)
        AND (@Input_Process IS NULL OR [Process] = @Input_Process)
    ORDER BY [PartNo], [Process], [Holder_No];
END
GO
