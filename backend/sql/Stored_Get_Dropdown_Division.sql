USE [db_Tooling]
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- =============================================
-- Author:       Suttichai/Trainee
-- Date:         10/02/2569 
-- Description:  Stored_Get_Dropdown_Division
-- =============================================
CREATE OR ALTER PROCEDURE [trans].[Stored_Get_Dropdown_Division]
AS
BEGIN
    SET NOCOUNT ON;
    SELECT DISTINCT 
        [Division_Id],
        [Profit_Center],
        [Division_Name] AS [DivisionName], 
        [Division_Name], -- Matches [Division_Name] in View and Frontend
        [Profit_Center] AS [CenterName]
    FROM [db_Tooling].[viewer].[View_tb_Division_For_Project_Request]
    WHERE [Division_Id] IN (2, 3)
    ORDER BY [Division_Id];
END
GO
