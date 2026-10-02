USE [db_Tooling]
GO

SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

ALTER VIEW [dbo].[View_CuttingTool_RequestList]
AS
SELECT        
    T1.ID_Request, 
    T1.DocNo, 
    T1.Requester, 
    T1.PartNo, 
    T1.ItemNo, 
    T1.SPEC, 
    T1.Process, 
    T1.MCType, 
    T1.PathDwg, 
    T1.ON_HAND, 
    T1.Req_QTY, 
    T1.QTY, 
    T1.DueDate, 
    T1.CASE AS [CASE], 
    T1.Status, 
    T1.PathLayout, 
    T1.Remark, 
    T1.PhoneNo, 
    T1.Fac, 
    T1.Division, 
    T1.DateTime_Record,
    T1.MatLot,      -- New Column
    T1.MR_No,       -- New Column
    T1.MFGOrderNo   -- New Column
FROM            
    dbo.tb_IssueCuttingTool_Request_Document AS T1
GO
