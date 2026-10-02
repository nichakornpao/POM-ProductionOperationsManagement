-- =============================================
-- Debug Script: Test Stored_Get_CaseSET_All (Optimized Version)
-- =============================================
USE [db_Tooling]
GO

-- 1. Run with NO filters (Should return something)
DECLARE @Input_Division NVARCHAR(50) = NULL
DECLARE @Input_FacilityName NVARCHAR(100) = NULL

PRINT '>>> Tesing Stored_Get_CaseSET_All with NULL filters...'
EXEC [trans].[Stored_Get_CaseSET_All] 
    @Input_Division = @Input_Division,
    @Input_FacilityName = @Input_FacilityName

-- 2. Run with specific Division
SET @Input_Division = '71DZ' -- Assuming PMC
PRINT '>>> Tesing with Division: ' + @Input_Division
EXEC [trans].[Stored_Get_CaseSET_All] 
    @Input_Division = @Input_Division

-- 3. Run with Facility Name
SET @Input_FacilityName = 'F.4'
PRINT '>>> Tesing with Facility: ' + @Input_FacilityName
EXEC [trans].[Stored_Get_CaseSET_All] 
    @Input_Division = @Input_Division,
    @Input_FacilityName = @Input_FacilityName
GO
