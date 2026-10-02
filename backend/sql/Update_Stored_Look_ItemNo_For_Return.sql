USE [db_Tooling]
GO
/****** Object:  StoredProcedure [trans].[Stored_Look_ItemNo_All_For_Return]    Script Date: 1/20/2026 2:40:00 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
ALTER PROCEDURE [trans].[Stored_Look_ItemNo_All_For_Return]
    @ItemNo NVARCHAR(50),
    @Division_Id INT
AS
BEGIN
    -- ตรวจสอบว่า Division ที่ส่งมาเป็น PMC หรือไม่
    DECLARE @IsPMC BIT = 0;

    IF EXISTS (
        SELECT 1 
        FROM [viewer].[View_Division_Facility_For_Return_PMC]
        WHERE Division_Id = @Division_Id AND Division_Name LIKE '%PMC%'
    )
    BEGIN
        SET @IsPMC = 1;
    END

    -- ถ้าเป็น PMC ให้ดึงข้อมูลจาก View PMC
    IF @IsPMC = 1
    BEGIN
        SELECT TOP 1
            ItemName,
            Spec
        FROM [viewer].[View_tb_Master_For_Return_PMC]
        WHERE ItemNo = @ItemNo;
    END
    ELSE
    BEGIN
        -- ถ้าไม่ใช่ PMC (เช่น GM) ยังไม่แสดงข้อมูล หรือจะ Return ว่าง
        SELECT TOP 0 NULL AS ItemName, NULL AS Spec;
    END
END
GO
