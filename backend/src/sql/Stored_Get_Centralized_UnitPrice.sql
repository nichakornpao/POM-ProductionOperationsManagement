CREATE OR ALTER PROCEDURE [trans].[Stored_Get_Centralized_UnitPrice]
AS
BEGIN
    SET NOCOUNT ON;
    
    -- ดึงข้อมูล Unit Price จาก Database Centralized 
    SELECT 
        [ITEM_NO] AS ItemNo, 
        [SPEC] AS Spec,
        [UNIT_PRICE_THB] AS unitPrice
    FROM [db_Cost_Data_Centralized].[viewer].[View_MasterLastItemAll_PH_UnitPriceTHB]
    WHERE [ITEM_NO] IS NOT NULL
END
