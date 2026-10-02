"""
Debug v26: Print all input elements found on ItemMaster.aspx page
to find what the search and export buttons are actually named.
"""
from bs4 import BeautifulSoup

with open("export_response.html", "r", encoding="utf-8") as f:
    html = f.read()

soup = BeautifulSoup(html, "html.parser")
inputs = soup.find_all("input")
print("=== Input Fields ===")
for inp in inputs:
    print(f"  name={inp.get('name')!r} type={inp.get('type')!r} id={inp.get('id')!r} value={inp.get('value')!r}")

print("\n=== Button Elements ===")
buttons = soup.find_all("button")
for btn in buttons:
    print(f"  name={btn.get('name')!r} type={btn.get('type')!r} id={btn.get('id')!r} text={btn.text.strip()!r}")
