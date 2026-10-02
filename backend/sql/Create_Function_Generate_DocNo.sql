USE [db_Tooling]
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- =============================================
-- Author:      Antigravity
-- Create date: 2026-02-17
-- Description: สร้างเลขที่เอกสาร (Document No) สำหรับ Request (เวอร์ชั่นมีคำอธิบายไทย)
-- =============================================
CREATE OR ALTER FUNCTION [trans].[fn_Generate_Request_DocNo] 
(
    @Division NVARCHAR(50), -- แผนก เช่น PMC, 71DZ, GM
    @Case     NVARCHAR(50), -- Case เช่น SET, F/A
    @Process  NVARCHAR(50), -- Process เช่น Turning, Milling
    @Fac      INT,          -- โรงงาน (Factory)
    @Date     DATE          -- วันที่บันทึก
)
RETURNS NVARCHAR(50)
AS
BEGIN
    DECLARE @DocNo NVARCHAR(50);
    DECLARE @CasePart NVARCHAR(10);
    DECLARE @ProcessPart NVARCHAR(10);
    DECLARE @FacPart NVARCHAR(10);
    DECLARE @DatePart NVARCHAR(10);
    
    -- 1. ส่วนของวันที่ (Format: yyMMdd เช่น 260217)
    SET @DatePart = FORMAT(@Date, 'yyMMdd');

    -- 2. ส่วนของ Case (แปลงเป็นรหัสย่อ)
    SET @Case = UPPER(ISNULL(@Case, ''));
    IF @Case = 'F/A' SET @CasePart = 'FA';
    ELSE IF @Case = 'N/G' SET @CasePart = 'NG';
    ELSE IF @Case = 'P/P' SET @CasePart = 'PP';
    ELSE IF @Case = 'R/W' SET @CasePart = 'RW';
    ELSE IF LEN(@Case) >= 3 SET @CasePart = LEFT(@Case, 3); -- ตัดเอา 3 ตัวแรก
    ELSE SET @CasePart = @Case;

    -- 3. ส่วนของ Process (แปลงเป็นรหัสย่อ)
    SET @Process = LOWER(ISNULL(@Process, ''));
    IF @Process LIKE 'turning%' OR @Process LIKE 'milling%'
        SET @ProcessPart = CASE WHEN @Process LIKE 'turning%' THEN 'TN' ELSE 'ML' END;
    -- รวมกลุ่ม Boring/RL เป็น RL
    ELSE IF @Process LIKE '%f&boring%' OR @Process LIKE '%rl%' OR @Process LIKE '%boring%'
        SET @ProcessPart = 'RL';
    ELSE 
        SET @ProcessPart = 'XX'; -- กรณีไม่ตรงเงื่อนไข

    -- 4. ส่วนของ Factory (แปลงเป็น Text)
    SET @FacPart = CAST(ISNULL(@Fac, 0) AS NVARCHAR(10));

    -- 5. รวมคำตามสูตรของแต่ละ Division
    SET @Division = UPPER(ISNULL(@Division, ''));

    IF @Division = '71DZ' OR @Division = 'PMC'
    BEGIN
        -- สูตร PMC: Case + Process + Fac + Date
        -- ตัวอย่าง: SET + TN + 2 + 260217
        SET @DocNo = @CasePart + @ProcessPart + @FacPart + @DatePart;
    END
    ELSE
    BEGIN
        -- สูตร GM (และอื่นๆ): Process + Fac + Case + Date
        -- ตัวอย่าง: TN + 2 + SET + 260217
        SET @DocNo = @ProcessPart + @FacPart + @CasePart + @DatePart;
    END

    RETURN @DocNo;
END
GO
