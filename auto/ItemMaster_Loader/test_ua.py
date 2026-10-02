"""
Debug v23: Test sending the exact User-Agent matching the browser session:
"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15 Edg/149.0.0.0"
"""
import configparser
import requests
from bs4 import BeautifulSoup

config = configparser.ConfigParser()
config.read("credentials.ini", encoding="utf-8")
cookie_str = config.get("ipbass", "cookie_string")

s = requests.Session()
s.trust_env = False
s.proxies = {}

for part in cookie_str.split(";"):
    if "=" in part:
        name, val = part.strip().split("=", 1)
        s.cookies.set(name, val, domain="wbp04.bp.minebea.local", path="/")

REPORT_URL = "http://wbp04.bp.minebea.local/iPBASS/app/Master/ItemMaster/ItemMaster.aspx"
headers = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15 Edg/149.0.0.0",
}

print(f"Sending GET with browser User-Agent to {REPORT_URL}...")
r = s.get(REPORT_URL, headers=headers, timeout=15)
print(f"Response status: {r.status_code}")
print(f"Response URL: {r.url}")

if "login.aspx" in r.url.lower():
    print("\n>>> Still redirected to login.")
else:
    print("\n>>> ✅ SUCCESS! Access to report page granted!")
