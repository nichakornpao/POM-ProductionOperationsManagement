-- =============================================
-- Debug Script: Test User's Stored Procedure
-- =============================================
USE [db_Tooling]
GO

DECLARE @Input_Division NVARCHAR(50) = '7122' -- Assuming this is the PC passed
DECLARE @Input_ItemNo NVARCHAR(100) = 'P125214A'
DECLARE @Input_FacilityName NVARCHAR(100) = 'F.4'
DECLARE @Input_PartNo NVARCHAR(100) = 'IPMA-10-029A TIALN REV.NR' -- From spec in screenshot? Wait, spec is different from PartNo?
-- In screenshot: ITEM NO: P125214A, SPEC: IPMA-10-029A TIALN REV.NR, FACILITY: F.4
-- Wait, SPEC in screenshot is 'IPMA-10-029A TIALN REV.NR'.
-- Usually PartNo is something like 'A123'.

PRINT '>>> Checking VIEW content for ItemNo'
SELECT TOP 10 * 
FROM [viewer].[View_tb_Master_Pur_CuttingTool_PMC_QTY]
WHERE [ItemNo] = @Input_ItemNo

PRINT '>>> Checking if Profit_Center column exists in View'
-- (Simple way: select it and see if it fails)
SELECT TOP 1 [Profit_Center] FROM [viewer].[View_tb_Master_Pur_CuttingTool_PMC_QTY]
GO
