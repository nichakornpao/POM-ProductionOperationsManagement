USE [db_Tooling]
GO

/****** Object:  View [viewer].[View_RequestList_Complete_History] ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE OR ALTER VIEW [viewer].[View_RequestList_Complete_History]
AS
SELECT
    Public_Id AS ID_Request, -- ใช้ Public_Id เป็น ID หลักสำหรับหน้าบ้าน
    MR_No, MFGOrderNo, DocNo, Status, Requester, Division, Fac, [CASE], PartNo, ItemNo, MatLot, SPEC,
    Process, MCType, MCNo, ON_HAND, Req_QTY, QTY, DueDate, DateTime_Record, Remark, DateComplete, PhoneNo, ItemName,
    ACCOUNT, 'Cutting' AS ToolType,
    ID_Request AS OriginalID, -- เก็บ ID เดิมไว้เผื่อต้องการอ้างอิง
    AS400STATUS
FROM [db_Tooling].[dbo].[tb_IssueCuttingTool_Request_Document]
WHERE Status IN ('Complete', 'CompleteToExcel')

UNION ALL

SELECT
    Public_Id AS ID_Request, -- ใช้ Public_Id เป็น ID หลักสำหรับหน้าบ้าน
    MR_No, MFGOrderNo, DocNo, Status, Requester, Division, Fac, [CASE], PartNo, ItemNo, MatLot, SPEC,
    Process, MCType, MCNo, ON_HAND, Req_QTY, QTY, DueDate, DateTime_Record, Remark, DateComplete, PhoneNo, ItemName,
    NULL AS ACCOUNT, 'Setup' AS ToolType,
    ID_RequestSetupTool AS OriginalID, -- เก็บ ID เดิมไว้เผื่อต้องการอ้างอิง
    AS400STATUS
FROM [db_Tooling].[viewer].[tb_IssueSetupTool_Request_Document]
WHERE Status IN ('Complete', 'CompleteToExcel')
GO
