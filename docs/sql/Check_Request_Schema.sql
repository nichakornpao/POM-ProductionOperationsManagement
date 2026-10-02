USE [db_Tooling]
GO

PRINT '>>> Checking schema for tb_IssueCuttingTool_Request_Document...'
SELECT 
    COLUMN_NAME, 
    DATA_TYPE, 
    CHARACTER_MAXIMUM_LENGTH, 
    IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'tb_IssueCuttingTool_Request_Document'
ORDER BY ORDINAL_POSITION;
GO
