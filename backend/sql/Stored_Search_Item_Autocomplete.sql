USE [db_Tooling]
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- =============================================
-- Author:       Suttichai/Trainee
-- Date:         13/02/2569
-- Description:  Search ItemNo with fuzzy logic for Autocomplete
-- =============================================
CREATE OR ALTER PROCEDURE [trans].[Stored_Search_Item_Autocomplete]
    @Input_Division INT = NULL,
    @Input_Keyword NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- Return empty if no keyword
    IF @Input_Keyword IS NULL OR LEN(@Input_Keyword) < 2
    BEGIN
        RETURN;
    END

    SELECT DISTINCT TOP 20
        [ItemNo],
        [ItemName],
        [SPEC]
    FROM [viewer].[View_tb_Master_Purchase_SUM_ALL] WITH (NOLOCK)
    WHERE (@Input_Division IS NULL OR [Division_Id] = @Input_Division)
      AND (
          [ItemNo] LIKE '%' + @Input_Keyword + '%'
          OR [ItemName] LIKE '%' + @Input_Keyword + '%'
      )
    ORDER BY [ItemNo];
END
GO
