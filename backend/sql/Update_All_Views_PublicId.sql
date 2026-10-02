USE [db_Tooling]
GO

/* ============================================================
   1. อัปเดต View พื้นฐานของ Cutting Tool
   (ใช้โครงสร้าง Join ตามที่คุณส่งมา และเพิ่ม t1.Public_Id)
   ============================================================ */
CREATE OR ALTER VIEW [dbo].[View_CuttingTool_RequestList]
AS
SELECT
    t1.ID_Request, t1.DocNo, t1.Status, t1.Requester, t3.ACCOUNT, t1.Division, t1.Fac,
    t1.[CASE], CASE WHEN t1.[CASE] = 'SET' THEN 'Setup' ELSE 'other' END AS Category,
    t1.PartNo, t1.ItemNo, t1.SPEC, t1.DwgRev, t1.Process, t1.MCType, t1.MCNo,
    t1.Req_QTY, t1.DueDate, t1.Remark, t1.PathDwg, t1.PathLayout, t1.DateComplete,
    t1.QTY, t1.PhoneNo, t1.DateTime_Record, t2.MC_Code, t1.MR_No, t1.MatLot,
    t1.MFGOrderNo, t3.ON_HAND, t1.ItemName,
    t1.Public_Id -- เพิ่ม Public_Id เข้ามาตรงนี้
FROM dbo.tb_IssueCuttingTool_Request_Document AS t1
LEFT OUTER JOIN dbo.tb_Machine_Model AS t2 ON t1.MCType = t2.MC_Name
LEFT OUTER JOIN dbo.View_CuttingTool_User_SUM AS t3 ON t1.Division = t3.Division
    AND t1.PartNo = t3.PartNo COLLATE Thai_CS_AS
    AND t1.Process = t3.Process COLLATE Thai_CS_AS
    AND t1.SPEC = t3.SPEC
    AND t1.MCType = t3.MC COLLATE Thai_CS_AS
GO

/* ============================================================
   2. อัปเดต View พื้นฐานของ Setup Tool
   ============================================================ */
CREATE OR ALTER VIEW [viewer].[View_SetupTool_RequestList] AS
SELECT
    [ID_RequestSetupTool], [MR_No], [MFGOrderNo], [DocNo], [Status], [Requester],
    [Division], [Fac], [CASE], [PartNo], [ItemNoBefore], [ItemNo], [MatLot],
    [SPEC], [DwgRev], [Process], [MCType], [MCNo], [ON_HAND], [Req_QTY],
    [QTY], [DueDate], [DateTime_Record], [Remark], [DateComplete], [PhoneNo], [ItemName],
    [Public_Id] -- คอลัมน์สำคัญ
FROM [db_Tooling].[dbo].[tb_IssueSetupTool_Request_Document]
GO

/* ============================================================
   3. สร้าง Unified View สำหรับประวัติ (เรียกผ่าน View ที่อัปเดตแล้ว)
   ============================================================ */
CREATE OR ALTER VIEW [viewer].[View_RequestList_Complete_History]
AS
SELECT
    Public_Id AS ID_Request, -- ใช้ Public_Id เป็น ID หลักสำหรับหน้าบ้าน
    MR_No, MFGOrderNo, DocNo, Status, Requester, Division, Fac, [CASE], PartNo, ItemNo, MatLot, SPEC,
    Process, MCType, MCNo, ON_HAND, Req_QTY, QTY, DueDate, DateTime_Record, Remark, DateComplete, PhoneNo, ItemName,
    ACCOUNT, 'Cutting' AS ToolType
FROM [dbo].[View_CuttingTool_RequestList]
WHERE Status IN ('Complete', 'CompleteToExcel')

UNION ALL

SELECT
    Public_Id AS ID_Request,
    MR_No, MFGOrderNo, DocNo, Status, Requester, Division, Fac, [CASE], PartNo, ItemNo, MatLot, SPEC,
    Process, MCType, MCNo, ON_HAND, Req_QTY, QTY, DueDate, DateTime_Record, Remark, DateComplete, PhoneNo, ItemName,
    NULL AS ACCOUNT, 'Setup' AS ToolType
FROM [viewer].[View_SetupTool_RequestList]
WHERE Status IN ('Complete', 'CompleteToExcel')
GO

/* ============================================================
   4. อัปเดต View สำหรับ Case Setup (สำหรับหน้า Detail Case Setup)
   ============================================================ */
CREATE OR ALTER VIEW [viewer].[View_CaseSetup_Request]
AS
-- ดึงข้อมูลจากตาราง Cutting Tool
SELECT
    'CuttingTool' AS SourceTable,
    [ID_Request] AS OriginalID,
    [DocNo], [MR_No], [MFGOrderNo], [Status], [Requester], [Division], [Fac],
    [CASE], [PartNo], [ItemNo], [ItemName], [MatLot], [SPEC], [DwgRev],
    [Process], [MCType], [MCNo], [ON_HAND], [Req_QTY], [QTY], [DueDate],
    [DateTime_Record], [Remark], [Unique_Id], [DateComplete], [PhoneNo], [ToolingType],
    [Public_Id], [STOCK_ON_HAND], [MASTER_ACCOUNT], [MAIN_LOCATION], [Status_To_PH], [After_DueDate], [Date_Status_PH]
FROM [viewer].[View_IssueCuttingTool_Request_Document] WHERE [CASE] = 'SET'

UNION ALL

-- ดึงข้อมูลจากตาราง Setup Tool
SELECT
    'SetupTool' AS SourceTable,
    [ID_RequestSetupTool] AS OriginalID,
    [DocNo], [MR_No], [MFGOrderNo], [Status], [Requester], [Division], [Fac],
    [CASE], [PartNo], [ItemNo], [ItemName], [MatLot], [SPEC], [DwgRev],
    [Process], [MCType], [MCNo], [ON_HAND], [Req_QTY], [QTY], [DueDate],
    [DateTime_Record], [Remark], [Unique_Id], [DateComplete], [PhoneNo], [ToolingType],
    [Public_Id], [STOCK_ON_HAND], [MASTER_ACCOUNT], [MAIN_LOCATION], [Status_To_PH], [After_DueDate], [Date_Status_PH]
FROM [viewer].[View_IssueSetupTool_Request_Document] WHERE [CASE] = 'SET'
GO
