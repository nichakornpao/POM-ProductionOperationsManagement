USE [db_Tooling];
GO

ALTER TABLE [trans].[Notification_Log]
ADD [IsRead] BIT DEFAULT 0;
