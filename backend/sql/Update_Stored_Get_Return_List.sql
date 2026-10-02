USE [db_Tooling]
GO

SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

-- Description:	ดึงข้อมูลรายการคืนสินค้า (Return List) สำหรับแสดงผลในหน้าเว็บ
--              (แสดงเฉพาะรายการที่ยังไม่ Complete)
ALTER PROCEDURE [trans].[Stored_Get_Return_List]
AS
BEGIN
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
        Remark,
        Return_Date,
        DateTime_Record,
        DateComplete,
        Status
    FROM [master].[tb_Return_List]
    ORDER BY DateTime_Record ASC;
END
GO
