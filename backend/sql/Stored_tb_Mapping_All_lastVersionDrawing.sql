-- =============================================
-- Author:      Aon(Trainee)
-- Create date: 2026-05-30
-- Description: Retrieve mapping_all_lastVersionDrawing without duplicate data
--              when same Mapping_ID, Cutting_ID, Setup_ID and DwgRev,
--              always using the latest item (Update latest item)
-- =============================================

USE [db_Tooling]
GO

SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE OR ALTER PROCEDURE [trans].[Stored_tb_Mapping_All_lastVersionDrawing]
AS
BEGIN
    SET NOCOUNT ON;
    WITH lastDrawing AS (
        SELECT [Division_Id]
          ,[Part_Id]
          ,[Process]
          ,[MC_Group_Id]
          ,[DwgRev]
          ,[Date update]
        FROM (
          SELECT
              [Division_Id]
              ,[Part_Id]
              ,[Process]
              ,[MC_Group_Id]
              ,[DwgRev]
              ,[Date update]
              ,ROW_NUMBER() OVER (
                PARTITION BY [Part_Id], [Process], [MC_Group_Id]
                ORDER BY [Date update] DESC
            ) AS rn
        FROM [viewer].[View_tb_Mapping_All]
    )
    SELECT *
    FROM lastDrawing
    WHERE rn = 1;
  )
END
GO
