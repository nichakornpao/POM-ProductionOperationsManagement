USE [db_Tooling]
GO

/****** Object:  View [dbo].[View_Unified_Tool_History] ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE OR ALTER VIEW [dbo].[View_Unified_Tool_History]
AS
SELECT 
    ID_Request, 
    MR_No, 
    MFGOrderNo, 
    DocNo, 
    Status, 
    Requester, 
    Division, 
    Fac, 
    [CASE], 
    PartNo, 
    ItemNo, 
    MatLot, 
    SPEC, 
    Process, 
    MCType, 
    MCNo, 
    ON_HAND, 
    Req_QTY, 
    QTY, 
    DueDate, 
    DateTime_Record, 
    Remark, 
    DateComplete, 
    PhoneNo, 
    ItemName,
    ACCOUNT, 
    'Cutting' AS ToolType
FROM [db_Tooling].[dbo].[View_CuttingTool_RequestList]

UNION ALL

SELECT 
    ID_RequestSetupTool AS ID_Request, 
    MR_No, 
    MFGOrderNo, 
    DocNo, 
    Status, 
    Requester, 
    Division, 
    Fac, 
    [CASE], 
    PartNo, 
    ItemNo, 
    MatLot, 
    SPEC, 
    Process, 
    MCType, 
    MCNo, 
    ON_HAND, 
    Req_QTY, 
    QTY, 
    DueDate, 
    DateTime_Record, 
    Remark, 
    DateComplete, 
    PhoneNo, 
    ItemName,
    NULL AS ACCOUNT, 
    'Setup' AS ToolType
FROM [db_Tooling].[viewer].[View_SetupTool_RequestList]
GO
