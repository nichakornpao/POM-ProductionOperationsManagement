USE [ForecastProject]
GO

CREATE TABLE [dbo].[tb_Forecast_Balance](
	[ItemNo] [nvarchar](50) NOT NULL,
	[PlanYear] [varchar](10) NOT NULL,
	[PlanMonth] [varchar](10) NOT NULL,
	[Revision] [nvarchar](20) NOT NULL,
	[EndStock] [float] NOT NULL DEFAULT 0,
	[CurrentStock] [float] NULL,
	[UpdatedAt] [datetime] NULL DEFAULT (GETDATE()),
 CONSTRAINT [PK_tb_Forecast_Balance] PRIMARY KEY CLUSTERED 
(
	[ItemNo] ASC,
	[PlanYear] ASC,
	[PlanMonth] ASC,
	[Revision] ASC
)
) ON [PRIMARY]
GO
