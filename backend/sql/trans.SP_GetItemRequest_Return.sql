CREATE PROCEDURE [trans].[SP_GetItemRequest_Return]
    @ItemNo NVARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT 
        ItemNo,
        ItemName,
        Spec
    FROM 
        [master].[tb_Purchase_Item_Master_PMC]
    WHERE 
        ItemNo = @ItemNo;
END
GO
