-- ==========================================================
-- Update Stored Procedure: Stored_Insert_Request_Bulk
-- Purpose: Add Unique_Id support so the plan's Unique_Id is
--          carried through from PlanList -> Request page ->
--          into both CuttingTool and SetupTool request tables.
-- Column type: [Unique_Id] [uniqueidentifier] NULL (already exists in both tables)

-- Update Stored Procedure: Stored_Insert_Request_Bulk
-- Purpose: GETDATE() use realtime send to database change to use variable CurrentTime instead send realtime
--          Protect lack item time different
-- Column type: [DateTime_Record]
-- ==========================================================
USE [db_Tooling]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- =============================================
-- Author:      Suttichai/Trainee
-- Update Author: Aon/Trainee
-- Create date: 2026-02-12
-- Update date: 2026-05-31
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

        DECLARE @CurrentTime DATETIME = GETDATE();

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
            ToolType    NVARCHAR(50),  -- รับค่าว่าเป็น 'CuttingTool' หรือ 'SetupTool'
            Unique_Id   NVARCHAR(36)   -- รับ Unique_Id ที่หน้าบ้านส่งมา (Raw UUID)
        );

        -- 2. คำนวณเลขต่างๆ และนำไปใส่ในตาราง #AllItems
        SELECT
            r.*,
            [trans].[fn_Generate_Request_DocNo](r.Division, r.[CASE], r.Process, r.Fac, ISNULL(r.DueDate, @CurrentTime)) AS DocNo,
            [trans].[fn_Generate_Request_MFGOrderNo](r.Division, r.PartNo, r.MCType, r.[CASE], r.Process, r.Fac, ISNULL(r.DueDate, @CurrentTime)) AS MFGOrderNo,
            FORMAT(ISNULL(r.DueDate, @CurrentTime), 'yyMMdd') AS MR_No,
            -- แปลงข้อมูล Unique_Id NVARCHAR เป็น UNIQUEIDENTIFIER ให้ตรงชนิดข้อมูลของตาราง
            TRY_CAST(
                CASE
                    WHEN LTRIM(RTRIM(ISNULL(r.Unique_Id, ''))) = '' THEN NULL
                    ELSE r.Unique_Id
                END
            AS UNIQUEIDENTIFIER) AS Unique_Id_Cast,
            -- คำนวณ MCNo6Digit = MC_Code + First(MCNo)
            ISNULL((SELECT TOP 1 MC_Code FROM [dbo].[tb_Machine_Model] WHERE LTRIM(RTRIM(MC_Name)) = LTRIM(RTRIM(r.MCType))), '') + 
            SUBSTRING(
                REPLACE(REPLACE(ISNULL(r.MCNo, ''), '-', ','), ' ', ''), 
                1, 
                CASE 
                    WHEN CHARINDEX(',', REPLACE(REPLACE(ISNULL(r.MCNo, ''), '-', ','), ' ', '')) > 0 
                    THEN CHARINDEX(',', REPLACE(REPLACE(ISNULL(r.MCNo, ''), '-', ','), ' ', '')) - 1 
                    ELSE LEN(REPLACE(REPLACE(ISNULL(r.MCNo, ''), '-', ','), ' ', '')) 
                END
            ) AS MCNo6Digit
        INTO #AllItems
        FROM #RawItems r;

        DECLARE @InsertedCutting INT = 0;
        DECLARE @InsertedSetup INT = 0;

        -- =============================================
        -- 3. บันทึกลงตาราง Cutting Tool (ถ้า type เป็น CuttingTool)
        -- =============================================
        INSERT INTO [dbo].[tb_IssueCuttingTool_Request_Document]
            (DocNo, Status, Requester, Division, Fac, [CASE], PartNo, ItemNo, SPEC, Process, MCType, MCNo, MCNo6Digit, ON_HAND, Req_QTY, QTY, DueDate, PhoneNo, PathDwg, ItemName, MFGOrderNo, MR_No, ToolingType, AS400STATUS, Unique_Id, DateTime_Record)
        SELECT
            DocNo, Status, Requester, Division, Fac, [CASE], PartNo, ItemNo, SPEC, Process, MCType, MCNo, MCNo6Digit, ON_HAND, Req_QTY, QTY, DueDate, PhoneNo, PathDwg, ItemName, MFGOrderNo, MR_No, 'CuttingTool', 'Wait PH Issue', Unique_Id_Cast, @CurrentTime
        FROM #AllItems
        WHERE ToolType = 'CuttingTool';

        SET @InsertedCutting = @@ROWCOUNT;

        -- =============================================
        -- 4. บันทึกลงตาราง Setup Tool (ถ้า type เป็น SetupTool)
        -- =============================================
        INSERT INTO [dbo].[tb_IssueSetupTool_Request_Document]
            (DocNo, Status, Requester, Division, Fac, [CASE], PartNo, ItemNo, SPEC, Process, MCType, MCNo, MCNo6Digit, ON_HAND, Req_QTY, QTY, DueDate, PhoneNo, ItemName, MFGOrderNo, MR_No, ToolingType, AS400STATUS, Unique_Id, DateTime_Record)
        SELECT
            DocNo, Status, Requester, Division, Fac, [CASE], PartNo, ItemNo, SPEC, Process, MCType, MCNo, MCNo6Digit, ON_HAND, Req_QTY, QTY, DueDate, PhoneNo, ItemName, MFGOrderNo, MR_No, 'SetupTool', 'Wait PH Issue', Unique_Id_Cast, @CurrentTime
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
