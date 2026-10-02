"""
Debug v22: Verify what headers and cookies are actually sent by requests session.
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

# Inspect the session cookies
print("=== Session Cookies in requests ===")
for c in s.cookies:
    print(f"  Name: {c.name}  Value: {c.value[:30]}...  Domain: {c.domain}  Path: {c.path}")

REPORT_URL = "http://wbp04.bp.minebea.local/iPBASS/app/Master/ItemMaster/ItemMaster.aspx"
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
}

print(f"\nSending GET to {REPORT_URL}...")
r = s.get(REPORT_URL, headers=headers, timeout=15)
print(f"Response status: {r.status_code}")
print(f"Response URL: {r.url}")

# Print headers sent by requests
print("\n=== Request Headers Sent ===")
for k, v in r.request.headers.items():
    if k.lower() == "cookie":
        print(f"  {k}: [cookie values truncated for security]")
        # Print actual cookie names sent
        print(f"    Sent Cookie Names: {[p.split('=')[0].strip() for p in v.split(';')]}")
    else:
        print(f"  {k}: {v}")

if "login.aspx" in r.url.lower():
    print("\n>>> Redirected to login page.")
    # Check if there is any error message or what
    soup = BeautifulSoup(r.text, "html.parser")
    print("Page Title:", soup.find("title").text.strip() if soup.find("title") else "No Title")
else:
    print("\n>>> ✅ Success! Accessed report page!")
