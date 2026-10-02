USE [db_Tooling]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- =============================================
-- Author:      Antigravity
-- Create date: 2026-03-05
-- Description: รวม Stored Procedures สำหรับหน้า Detail Purchase Request
--              ย้าย inline query จาก Node.js controller มาเป็น SP
-- =============================================

-- =============================================
-- 1) ดึงข้อมูลรายการเบิกเครื่องมือตัด (Cutting Tool)
-- =============================================
CREATE OR ALTER PROCEDURE [trans].[Stored_Detail_Purchase]
AS
BEGIN
    SET NOCOUNT ON;
    SELECT T1.*, T2.MCT_MachineTypeCode
    FROM [db_Tooling].[viewer].[View_IssueCuttingTool_Request_Document] T1
    LEFT JOIN [db_SmartCuttingTool_PMA].[viewer].[tb_MachineType] T2 
        ON T1.MCType = T2.MCT_MachineTypeName COLLATE Thai_CI_AS 
    WHERE (T1.Status IN ('Waiting','In Progress', 'Complete', 'CompletetoExcel')) 
        AND T1.DateTime_Record >= DATEADD(day, -90, GETDATE())
    ORDER BY T1.DateTime_Record ASC;
END
GO

-- =============================================
-- 2) ดึงข้อมูลรายการเบิกเครื่องมือติดตั้ง (Setup Tool)
-- =============================================
CREATE OR ALTER PROCEDURE [trans].[Stored_Detail_Purchase_Setup]
AS
BEGIN
    SET NOCOUNT ON;
    SELECT *
    FROM [db_Tooling].[viewer].[View_IssueSetupTool_Request_Document]
    WHERE Status IN ('Waiting','In Progress', 'Complete', 'CompletetoExcel') 
        AND DateTime_Record >= DATEADD(day, -90, GETDATE())
        AND ([CASE] IS NULL OR [CASE] != 'SET')
    ORDER BY DateTime_Record ASC;
END
GO

-- =============================================
-- 3) ดึงข้อมูลรายการ Case Setup
-- =============================================
CREATE OR ALTER PROCEDURE [trans].[Stored_Detail_CaseSetup]
AS
BEGIN
    SET NOCOUNT ON;
    SELECT *
    FROM [db_Tooling].[viewer].[View_CaseSetup_Request]
    WHERE Status IN ('Waiting','In Progress', 'Complete', 'CompletetoExcel')
        AND DateTime_Record >= DATEADD(day, -90, GETDATE())
    ORDER BY DueDate ASC;
END
GO

-- =============================================
-- 4) ค้นหารายการเครื่องมือทั้งหมดในคลัง (Item Master)
-- =============================================
CREATE OR ALTER PROCEDURE [trans].[Stored_Get_ItemNo]
AS
BEGIN
    SET NOCOUNT ON;
    SELECT * FROM [db_Tooling].[viewer].[View_tb_Master_Purchase_SUM_ALL];
END
GO

-- =============================================
-- 5) ลบรายการขอเบิกเครื่องมือ
-- =============================================
CREATE OR ALTER PROCEDURE [trans].[Stored_Delete_Request]
    @ID INT
AS
BEGIN
    SET NOCOUNT ON;
    DELETE FROM [dbo].[tb_IssueCuttingTool_Request_Document] WHERE ID_Request = @ID;
END
GO

-- =============================================
-- 6) สร้างรายการขอเบิกใหม่ (Insert Single Request)
--    ใช้ fn_Generate_Request_DocNo / fn_Generate_Request_MFGOrderNo ที่มีอยู่แล้ว
-- =============================================
CREATE OR ALTER PROCEDURE [trans].[Stored_Add_New_Request]
    @Division   NVARCHAR(50),
    @Status     NVARCHAR(50),
    @Requester  NVARCHAR(50),
    @Fac        INT,
    @CASE       NVARCHAR(50),
    @PartNo     NVARCHAR(50),
    @ItemNo     NVARCHAR(50)   = NULL,
    @SPEC       NVARCHAR(50),
    @Process    NVARCHAR(50),
    @MCType     NVARCHAR(50),
    @ON_HAND    INT            = 0,
    @Req_QTY    INT            = 0,
    @QTY        INT            = 0,
    @DueDate    DATETIME       = NULL,
    @PathDwg    NVARCHAR(255)  = NULL,
    @PathLayout NVARCHAR(255)  = NULL,
    @Remark     NVARCHAR(MAX)  = NULL,
    @PhoneNo    INT            = NULL,
    @ItemName   NVARCHAR(255)  = NULL
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRY
        -- 1. ถ้าไม่มี ItemNo ให้หาจาก SPEC
        IF @ItemNo IS NULL OR @ItemNo = ''
        BEGIN
            SELECT TOP 1 @ItemNo = ItemNo 
            FROM [dbo].[tb_IssueCuttingTool_Request_Document] 
            WHERE SPEC = @SPEC;

            IF @ItemNo IS NULL
            BEGIN
                RAISERROR('ItemNo not found in database.', 16, 1);
                RETURN;
            END
        END

        -- 2. สร้างเลข DocNo และ MFGOrderNo ด้วย Function ที่มีอยู่แล้ว
        DECLARE @DocNo NVARCHAR(50) = [trans].[fn_Generate_Request_DocNo](@Division, @CASE, @Process, @Fac, GETDATE());
        DECLARE @MFGOrderNo NVARCHAR(50) = [trans].[fn_Generate_Request_MFGOrderNo](@Division, @PartNo, @MCType, @CASE, @Process, @Fac, GETDATE());
        DECLARE @MR_No NVARCHAR(20) = FORMAT(GETDATE(), 'yyMMdd');

        -- 3. ตัด ItemName ให้ไม่เกิน 255 ตัวอักษร
        SET @ItemName = LEFT(ISNULL(@ItemName, ''), 255);
        IF @ItemName = '' SET @ItemName = NULL;

        -- 4. INSERT ลงตาราง
        INSERT INTO [dbo].[tb_IssueCuttingTool_Request_Document]
            (DocNo, Division, Requester, PartNo, ItemNo, SPEC, Process, MCType, Fac, 
             PathDwg, ON_HAND, Req_QTY, QTY, DueDate, [CASE], Status, PathLayout, 
             Remark, PhoneNo, MFGOrderNo, MR_No, ItemName, AS400STATUS)
        OUTPUT INSERTED.ID_Request
        VALUES
            (@DocNo, @Division, @Requester, @PartNo, @ItemNo, @SPEC, @Process, @MCType, @Fac,
             @PathDwg, @ON_HAND, @Req_QTY, @QTY, @DueDate, @CASE, @Status, @PathLayout,
             @Remark, @PhoneNo, @MFGOrderNo, @MR_No, @ItemName, 'Wait PH Issue');
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END
GO
