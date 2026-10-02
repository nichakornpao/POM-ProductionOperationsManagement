-- =============================================
-- Author:      System Generated
-- Create Date: 2026-01-31
-- Description: Stored Procedures สำหรับ Dropdown ของ Case SET
--              ใช้กับ View_tb_Master_Pur_CuttingTool_PMC_QTY
-- =============================================

USE [db_Tooling]
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- =============================================
-- 1. Dropdown PartNo สำหรับ Case SET
-- =============================================
CREATE OR ALTER PROCEDURE [trans].[Stored_Get_CaseSET_Dropdown_PartNo]
    @Input_Division NVARCHAR(50) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    SELECT DISTINCT [PartNo]
    FROM [viewer].[View_tb_Master_Pur_CuttingTool_PMC_QTY]
    WHERE (@Input_Division IS NULL OR [Division_Id] = @Input_Division)
    ORDER BY [PartNo];
END
GO

-- =============================================
-- 2. Dropdown Process สำหรับ Case SET
-- =============================================
CREATE OR ALTER PROCEDURE [trans].[Stored_Get_CaseSET_Dropdown_Process]
    @Input_Division NVARCHAR(50) = NULL,
    @Input_PartNo NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    SELECT DISTINCT [Process]
    FROM [viewer].[View_tb_Master_Pur_CuttingTool_PMC_QTY]
    WHERE (@Input_Division IS NULL OR [Division_Id] = @Input_Division)
      AND (@Input_PartNo IS NULL OR [PartNo] = @Input_PartNo)
    ORDER BY [Process];
END
GO

-- =============================================
-- 3. Dropdown Machine Type (MC) สำหรับ Case SET
-- =============================================
CREATE OR ALTER PROCEDURE [trans].[Stored_Get_CaseSET_Dropdown_MC]
    @Input_Division NVARCHAR(50) = NULL,
    @Input_PartNo NVARCHAR(100) = NULL,
    @Input_Process NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    SELECT DISTINCT [MC]
    FROM [viewer].[View_tb_Master_Pur_CuttingTool_PMC_QTY]
    WHERE (@Input_Division IS NULL OR [Division_Id] = @Input_Division)
      AND (@Input_PartNo IS NULL OR [PartNo] = @Input_PartNo)
      AND (@Input_Process IS NULL OR [Process] = @Input_Process)
    ORDER BY [MC];
END
GO
