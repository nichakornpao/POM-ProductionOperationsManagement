USE [db_Tooling]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- =============================================
-- Author:      Antigravity
-- Create date: 2026-02-12
-- Description: บันทึกข้อมูล Request แบบหลายรายการ (Bulk Insert) พร้อมสร้างเลข DocNo/MFGOrder อัตโนมัติ
--              แยกตารางตาม ToolType:
--              1) CuttingTool -> tb_IssueCuttingTool_Request_Document
--              2) SetupTool   -> tb_IssueSetupTool_Request_Document
-- =============================================
CREATE OR ALTER PROCEDURE [trans].[Stored_Insert_Request_Bulk]
    @ItemsJson NVARCHAR(MAX) -- รับข้อมูลเข้ามาเป็น JSON String
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. แปลง JSON เป็นตารางชั่วคราว (Temp Table)
        --    ดึงข้อมูลดิบ (Raw Data) ออกมาก่อน
        SELECT *
        INTO #RawItems
        FROM OPENJSON(@ItemsJson)
        WITH (
            Division    NVARCHAR(50),
            Status      NVARCHAR(50),
            Requester   NVARCHAR(50),
            Fac         INT,
            [CASE]      NVARCHAR(50),
            PartNo      NVARCHAR(50),
            ItemNo      NVARCHAR(50),
            SPEC        NVARCHAR(50),
            Process     NVARCHAR(50),
            MCType      NVARCHAR(50),
            MCNo        NVARCHAR(MAX),
            ON_HAND     INT,
            Req_QTY     INT,
            QTY         INT,
            DueDate     DATE,
            PhoneNo     NVARCHAR(50),
            PathDwg     NVARCHAR(255),
            ItemName    NVARCHAR(200),
            ToolType    NVARCHAR(50)   -- รับค่าว่าเป็น 'CuttingTool' หรือ 'SetupTool'
        );

        -- 2. คำนวณเลขต่างๆ และนำไปใส่ในตาราง #AllItems
        --    เรียกใช้ Function ที่สร้างขึ้นมา เพื่อ Gen เลข DocNo และ MFGOrderNo โดยอัตโนมัติ
        SELECT 
            *,
            [trans].[fn_Generate_Request_DocNo](Division, [CASE], Process, Fac, ISNULL(DueDate, GETDATE())) AS DocNo,
            [trans].[fn_Generate_Request_MFGOrderNo](Division, PartNo, MCType, [CASE], Process, Fac, ISNULL(DueDate, GETDATE())) AS MFGOrderNo,
            FORMAT(ISNULL(DueDate, GETDATE()), 'yyMMdd') AS MR_No -- สร้าง MR_No จาก DueDate (ถ้าไม่มีให้ใช้ GETDATE)
        INTO #AllItems
        FROM #RawItems;

        DECLARE @InsertedCutting INT = 0;
        DECLARE @InsertedSetup INT = 0;

        -- =============================================
        -- 3. บันทึกลงตาราง Cutting Tool (ถ้า type เป็น CuttingTool)
        -- =============================================
        INSERT INTO [dbo].[tb_IssueCuttingTool_Request_Document]
            (DocNo, Status, Requester, Division, Fac, [CASE], PartNo, ItemNo, SPEC, Process, MCType, MCNo, ON_HAND, Req_QTY, QTY, DueDate, PhoneNo, PathDwg, ItemName, MFGOrderNo, MR_No, ToolingType, AS400STATUS)
        SELECT 
            DocNo, Status, Requester, Division, Fac, [CASE], PartNo, ItemNo, SPEC, Process, MCType, MCNo, ON_HAND, Req_QTY, QTY, DueDate, PhoneNo, PathDwg, ItemName, MFGOrderNo, MR_No, 'CuttingTool', 'Wait PH Issue'
        FROM #AllItems
        WHERE ToolType = 'CuttingTool';

        SET @InsertedCutting = @@ROWCOUNT;

        -- =============================================
        -- 4. บันทึกลงตาราง Setup Tool (ถ้า type เป็น SetupTool)
        -- =============================================
        INSERT INTO [dbo].[tb_IssueSetupTool_Request_Document]
            (DocNo, Status, Requester, Division, Fac, [CASE], PartNo, ItemNo, SPEC, Process, MCType, MCNo, ON_HAND, Req_QTY, QTY, DueDate, PhoneNo, ItemName, MFGOrderNo, MR_No, ToolingType, AS400STATUS)
        SELECT 
            DocNo, Status, Requester, Division, Fac, [CASE], PartNo, ItemNo, SPEC, Process, MCType, MCNo, ON_HAND, Req_QTY, QTY, DueDate, PhoneNo, ItemName, MFGOrderNo, MR_No, 'SetupTool', 'Wait PH Issue'
        FROM #AllItems
        WHERE ToolType = 'SetupTool';

        SET @InsertedSetup = @@ROWCOUNT;

        -- 5. ส่งผลลัพธ์กลับไปบอกหน้าบ้าน
        SELECT 
            (@InsertedCutting + @InsertedSetup) AS InsertedCount,
            0 AS CaseSetupCount, 
            @InsertedCutting AS CuttingCount,
            @InsertedSetup AS SetupCount;
        
        -- ลบตารางชั่วคราวทิ้ง
        DROP TABLE #RawItems;
        DROP TABLE #AllItems;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        -- ถ้ามี Error ให้ยกเลิก Transaction ทั้งหมด
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END
GO
