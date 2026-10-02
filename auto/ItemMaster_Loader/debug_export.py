"""
Debug v25: Try POST export WITHOUT XMLHttpRequest header to see if it downloads the Excel file.
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

# Set cookies
for part in cookie_str.split(";"):
    if "=" in part:
        name, val = part.strip().split("=", 1)
        s.cookies.set(name, val, domain="wbp04.bp.minebea.local", path="/")

REPORT_URL = "http://wbp04.bp.minebea.local/iPBASS/app/Master/ItemMaster/ItemMaster.aspx"
headers = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15 Edg/149.0.0.0",
    "Referer": REPORT_URL,
}

# 1. GET page
print("GET ItemMaster page...")
r_get = s.get(REPORT_URL, headers=headers, timeout=15)
soup = BeautifulSoup(r_get.text, "html.parser")
vs = {
    inp.get("name"): inp.get("value", "")
    for inp in soup.find_all("input")
    if inp.get("name") in ("__VIEWSTATE", "__VIEWSTATEGENERATOR", "__EVENTVALIDATION")
}

# 2. POST Search (with AJAX)
search_payload = {
    **vs,
    "ctl00$ContentPlaceHolder1$txtFrItem": "4601",
    "ctl00$ContentPlaceHolder1$txtToItem": "4601xx",
    "ctl00$ContentPlaceHolder1$btnSearch": "Search",
}

print("POST Search...")
ajax_headers = {
    **headers,
    "X-Requested-With": "XMLHttpRequest",
}
r_search = s.post(REPORT_URL, data=search_payload, headers=ajax_headers, timeout=30)
print(f"Search status: {r_search.status_code}")

# Get Viewstate from search response
soup_search = BeautifulSoup(r_search.text, "html.parser")
ajax_vs = {}
for name in ["__VIEWSTATE", "__VIEWSTATEGENERATOR", "__EVENTVALIDATION"]:
    inp = soup_search.find("input", {"name": name})
    if inp:
        ajax_vs[name] = inp.get("value", "")
    else:
        import re
        match = re.search(rf"\|hiddenField\|{re.escape(name)}\|([^|]*)\|", r_search.text)
        if match:
            ajax_vs[name] = match.group(1)
        else:
            ajax_vs[name] = vs.get(name, "")

# 3. POST Export (WITHOUT XMLHttpRequest)
export_payload = {
    **ajax_vs,
    "ctl00$ContentPlaceHolder1$txtFrItem": "4601",
    "ctl00$ContentPlaceHolder1$txtToItem": "4601xx",
    "ctl00$ContentPlaceHolder1$btnExport": "Export",
}

print("POST Export (Non-AJAX)...")
# Note we use 'headers' here, which does not contain 'X-Requested-With'
r_export = s.post(REPORT_URL, data=export_payload, headers=headers, timeout=30)
print(f"Export status: {r_export.status_code}")
print(f"Export URL: {r_export.url}")
print(f"Response length: {len(r_export.content)} bytes")
print(f"Content-Type: {r_export.headers.get('Content-Type')}")
print(f"Content-Disposition: {r_export.headers.get('Content-Disposition')}")

# Save response
with open("export_response.bin", "wb") as f:
    f.write(r_export.content)
print("Saved response to export_response.bin")

try:
    html_text = r_export.content.decode("utf-8", errors="ignore")
    if "html" in html_text.lower():
        print("\n--- Response HTML snippet ---")
        print(html_text[:500])
except Exception as e:
    pass
