USE [db_Tooling]
GO

-- =============================================
-- REVERSE-ENGINEERED: Stored_Get_Dropdown_PC_Plan_Data
-- Version: Split Mode (FAST/SLOW) to improve perceived performance
-- =============================================
CREATE OR ALTER PROCEDURE [trans].[Stored_Get_Dropdown_PC_Plan_Data]
    @Profit_Center NVARCHAR(50) = NULL,
    @Mode NVARCHAR(10) = 'ALL' -- 'ALL', 'FAST', 'SLOW'
AS
BEGIN
    SET NOCOUNT ON;

    -- =============================================
    -- MODE: FAST or ALL (Machine, Facility)
    -- =============================================
    IF @Mode IN ('ALL', 'FAST')
    BEGIN
        -- 1. [0] Machines (Fast)
        SELECT DISTINCT [MC_Group] AS MC
        FROM [db_Tooling].[viewer].[View_tb_Master_Machine_Group]
        WHERE [MC_Group] IS NOT NULL
        ORDER BY MC;

        -- 2. [1] Facilities (Fast)
        SELECT DISTINCT 
            [FacilityName],
            CASE 
                WHEN CHARINDEX('F.', [FacilityName]) > 0 
                THEN SUBSTRING([FacilityName], CHARINDEX('F.', [FacilityName]), LEN([FacilityName]))
                ELSE [FacilityName]
            END AS [FacilityShort]
        FROM [db_Tooling].[viewer].[View_tb_Division_Facility_ALL]
        WHERE [FacilityName] IS NOT NULL
          AND (@Profit_Center IS NULL OR [Profit_Center] = @Profit_Center)
        ORDER BY [FacilityShort];
    END

    -- =============================================
    -- MODE: SLOW or ALL (Process, PartNo)
    -- =============================================
    IF @Mode IN ('ALL', 'SLOW')
    BEGIN
        -- 3. [2] Processes (Filtered by Profit_Center string)
        SELECT DISTINCT [Process]
        FROM [db_Tooling].[viewer].[View_tb_Mapping_All]
        WHERE [Process] IS NOT NULL
          AND (@Profit_Center IS NULL OR [Profit_Center] = @Profit_Center)
        ORDER BY [Process]
        OPTION (RECOMPILE);

        -- 4. [3] PartNos (Filtered by Profit_Center string)
        SELECT DISTINCT [Part_No] AS PartNo
        FROM [db_Tooling].[viewer].[View_tb_Mapping_All]
        WHERE [Part_No] IS NOT NULL
          AND (@Profit_Center IS NULL OR [Profit_Center] = @Profit_Center)
        ORDER BY PartNo
        OPTION (RECOMPILE);
    END

END
GO
