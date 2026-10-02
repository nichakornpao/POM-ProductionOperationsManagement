USE [db_Tooling]
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- =============================================
-- Author:      Antigravity
-- Create date: 2026-02-17
-- Description: สร้างเลข MFGORDER No สำหรับ Request (เวอร์ชั่นมีคำอธิบายไทย)
-- =============================================
CREATE OR ALTER FUNCTION [trans].[fn_Generate_Request_MFGOrderNo] 
(
    @Division NVARCHAR(50),
    @PartNo   NVARCHAR(50),
    @MCType   NVARCHAR(50),
    @Case     NVARCHAR(50),
    @Process  NVARCHAR(50),
    @Fac      INT,
    @Date     DATE
)
RETURNS NVARCHAR(50)
AS
BEGIN
    DECLARE @MFGOrderNo NVARCHAR(50);
    DECLARE @DivisionUpper NVARCHAR(50) = UPPER(ISNULL(@Division, ''));

    -- ตรวจสอบว่าเป็นแผนกที่ต้อง Auto-Gen หรือไม่ (PMC, 71DZ, GM, 7122)
    IF @DivisionUpper IN ('PMC', '71DZ', 'GM', '7122')
    BEGIN
        DECLARE @MCCode NVARCHAR(50) = '';
        
        -- ค้นหา MC_Code จากตาราง Machine Group
        -- หมายเหตุ: การ Query ข้าม Database ใน Function อาจช้าบ้างถ้าข้อมูลเยอะมาก
        SELECT TOP 1 @MCCode = MC_Code 
        FROM [db_Cost_Data_Centralized].[master].[tb_Master_Machine_Group] 
        WHERE MC_Group = @MCType;

        SET @MCCode = ISNULL(@MCCode, '');
        
        -- ตัด PartNo เอาแค่ 6 ตัวแรก
        DECLARE @PartNoPrefix NVARCHAR(10);
        SET @PartNoPrefix = LEFT(ISNULL(@PartNo, ''), 6);

        -- ใส่ Prefix ตามแผนก (M หรือ P)
        IF @DivisionUpper IN ('PMC', '71DZ')
        BEGIN
            SET @MFGOrderNo = 'M' + @PartNoPrefix + @MCCode;
        END
        ELSE
        BEGIN
            SET @MFGOrderNo = 'P' + @PartNoPrefix + @MCCode;
        END
    END
    ELSE
    BEGIN
        -- สูตร Default สำหรับแผนกอื่น
        -- CASE + Process + F + Fac + Date(YYYYMMDD)
        DECLARE @DateStr NVARCHAR(20) = FORMAT(@Date, 'yyyyMMdd');
        SET @MFGOrderNo = ISNULL(@Case, '') + ISNULL(@Process, '') + 'F' + CAST(ISNULL(@Fac, 0) AS NVARCHAR(10)) + @DateStr;
    END

    RETURN @MFGOrderNo;
END
GO
