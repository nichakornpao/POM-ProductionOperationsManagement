import pyodbc
from dotenv import dotenv_values

config = dotenv_values('../../backend/.env')
conn = pyodbc.connect(f'DRIVER={{ODBC Driver 17 for SQL Server}};SERVER=pbgm8g;UID={config.get("DB_USER_APP")};PWD={config.get("DB_PASSWORD")};DATABASE=PurchaseAutoload;')
cursor = conn.cursor()
cursor.execute('SELECT COUNT(*) FROM tb_ItemMaster_Raw')
print('Total Rows:', cursor.fetchone()[0])
