USE [PurchaseAutoload]
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- =============================================
-- Replaces [db_Tooling].[trans].[Stored_Get_ItemDetail_AutoFill] (pbp155), which read from
-- [db_Tooling].[viewer].[View_tb_Master_Purchase_SUM_ALL]. That view is no longer used
-- anywhere in this app — it mixed GM/PMC rows unpredictably (same bug we fixed in
-- Purchase_History and get_ItemNo).
--
-- This procedure lives on pbgm8g/PurchaseAutoload so it can query tb_ItemMaster_Raw
-- (kept fresh by auto_load_item_master.py) directly, same-server, no linked server needed.
-- Division_Id is derived from filter_range (PMC='T271DZ' -> 2, GM='T27122' -> 3) to match
-- the numbering the app already expects (see PurchaseHistory.controller.js / get_ItemNo).
--
-- Unlike the old SP, this ALSO returns MAIN_LOCATION — the old one never selected stock
-- location at all, so the server-side "precision" lookup in detail.component.ts /
-- detailcasesetup.component.ts never actually confirmed or corrected it; only the client's
-- own (division-aware, since our earlier fix) local lookup did.
-- =============================================
CREATE OR ALTER PROCEDURE [dbo].[Stored_Get_ItemDetail_AutoFill]
    @Input_Division INT = NULL,
    @Input_ItemNo NVARCHAR(100) = NULL,
    @Is_Autocomplete BIT = 0  -- 0 = Exact Match (AutoFill), 1 = Fuzzy Search (Autocomplete)
AS
BEGIN
    SET NOCOUNT ON;

    IF (@Input_Division IS NULL OR @Input_ItemNo IS NULL OR @Input_ItemNo = '')
    BEGIN
        RETURN;
    END

    IF @Is_Autocomplete = 1
    BEGIN
        -- === Mode 1: Autocomplete (Fuzzy Search) === Returns LIST of Items (Top 20)
        SELECT DISTINCT TOP 20
            item_no       AS ItemNo,
            item_name     AS ItemName,
            spec          AS SPEC,
            stock_unit    AS UNIT,
            on_hand       AS ON_HAND,
            stock_loc     AS MAIN_LOCATION
        FROM [PurchaseAutoload].[dbo].[tb_ItemMaster_Raw]
        WHERE (CASE WHEN filter_range LIKE '%T271DZ%' THEN 2 ELSE 3 END) = @Input_Division
          AND (
              item_no LIKE '%' + @Input_ItemNo + '%'
              OR item_name LIKE '%' + @Input_ItemNo + '%'
          )
        ORDER BY item_no;
    END
    ELSE
    BEGIN
        -- === Mode 0: AutoFill (Exact Match) === Returns SINGLE Item (Top 1, most recently loaded)
        SELECT TOP 1
            item_no       AS ItemNo,
            item_name     AS ItemName,
            spec          AS SPEC,
            stock_unit    AS UNIT,
            on_hand       AS ON_HAND,
            stock_loc     AS MAIN_LOCATION
        FROM [PurchaseAutoload].[dbo].[tb_ItemMaster_Raw]
        WHERE (CASE WHEN filter_range LIKE '%T271DZ%' THEN 2 ELSE 3 END) = @Input_Division
          AND item_no = @Input_ItemNo
        ORDER BY loaded_at DESC
        OPTION (RECOMPILE);
    END
END
GO
