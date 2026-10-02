USE [db_Tooling]
GO

-- =============================================
-- SP #1: trans.Stored_Get_SmartRack
-- =============================================
-- Author:      Jirachoke/Trainee
-- Create date: 2026-03-12
-- Description: ดึงข้อมูล SmartRack ทั้งหมดจาก View_CuttingTool_SmartRack เพื่อแสดงผลในหน้า Analyze SmartRack
-- =============================================
CREATE OR ALTER PROCEDURE [trans].[Stored_Get_SmartRack]
AS
BEGIN
    SET NOCOUNT ON;
    SELECT * FROM [dbo].[View_CuttingTool_SmartRack];
END
GO

-- =============================================
-- SP #2: trans.Stored_Get_Cost_Analyze
-- =============================================
-- Author:      Jirachoke/Trainee
-- Create date: 2026-03-12
-- Description: ดึงข้อมูลสรุปค่าใช้จ่ายการเบิกจ่าย Tooling ทั้งหมดจาก View_Cost_Analyze_Complete เพื่อแสดงผลในหน้า Dashboard และ Cost Analyze
-- =============================================
CREATE OR ALTER PROCEDURE [trans].[Stored_Get_Cost_Analyze]
AS
BEGIN
    SET NOCOUNT ON;
    SELECT * FROM [db_Tooling].[viewer].[View_Cost_Analyze_Complete];
END
GO

-- =============================================
-- SP #3: trans.Stored_Get_UserHistory
-- =============================================
-- Author:      Jirachoke/Trainee
-- Create date: 2026-03-12
-- Description: ดึงข้อมูลประวัติการเบิกเครื่องมือตัดทั้งหมดจากตาราง tb_IssueCuttingTool_Request_Document
-- =============================================
CREATE OR ALTER PROCEDURE [trans].[Stored_Get_UserHistory]
AS
BEGIN
    SET NOCOUNT ON;
    SELECT * FROM [dbo].[tb_IssueCuttingTool_Request_Document];
END
GO

-- =============================================
-- SP #4: trans.Stored_Get_EmpPermissionPrint
-- =============================================
-- Author:      Jirachoke/Trainee
-- Create date: 2026-03-12
-- Description: ดึงรายชื่อพนักงาน (Employee_ID) ที่มีสิทธิ์พิมพ์เอกสารจากตาราง tb_Emp_PermissionPrint
-- =============================================
CREATE OR ALTER PROCEDURE [trans].[Stored_Get_EmpPermissionPrint]
AS
BEGIN
    SET NOCOUNT ON;
    SELECT Employee_ID FROM [dbo].[tb_Emp_PermissionPrint];
END
GO

-- =============================================
-- SP #5: trans.Stored_Check_PrintPermission
-- =============================================
-- Author:      Jirachoke/Trainee
-- Create date: 2026-03-12
-- Description: ตรวจสอบว่าพนักงานรายบุคคลมีสิทธิ์พิมพ์เอกสารหรือไม่ โดยรับ Employee_ID แล้วนับจำนวนแถวที่ตรงกัน
-- =============================================
CREATE OR ALTER PROCEDURE [trans].[Stored_Check_PrintPermission]
    @Employee_ID NVARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT COUNT(*) AS [count]
    FROM [dbo].[tb_Emp_PermissionPrint]
    WHERE Employee_ID = @Employee_ID;
END
GO

-- =============================================
-- SP #6: trans.Stored_Get_HistoryPrint
-- =============================================
-- Author:      Jirachoke/Trainee
-- Create date: 2026-03-12
-- Description: ดึงข้อมูลประวัติการพิมพ์เอกสารทั้งหมดจากตาราง tb_Cuttingtool_HistoryPrint
-- =============================================
CREATE OR ALTER PROCEDURE [trans].[Stored_Get_HistoryPrint]
AS
BEGIN
    SET NOCOUNT ON;
    SELECT * FROM [dbo].[tb_Cuttingtool_HistoryPrint];
END
GO

-- =============================================
-- SP #7: trans.Stored_Get_AllEmployees
-- =============================================
-- Author:      Jirachoke/Trainee
-- Create date: 2026-03-12
-- Description: ดึงข้อมูลพนักงานทั้งหมดจาก View_CuttingTool_Employee เพื่อแสดงในหน้าจัดการผู้ใช้งาน
-- =============================================
CREATE OR ALTER PROCEDURE [trans].[Stored_Get_AllEmployees]
AS
BEGIN
    SET NOCOUNT ON;
    SELECT * FROM [db_Tooling].[dbo].[View_CuttingTool_Employee];
END
GO

-- =============================================
-- SP #8: trans.Stored_Get_PurchaseRequest
-- =============================================
-- Author:      Jirachoke/Trainee
-- Create date: 2026-03-12
-- Description: ดึงข้อมูลรายการขอเบิก Cutting Tool และ Setup Tool รวมกัน เรียงตามวันที่ล่าสุดก่อน เพื่อแสดงในหน้า Purchase Request
-- =============================================
CREATE OR ALTER PROCEDURE [trans].[Stored_Get_PurchaseRequest]
AS
BEGIN
    SET NOCOUNT ON;

    -- Recordset 1: Cutting Tool
    SELECT *, 'Cutting' AS ToolingType
    FROM [db_Tooling].[viewer].[View_IssueCuttingTool_Request_Document]
    ORDER BY DateTime_Record DESC;

    -- Recordset 2: Setup Tool
    SELECT *, 'Setup' AS ToolingType
    FROM [db_Tooling].[viewer].[View_IssueSetupTool_Request_Document]
    ORDER BY DateTime_Record DESC;
END
GO

-- =============================================
-- SP #9: trans.Stored_Get_CartItems
-- =============================================
-- Author:      Jirachoke/Trainee
-- Create date: 2026-03-12
-- Description: ดึงข้อมูลรายการทั้งหมดในตะกร้าสินค้าจากตาราง tb_IssueCuttingTool_SendToCart
-- =============================================
CREATE OR ALTER PROCEDURE [trans].[Stored_Get_CartItems]
AS
BEGIN
    SET NOCOUNT ON;
    SELECT * FROM [dbo].[tb_IssueCuttingTool_SendToCart];
END
GO

-- =============================================
-- SP #10: trans.Stored_Get_MasterPH_Values
-- =============================================
-- Author:      Jirachoke/Trainee
-- Create date: 2026-03-12
-- Description: ดึงข้อมูล Master PH ตามประเภท (PMC หรือ GM) โดยรับพารามิเตอร์ @Type เพื่อเลือกตารางที่จะดึงข้อมูล พร้อม JOIN กับตาราง Spec
-- =============================================
CREATE OR ALTER PROCEDURE [trans].[Stored_Get_MasterPH_Values]
    @Type NVARCHAR(10) = 'pmc'
AS
BEGIN
    SET NOCOUNT ON;

    IF @Type = 'gm'
    BEGIN
        SELECT 
             a.[PHGM_ID]
            ,a.[Division_Id]
            ,a.[ItemNo]
            ,a.[ItemName]
            ,a.[Spec_ID]
            ,b.[Spec] AS Spec
            ,a.[DW]
            ,a.[ClassCode]
            ,a.[ItemType]
            ,a.[Dept]
            ,a.[ProductCode]
            ,a.[Source Code] AS SourceCode
            ,a.[Organisation]
            ,a.[ItemClass]
            ,a.[Commodity]
            ,a.[CL]
            ,a.[AccountCode]
            ,a.[StockType]
            ,a.[MainWH]
            ,a.[StockLoc]
            ,a.[MatL_Type]
            ,a.[StockUnit]
            ,a.[PurchaseUnit1]
            ,a.[Conversion1]
            ,a.[PurchaseUnit2]
            ,a.[Conversion2]
            ,a.[WC_Code]
            ,a.[ModelGroup]
            ,a.[PayDuty]
            ,a.[Line]
            ,a.[HardAllocation]
            ,a.[ECN]
            ,a.[OrderPolicy]
            ,a.[OrderPoint]
            ,a.[WOS]
            ,a.[SaftyCode]
            ,a.[MakerCode]
            ,a.[MakerName]
            ,a.[MakerSpec]
            ,a.[WPC_No]
            ,a.[Vendor]
            ,a.[VendorName]
            ,a.[UnitPrice]
            ,a.[Currency]
            ,a.[PurLeadtime]
            ,a.[Standard_Qty]
            ,a.[BasicOrder]
            ,a.[MaxximumOrder]
            ,a.[MinimumOrder]
            ,a.[Yield]
            ,a.[BOI_Code]
            ,a.[Remark]
            ,a.[SaftyStock]
            ,a.[OrderBal]
            ,a.[Allocated]
            ,a.[OnHand]
            ,a.[PendingCode]
            ,a.[ReasonPending]
            ,a.[Last_Issued]
            ,a.[Last_StockIn]
            ,a.[Last_Maint]
            ,a.[Time]
            ,a.[Operator]
            ,a.[FileName]
            ,a.[ModifyDate]
        FROM [db_Tooling].[master].[tb_Purchase_Item_Master_GM] a
        LEFT JOIN [master].[tb_Spec_GM] b ON a.Spec_ID = b.Spec_ID;
    END
    ELSE
    BEGIN
        SELECT 
             a.[Division_Id]
            ,a.[ItemNo]
            ,a.[ItemName]
            ,a.[Spec_ID]
            ,b.[Spec] AS Spec
            ,a.[DW]
            ,a.[ClassCode]
            ,a.[ItemType]
            ,a.[Dept]
            ,a.[ProductCode]
            ,a.[Source Code] AS SourceCode
            ,a.[Organisation]
            ,a.[ItemClass]
            ,a.[Commodity]
            ,a.[CL]
            ,a.[AccountCode]
            ,a.[StockType]
            ,a.[MainWH]
            ,a.[StockLoc]
            ,a.[MatL_Type]
            ,a.[StockUnit]
            ,a.[PurchaseUnit1]
            ,a.[Conversion1]
            ,a.[PurchaseUnit2]
            ,a.[Conversion2]
            ,a.[WC_Code]
            ,a.[ModelGroup]
            ,a.[PayDuty]
            ,a.[Line]
            ,a.[HardAllocation]
            ,a.[ECN]
            ,a.[OrderPolicy]
            ,a.[OrderPoint]
            ,a.[WOS]
            ,a.[SaftyCode]
            ,a.[MakerCode]
            ,a.[MakerName]
            ,a.[MakerSpec]
            ,a.[WPC_No]
            ,a.[Vendor]
            ,a.[VendorName]
            ,a.[UnitPrice]
            ,a.[Currency]
            ,a.[PurLeadtime]
            ,a.[Standard_Qty]
            ,a.[BasicOrder]
            ,a.[MaxximumOrder]
            ,a.[MinimumOrder]
            ,a.[Yield]
            ,a.[BOI_Code]
            ,a.[Remark]
            ,a.[SaftyStock]
            ,a.[OrderBal]
            ,a.[Allocated]
            ,a.[OnHand]
            ,a.[PendingCode]
            ,a.[ReasonPending]
            ,a.[Last_Issued]
            ,a.[Last_StockIn]
            ,a.[Last_Maint]
            ,a.[Time]
            ,a.[Operator]
            ,a.[FileName]
            ,a.[ModifyDate]
        FROM [db_Tooling].[master].[tb_Purchase_Item_Master_PMC] a
        LEFT JOIN [master].[tb_Spec_PMC] b ON a.Spec_ID = b.Spec_ID;
    END
END
GO

-- =============================================
-- SP #11: trans.Stored_Get_ReturnList
-- =============================================
-- Author:      Jirachoke/Trainee
-- Create date: 2026-03-12
-- Description: ดึงข้อมูลรายการคืนเครื่องมือทั้งหมดจากตาราง tb_Return_List เรียงตาม Return_ID ล่าสุดก่อน
-- =============================================
CREATE OR ALTER PROCEDURE [trans].[Stored_Get_ReturnList]
AS
BEGIN
    SET NOCOUNT ON;
    SELECT 
        Return_ID, 
        Doc_No, 
        Employee_ID, 
        Return_By, 
        Division, 
        Process, 
        Facility, 
        Phone_No, 
        ItemNo, 
        PartNo, 
        ItemName, 
        Spec, 
        QTY, 
        Used_Qty, 
        Remark, 
        Return_Date, 
        DateTime_Record, 
        DateComplete, 
        Status
    FROM [db_Tooling].[master].[tb_Return_List]
    ORDER BY Return_ID DESC;
END
GO
