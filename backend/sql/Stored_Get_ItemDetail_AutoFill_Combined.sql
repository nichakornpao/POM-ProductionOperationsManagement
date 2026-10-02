USE [db_Tooling]
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- =============================================
-- Author:       Suttichai/Trainee
-- Date:         17/02/2569 (Updated)
-- Description:  Combined AutoFill (Exact) and Autocomplete (Fuzzy) Item Search
--               Supports both Int Division ID (from Return) and String Code (from Detail)
-- =============================================
CREATE OR ALTER PROCEDURE [trans].[Stored_Get_ItemDetail_AutoFill]
    @Input_Division NVARCHAR(50) = NULL, -- Support Both Int & String
    @Input_ItemNo NVARCHAR(100) = NULL,
    @Is_Autocomplete BIT = 0  -- 0 = Exact Match (AutoFill), 1 = Fuzzy Search (Autocomplete)
AS
BEGIN
    SET NOCOUNT ON;

    -- 1. Validate Input
    IF (@Input_Division IS NULL OR @Input_ItemNo IS NULL OR @Input_ItemNo = '')
    BEGIN
        RETURN;
    END

    -- 2. Resolve Division ID
    -- Map string codes (71DZ, 7122) to numeric IDs (2, 3) used in Views
    DECLARE @Target_Division_Id INT = NULL;

    IF ISNUMERIC(@Input_Division) = 1 AND @Input_Division NOT LIKE '%[^0-9]%'
    BEGIN
        -- If purely numeric, treat as ID
        SET @Target_Division_Id = CAST(@Input_Division AS INT);
    END
    ELSE
    BEGIN
        -- If string, map manually (Hardcoded for performance/safety based on known codes)
        IF UPPER(@Input_Division) = '71DZ' OR UPPER(@Input_Division) = 'PMC'
            SET @Target_Division_Id = 2;
        ELSE IF UPPER(@Input_Division) = '7122' OR UPPER(@Input_Division) = 'GM'
            SET @Target_Division_Id = 3;
    END

    -- Fallback: If mapping failed, maybe try to query? Or just return empty
    IF @Target_Division_Id IS NULL
    BEGIN
        -- Attempt direct lookup if Table exists, but for now return empty to avoid error
        RETURN; 
    END

    IF @Is_Autocomplete = 1
    BEGIN
        -- === Mode 1: Autocomplete (Fuzzy Search) ===
        -- Returns LIST of Items (Top 20)
        SELECT DISTINCT TOP 20
            [ItemNo],
            [ItemName],
            [SPEC],
            [UNIT],
            [ON_HAND]
        FROM [viewer].[View_tb_Master_Purchase_SUM_ALL] WITH (NOLOCK)
        WHERE [Division_Id] = @Target_Division_Id
          AND (
              [ItemNo] LIKE '%' + @Input_ItemNo + '%'
              OR [ItemName] LIKE '%' + @Input_ItemNo + '%'
          )
        ORDER BY [ItemNo];
    END
    ELSE
    BEGIN
        -- === Mode 0: AutoFill (Exact Match) ===
        -- Returns SINGLE Item (Top 1)
        SELECT TOP 1
            [ItemNo],
            [ItemName],
            [SPEC],
            [UNIT],
            [ON_HAND]
        FROM [viewer].[View_tb_Master_Purchase_SUM_ALL] WITH (NOLOCK)
        WHERE [Division_Id] = @Target_Division_Id
          AND [ItemNo] = @Input_ItemNo
        ORDER BY [LAST_UPDATE] DESC
        OPTION (RECOMPILE);
    END
END
GO
