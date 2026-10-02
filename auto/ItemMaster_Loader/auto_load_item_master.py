#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
auto_load_item_master.py
======================================
Fetch ItemMaster report data from iPBASS web portal, clean and consolidate it,
and save 1 Excel file.

Usage -- One-off mode:
  python auto_load_item_master.py
  python auto_load_item_master.py --output-dir D:/PowerBI_Data

Usage -- Scheduler modes:
  python auto_load_item_master.py --interval 10     # run every 10 minutes
  python auto_load_item_master.py --schedule 08:30  # daily at 08:30
"""
from __future__ import annotations

import argparse
import configparser
import io
import os
import re
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import pandas as pd
import requests
import pyodbc
from bs4 import BeautifulSoup
from dotenv import dotenv_values

# ─────────────────────────── Constants ────────────────────────────────────────

# Declared search range filters (easy to modify in the future)
FILTER_RANGES: list[tuple[str, str]] = [
    ("4601", ""),
    ("4602", ""),
    ("6210", ""),
    ("6209", ""),
]

# Portable relative path (resolves to Raw_output_data subfolder in same directory)
DEFAULT_OUTPUT_DIR = Path(__file__).resolve().parent / "Raw_output_data"
FILE_PREFIX = "ItemMaster_Raw"


# ─────────────────────────── ASP.NET Helpers ──────────────────────────────────

class ViewStateParser:
    """Extracts ASP.NET hidden fields from HTML or AJAX delta responses."""

    _FIELDS: tuple[str, ...] = (
        "__VIEWSTATE",
        "__VIEWSTATEGENERATOR",
        "__EVENTVALIDATION",
    )

    @classmethod
    def extract(cls, text: str) -> dict[str, str]:
        """Return a dict of ASP.NET viewstate field names -> values."""
        soup = BeautifulSoup(text, "html.parser")
        result: dict[str, str] = {
            name: (soup.find("input", {"name": name}) or {}).get("value", "")
            for name in cls._FIELDS
        }

        # Fallback for ASP.NET AJAX delta format (|hiddenField|name|value|)
        for name in cls._FIELDS:
            if result.get(name):
                continue
            match = re.search(
                rf"\|hiddenField\|{re.escape(name)}\|([^|]*)\|", text
            )
            if match:
                result[name] = match.group(1)

        return result


# ─────────────────────────── Fetcher & Transformer ────────────────────────────

class ItemMasterFetcher:
    """Handles HTTP session, ASP.NET authentication, and ItemMaster data fetching."""

    LOGIN_URL = "http://wbp04.bp.minebea.local/iPBASS/Login/login.aspx"
    REPORT_URL = "http://wbp04.bp.minebea.local/iPBASS/app/Master/ItemMaster/ItemMaster.aspx"

    def __init__(self) -> None:
        self.session = requests.Session()
        # Bypass proxy to access intranet directly
        self.session.trust_env = False
        self.session.proxies = {}
        self._cookie_string = ""
        self._load_credentials()

    def _load_credentials(self) -> None:
        """Find and read credentials.ini from central server (pbgm8g) or local fallback."""
        possible_paths = [
            Path(r"\\pbgm8g\D\CostReduction\CostReductionAutoLoader\credentials.ini"),
            Path(__file__).resolve().parent / "credentials.ini",
            Path(__file__).resolve().parent.parent / "credentials.ini",
            Path("credentials.ini"),
        ]

        self._candidate_credentials = []
        for p in possible_paths:
            try:
                if p.exists():
                    config = configparser.ConfigParser()
                    config.read(p, encoding="utf-8")
                    if "ipbass" in config:
                        u = config.get("ipbass", "username", fallback="").strip()
                        pwd = config.get("ipbass", "password", fallback="").strip()
                        if u and pwd:
                            self._candidate_credentials.append({
                                "username": u,
                                "password": pwd,
                                "source": str(p)
                            })
            except Exception as e:
                print(f"[WARN] Failed to read credentials from {p}: {e}")

        if not self._candidate_credentials:
            raise FileNotFoundError(
                "[ERROR] No valid credentials found in central server or local paths."
            )

        self._username = self._candidate_credentials[0]["username"]
        self._password = self._candidate_credentials[0]["password"]

    def login(self) -> None:
        """Perform automated POST request to login.aspx to obtain a valid session cookie with smart fallback."""
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/134.0.0.0 Safari/537.36"
            ),
        }

        last_error = None
        authenticated = False

        for cred in self._candidate_credentials:
            u = cred["username"]
            pwd = cred["password"]
            src = cred["source"]
            print(f"[INFO] Authenticating iPBASS session using user '{u}' (source: {src})...")

            self.session.cookies.set(
                "CurrentSystem", 
                f"SystemName=A31BP&UserID={u.upper()}", 
                domain="wbp04.bp.minebea.local"
            )

            try:
                # 1. GET login page to get viewstate
                resp_get = self.session.get(self.LOGIN_URL, headers=headers, timeout=30)
                resp_get.raise_for_status()
                asp_vars = ViewStateParser.extract(resp_get.text)

                # 2. POST to login
                login_payload = {
                    "__EVENTTARGET": "",
                    "__EVENTARGUMENT": "",
                    "__VIEWSTATE": asp_vars.get("__VIEWSTATE", ""),
                    "__VIEWSTATEGENERATOR": asp_vars.get("__VIEWSTATEGENERATOR", ""),
                    "__EVENTVALIDATION": asp_vars.get("__EVENTVALIDATION", ""),
                    "txtUserID": u,
                    "txtPassword": pwd,
                    "btnLogin": "Login"
                }
                resp_post = self.session.post(
                    self.LOGIN_URL, data=login_payload, headers=headers, timeout=30, allow_redirects=False
                )

                if "Invalid User" in resp_post.text or "Invalid Password" in resp_post.text or "User or Password not correct" in resp_post.text:
                    print(f"[WARN] User '{u}' failed authentication on iPBASS portal (Invalid credentials).")
                    last_error = f"Invalid User or Password for {u}"
                    continue

                if resp_post.status_code not in (200, 302):
                    print(f"[WARN] Unexpected status {resp_post.status_code} for user '{u}'.")
                    last_error = f"Status code {resp_post.status_code}"
                    continue

                self._username = u
                self._password = pwd
                print(f"[SUCCESS] Session authenticated successfully using user '{u}'!")
                authenticated = True
                break
            except Exception as exc:
                print(f"[WARN] Login error with user '{u}': {exc}")
                last_error = str(exc)

        if not authenticated:
            raise RuntimeError(f"Failed to perform automated login with any candidate credentials: {last_error}")

    def get_available_sections(self) -> list[str]:
        """Fetch the ItemMaster page and extract all available Section values from the dropdown."""
        print(f"[INFO] Fetching available sections from {self.REPORT_URL}")
        try:
            resp = self.session.get(self.REPORT_URL, timeout=30)
            resp.raise_for_status()
            if "login.aspx" in resp.url.lower():
                self.login()
                resp = self.session.get(self.REPORT_URL, timeout=30)
                resp.raise_for_status()
        except Exception as exc:
            raise RuntimeError(f"Failed to fetch sections: {exc}")

        soup = BeautifulSoup(resp.text, "html.parser")
        section_select = soup.find("select", {"name": "ctl00$ContentPlaceHolder1$ddlSection"})
        if not section_select:
            print("[WARN] Section dropdown not found. Defaulting to 7122.")
            return ["T27122"]
            
        options = section_select.find_all("option")
        sections = [opt.get("value") for opt in options if opt.get("value")]
        print(f"[INFO] Found {len(sections)} sections: {sections}")
        return sections

    def fetch_range(self, section_val: str, start_code: str, end_code: str) -> bytes:
        """
        Submits the search form for a specific section and account range,
        then simulates the 'Export to Excel' click to download the data.
        """
        print(f"[INFO] GET ItemMaster page -> {self.REPORT_URL}")
        try:
            resp = self.session.get(self.REPORT_URL, timeout=30)
            resp.raise_for_status()
            if "login.aspx" in resp.url.lower():
                print("[INFO] Session expired during fetch. Auto-recovering...")
                self.login()
                resp = self.session.get(self.REPORT_URL, timeout=30)
                resp.raise_for_status()
        except Exception as exc:
            raise RuntimeError(f"Failed to access ItemMaster page: {exc}")

        # Parse inputs dynamically to handle form adjustments
        soup = BeautifulSoup(resp.text, "html.parser")
        inputs = soup.find_all("input")
        selects = soup.find_all("select")

        # ── Dynamic Input Control Names Discovery ──────────────────────────────────
        # Search by A/C Code (Account Code) instead of Item No.
        txt_from_name = next(
            (
                inp.get("name")
                for inp in inputs
                if inp.get("name")
                and "txtfrac" in inp.get("name").lower()
            ),
            "ctl00$ContentPlaceHolder1$txtFrAC",
        )

        txt_to_name = next(
            (
                inp.get("name")
                for inp in inputs
                if inp.get("name")
                and "txttoac" in inp.get("name").lower()
            ),
            "ctl00$ContentPlaceHolder1$txtToAC",
        )

        btn_search = next(
            (
                inp
                for inp in inputs
                if inp.get("type") in ("submit", "image", "button")
                and (
                    "search" in inp.get("name", "").lower()
                    or "submit" in inp.get("name", "").lower()
                    or "select" in inp.get("value", "").lower()
                )
            ),
            None,
        )
        btn_search_name = btn_search.get("name") if btn_search else "ctl00$ContentPlaceHolder1$Submit"
        btn_search_val = btn_search.get("value") if btn_search else "Select"

        print(f"[DEBUG] Found controls -> From: {txt_from_name}, To: {txt_to_name}, Search: {btn_search_name}")

        # ── Step 1: POST Search ───────────────────────────────────────────────
        asp_vars = ViewStateParser.extract(resp.text)

        # Build dynamic payload with all inputs to preserve state (radio buttons etc)
        search_payload = {
            "__VIEWSTATE": asp_vars.get("__VIEWSTATE", ""),
            "__VIEWSTATEGENERATOR": asp_vars.get("__VIEWSTATEGENERATOR", ""),
            "__EVENTVALIDATION": asp_vars.get("__EVENTVALIDATION", ""),
        }

        # Include all select tags with their selected values (or default to first)
        for sel in selects:
            name = sel.get("name")
            if not name:
                continue
            selected_opt = sel.find("option", selected=True)
            if not selected_opt:
                selected_opt = sel.find("option")
            search_payload[name] = selected_opt.get("value", "") if selected_opt else ""

        for inp in inputs:
            name = inp.get("name")
            if not name:
                continue
            type_ = inp.get("type", "").lower()
            if type_ in ("radio", "checkbox") and not inp.has_attr("checked"):
                continue
            if type_ in ("submit", "image", "button"):
                continue
            if name not in search_payload:
                search_payload[name] = inp.get("value", "")

        search_payload[txt_from_name] = start_code
        search_payload[txt_to_name] = end_code
        search_payload[btn_search_name] = btn_search_val
        search_payload["ctl00$ContentPlaceHolder1$ddlSection"] = section_val

        # If ASP.NET requires ScriptManager, we might need it, but let's try just the standard form first.

        # Include standard ASP.NET AJAX headers in case search updates panels
        ajax_headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/134.0.0.0 Safari/537.36"
            ),
            "Referer": self.REPORT_URL,
            "X-Requested-With": "XMLHttpRequest",
        }

        print(f"[INFO] POST search range: {start_code} -> {end_code}")
        try:
            search_resp = self.session.post(
                self.REPORT_URL, data=search_payload, timeout=60
            )
            search_resp.raise_for_status()
        except Exception as exc:
            raise RuntimeError(f"Search request failed: {exc}")

        # ── Step 2: POST Export ───────────────────────────────────────────────
        # Parse inputs dynamically from search response because export button is only visible after search
        search_soup = BeautifulSoup(search_resp.text, "html.parser")
        search_inputs = search_soup.find_all("input")

        btn_export = None
        for inp in search_inputs:
            name_lower = inp.get("name", "").lower()
            type_lower = inp.get("type", "").lower()
            if type_lower in ("submit", "image", "button") and (
                "export" in name_lower or "excel" in name_lower
            ):
                btn_export = inp
                break

        if not btn_export:
            print(f"[WARN] Export button not found in search response for range {start_code} -> {end_code}. (Possibly no data found)")
            with open(f"auto/ItemMaster_Loader/search_debug_{start_code}.html", "w", encoding="utf-8") as f:
                f.write(search_resp.text)
            return b""

        btn_export_name = btn_export.get("name")
        btn_export_type = btn_export.get("type", "submit").lower()
        btn_export_val = btn_export.get("value", "Export")

        print(f"[DEBUG] Found export control -> Export: {btn_export_name} ({btn_export_type})")

        export_vars = ViewStateParser.extract(search_resp.text)
        export_payload = {
            "__VIEWSTATE": export_vars.get("__VIEWSTATE", ""),
            "__VIEWSTATEGENERATOR": export_vars.get("__VIEWSTATEGENERATOR", ""),
            "__EVENTVALIDATION": export_vars.get("__EVENTVALIDATION", ""),
            txt_from_name: start_code,
            txt_to_name: end_code,
        }

        # Simulate click on export button (support both normal and image buttons)
        if btn_export_type == "image":
            export_payload[f"{btn_export_name}.x"] = "15"
            export_payload[f"{btn_export_name}.y"] = "15"
        else:
            export_payload[btn_export_name] = btn_export_val

        # Do NOT use X-Requested-With AJAX headers when exporting files
        non_ajax_headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/134.0.0.0 Safari/537.36"
            ),
            "Referer": self.REPORT_URL,
        }

        print(f"[INFO] POST export trigger -> Downloading Excel file...")
        try:
            export_resp = self.session.post(
                self.REPORT_URL, data=export_payload, headers=non_ajax_headers, timeout=120, stream=True
            )
            export_resp.raise_for_status()
        except Exception as exc:
            raise RuntimeError(f"Export download request failed: {exc}")

        # Stream binary Excel file
        raw_bytes = b"".join(export_resp.iter_content(chunk_size=1024 * 1024))
        return raw_bytes


class ItemMasterTransformer:
    """Handles parsing, cleaning, and transforming of the Excel data."""

    @classmethod
    def clean_column_name(cls, col: str) -> str:
        """Strip BOM, remove special characters, and convert to lowercase snake_case."""
        col = str(col).replace("\ufeff", "").strip()
        # Keep alphanumeric, spaces, and underscores
        col = re.sub(r"[^a-zA-Z0-9\s\_]", "", col)
        # Spaces or multiples to single underscore
        col = re.sub(r"[\s]+", "_", col)
        col = re.sub(r"_+", "_", col)
        return col.lower().strip("_")

    def transform(self, raw_bytes: bytes, filter_range_str: str) -> pd.DataFrame:
        """Parse Excel from memory and perform primary data transformations."""
        if not raw_bytes:
            return pd.DataFrame()

        # Check if downloaded file is actually HTML format (common for legacy system exports)
        if b"<table" in raw_bytes.lower() or b"<html" in raw_bytes.lower():
            try:
                html_text = raw_bytes.decode("utf-8", errors="ignore")
                soup = BeautifulSoup(html_text, "html.parser")
                table = soup.find("table")
                if not table:
                    return pd.DataFrame()
                rows = table.find_all("tr")
                if not rows:
                    return pd.DataFrame()

                # Extract headers from first row
                headers = [col.text.strip() for col in rows[0].find_all(["td", "th"])]
                data = []
                for r in rows[1:]:
                    cols = [col.text.strip() for col in r.find_all(["td", "th"])]
                    if cols:
                        if len(cols) < len(headers):
                            cols += [""] * (len(headers) - len(cols))
                        elif len(cols) > len(headers):
                            cols = cols[:len(headers)]
                        data.append(cols)
                df = pd.DataFrame(data, columns=headers)
            except Exception as exc:
                raise ValueError(f"Failed to parse HTML spreadsheet data: {exc}")
        else:
            try:
                df = pd.read_excel(io.BytesIO(raw_bytes), engine="openpyxl")
            except Exception as exc:
                raise ValueError(f"Failed to parse Excel binary data: {exc}")

        if df.empty:
            return df

        # 1. Clean Column Headers
        df.columns = [self.clean_column_name(col) for col in df.columns]

        # 2. Strip whitespace from string columns
        for col in df.columns:
            if df[col].dtype == object:
                df[col] = df[col].astype(str).str.strip()

        # 3. Add audit and metadata columns
        df["filter_range"] = filter_range_str
        df["loaded_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        # 4. Clean Numeric Columns (strip commas and convert)
        for col in df.columns:
            # Skip metadata columns
            if col in ("filter_range", "loaded_at"):
                continue

            if df[col].dtype == object:
                # Heuristic check: does it look like numbers after removing whitespace/commas?
                try:
                    cleaned_series = df[col].astype(str).str.replace(r"[\s,]", "", regex=True)
                    # Convert to numeric, return NaN on failures
                    numeric_series = pd.to_numeric(cleaned_series, errors="coerce")

                    # Count original NaNs or missing elements
                    orig_nans = df[col].isna().sum() + (df[col].astype(str).str.strip().lower() == "nan").sum() + (df[col].astype(str).str.strip() == "").sum()
                    new_nans = numeric_series.isna().sum()

                    # Keep column as numeric if conversion did not degrade data quality
                    if new_nans <= orig_nans + 1 and not numeric_series.isna().all():
                        df[col] = numeric_series
                except Exception:
                    pass

        return df

    def concatenate_and_clean(self, dfs: list[pd.DataFrame]) -> pd.DataFrame:
        """Combine dataframes from all ranges into a single, clean DataFrame."""
        if not dfs:
            return pd.DataFrame()
        combined = pd.concat(dfs, ignore_index=True)
        return combined


# ─────────────────────────── Pipeline ─────────────────────────────────────────

class ItemMasterPipeline:
    """Orchestrates Fetching, Transforming, and saving of ItemMaster data."""

    def __init__(self, output_dir: Path = DEFAULT_OUTPUT_DIR) -> None:
        self.output_dir = output_dir

    def run(self) -> Optional[Path]:
        """Run the full extraction and transformation pipeline."""
        start_time = datetime.now()
        ts = start_time.strftime("%Y-%m-%d %H:%M:%S")
        print("\n" + "=" * 60)
        print("  ItemMasterPipeline Execution")
        print(f"  Started : {ts}")
        print(f"  Output  : {self.output_dir}")
        print("=" * 60 + "\n")

        # Initialize Fetcher (loads credentials.ini)
        try:
            fetcher = ItemMasterFetcher()
        except Exception as exc:
            print(f"[ERROR] Fetcher initialization failed: {exc}")
            return None

        # Authenticate
        try:
            fetcher.login()
        except Exception as exc:
            print(f"[ERROR] Login failed -> {exc}")
            print("[INFO] Skipping this run due to login failure.")
            return None

        # Process each range and section
        transformer = ItemMasterTransformer()
        collected_dfs: list[pd.DataFrame] = []
        
        try:
            available_sections = fetcher.get_available_sections()
        except Exception as exc:
            print(f"[ERROR] Could not get sections: {exc}")
            available_sections = ["T27122"] # Fallback

        for section in available_sections:
            for start_code, end_code in FILTER_RANGES:
                range_str = f"{start_code} - {end_code} (Section: {section})"
                print(f"\n[INFO] --- Processing Range: {range_str} ---")

                try:
                    raw_bytes = fetcher.fetch_range(section, start_code, end_code)
                    df_range = transformer.transform(raw_bytes, range_str)

                    if not df_range.empty:
                        collected_dfs.append(df_range)
                        print(f"[SUCCESS] Fetched {len(df_range):,} rows for {range_str}")
                    else:
                        print(f"[WARN] No data returned for {range_str}")

                except Exception as exc:
                    print(f"[ERROR] {range_str} failed: {exc}")
                    print("[INFO] Skipping this and continuing...")

        if not collected_dfs:
            print("\n[WARN] No data was collected across any ranges or sections. Pipeline aborted.")
            return None

        # Consolidate and clean
        combined_df = transformer.concatenate_and_clean(collected_dfs)
        print(f"\n[INFO] Consolidating data: total {len(combined_df):,} rows.")
        
        # Upload to Database
        try:
            uploader = ItemMasterDatabaseUploader()
            uploader.upload(combined_df)
        except Exception as exc:
            print(f"[ERROR] Database upload failed: {exc}")

        # Save to output folder
        self.output_dir.mkdir(parents=True, exist_ok=True)
        filename_ts = datetime.now().strftime("%Y%m%d_%H%M")
        output_file = self.output_dir / f"{FILE_PREFIX}_{filename_ts}.xlsx"

        try:
            combined_df.to_excel(output_file, index=False, engine="openpyxl")
        except Exception as exc:
            print(f"[ERROR] Failed to save Excel file: {exc}")
            return None

        elapsed = (datetime.now() - start_time).total_seconds()
        print("\n" + "=" * 60)
        print(f"[SUCCESS] Pipeline complete in {elapsed:.1f}s")
        print(f"[SUCCESS] Output saved -> {output_file.name}")
        print("=" * 60 + "\n")
        return output_file


        return output_file


# ─────────────────────────── Database Uploader ──────────────────────────────

class ItemMasterDatabaseUploader:
    """Uploads the parsed ItemMaster DataFrame to the target SQL Server database."""
    
    def __init__(self):
        env_path = Path(__file__).resolve().parent.parent.parent / "backend" / ".env"
        self.config = dotenv_values(env_path)
        
        self.uid = self.config.get("DB_USER_APP", "")
        self.pwd = self.config.get("DB_PASSWORD", "")
        
        # New database server for ItemMaster_Raw
        self.target_server = "pbgm8g"
        self.target_db = "PurchaseAutoload"
        self.target_table = "tb_ItemMaster_Raw"
        
        # Legacy database server for STK_LOC_Sync
        self.legacy_server = self.config.get("DB_SERVER", "pbp155")
        self.legacy_db = self.config.get("DB_NAME", "db_Tooling")

    def _get_connection(self, server: str, db: str):
        conn_str = (
            f"DRIVER={{ODBC Driver 17 for SQL Server}};"
            f"SERVER={server};"
            f"UID={self.uid};"
            f"PWD={self.pwd};"
            f"DATABASE={db};"
        )
        return pyodbc.connect(conn_str)

    def _create_table_if_not_exists(self, cursor, df: pd.DataFrame):
        # We define a basic mapping from pandas dtype to SQL Server types.
        # Everything can default to NVARCHAR(MAX) or similar since it's raw scraped data.
        columns = []
        for col in df.columns:
            dtype = str(df[col].dtype)
            if "float" in dtype:
                sql_type = "FLOAT"
            elif "int" in dtype:
                sql_type = "INT"
            elif "datetime" in dtype:
                sql_type = "DATETIME"
            else:
                sql_type = "NVARCHAR(500)"
            columns.append(f"[{col}] {sql_type}")
            
        col_defs = ",\n".join(columns)
        create_sql = f"""
        IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[{self.target_table}]') AND type in (N'U'))
        BEGIN
            CREATE TABLE [dbo].[{self.target_table}] (
                {col_defs},
                [sys_loaded_at] DATETIME DEFAULT GETDATE()
            )
        END
        """
        cursor.execute(create_sql)

    def upload(self, df: pd.DataFrame) -> None:
        if df.empty:
            print("[WARN] DataFrame is empty. Skipping database upload.")
            return
            
        print(f"[INFO] Uploading {len(df)} rows to {self.target_server}..{self.target_table}...")
        
        # 1. Upload to PurchaseAutoload (New Data)
        try:
            with self._get_connection(self.target_server, self.target_db) as conn:
                cursor = conn.cursor()
                
                # Create table
                self._create_table_if_not_exists(cursor, df)
                
                # Truncate
                cursor.execute(f"TRUNCATE TABLE [dbo].[{self.target_table}]")
                
                # Insert
                cols = ",".join([f"[{c}]" for c in df.columns])
                params = ",".join(["?"] * len(df.columns))
                insert_sql = f"INSERT INTO [dbo].[{self.target_table}] ({cols}) VALUES ({params})"
                
                # Convert NaNs to None for pyodbc
                df_insert = df.replace({pd.NA: None, float('nan'): None})
                
                # Batch insert (fast_executemany requires fast driver, fallback to loop if needed)
                cursor.fast_executemany = True
                data = [tuple(row) for row in df_insert.to_numpy()]
                cursor.executemany(insert_sql, data)
                conn.commit()
                print(f"[SUCCESS] Uploaded to {self.target_server}")
        except Exception as e:
            print(f"[ERROR] Failed to upload to {self.target_server}: {e}")
            raise

        # 1.1 Upload to DB155 (Legacy Server) so Stored_Get_IssueAS400_History has live stock
        try:
            print(f"[INFO] Uploading {len(df)} rows to {self.legacy_server}..{self.target_table}...")
            with self._get_connection(self.legacy_server, self.legacy_db) as conn:
                cursor = conn.cursor()
                self._create_table_if_not_exists(cursor, df)
                cursor.execute(f"TRUNCATE TABLE [dbo].[{self.target_table}]")
                cursor.fast_executemany = True
                cursor.executemany(insert_sql, data)
                conn.commit()
                print(f"[SUCCESS] Uploaded to {self.legacy_server}")
        except Exception as e:
            print(f"[WARN] Failed to upload to {self.legacy_server}: {e}")

        # 2. Update Sync Table on Legacy Server
        try:
            print(f"[INFO] Updating Sync timestamp on {self.legacy_server}..tb_STK_LOC_Sync...")
            with self._get_connection(self.legacy_server, self.legacy_db) as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'master')
                    BEGIN
                        EXEC('CREATE SCHEMA [master]');
                    END;

                    IF OBJECT_ID('[master].[tb_STK_LOC_Sync]', 'U') IS NULL
                    BEGIN
                        CREATE TABLE [master].[tb_STK_LOC_Sync] (
                            ItemNo NVARCHAR(50) PRIMARY KEY,
                            StockLoc NVARCHAR(255),
                            LastUpdated DATETIME DEFAULT GETDATE()
                        );
                    END;

                    IF COL_LENGTH('[master].[tb_STK_LOC_Sync]', 'LastUpdated') IS NULL
                    BEGIN
                        ALTER TABLE [master].[tb_STK_LOC_Sync] ADD LastUpdated DATETIME NULL;
                    END;

                    IF EXISTS (SELECT TOP 1 1 FROM [master].[tb_STK_LOC_Sync])
                        UPDATE [master].[tb_STK_LOC_Sync] SET LastUpdated = GETDATE();
                    ELSE
                        INSERT INTO [master].[tb_STK_LOC_Sync] (ItemNo, StockLoc, LastUpdated)
                        VALUES ('SYNC_JOB', 'N/A', GETDATE());
                """)
                conn.commit()
                print(f"[SUCCESS] Updated Sync timestamp on {self.legacy_server}")
        except Exception as e:
            print(f"[WARN] Failed to update sync timestamp on {self.legacy_server}: {e}")


# ───────────────────────── Scheduler Classes ──────────────────────────────────

class IntervalScheduler:
    """Runs the pipeline repeatedly on a fixed interval."""

    def __init__(self, pipeline: ItemMasterPipeline, interval_minutes: int) -> None:
        self._pipeline = pipeline
        self._interval = interval_minutes

    def start(self) -> None:
        """Block and loop forever. Stop with Ctrl+C."""
        print(f"[SCHEDULER] Interval mode -- running every {self._interval} minute(s).")
        print(f"[SCHEDULER] Output directory: {self._pipeline.output_dir}")
        print("[SCHEDULER] Press Ctrl+C to stop.\n")

        run_count = 0
        while True:
            run_count += 1
            print(f"[SCHEDULER] Run #{run_count} starting...")
            try:
                self._pipeline.run()
            except KeyboardInterrupt:
                raise
            except Exception as exc:
                print(f"[ERROR] Run #{run_count} crashed: {exc}")

            next_run = datetime.now() + timedelta(minutes=self._interval)
            print(
                f"[SCHEDULER] Next run at {next_run.strftime('%H:%M:%S')} "
                f"(sleeping {self._interval} min)..."
            )
            time.sleep(self._interval * 60)


class DailyScheduler:
    """Runs the pipeline once per day at a fixed wall-clock time."""

    def __init__(self, pipeline: ItemMasterPipeline, schedule_time: str) -> None:
        self._pipeline = pipeline
        self._schedule_time = schedule_time

    def start(self) -> None:
        """Block and loop forever. Stop with Ctrl+C."""
        print(f"[SCHEDULER] Daily mode -- running daily at {self._schedule_time}.")
        print(f"[SCHEDULER] Output directory: {self._pipeline.output_dir}")
        print("[SCHEDULER] Press Ctrl+C to stop.\n")

        run_count = 0
        while True:
            now = datetime.now()
            target_time = datetime.strptime(self._schedule_time, "%H:%M").time()
            target_dt = datetime.combine(now.date(), target_time)

            if now >= target_dt:
                # Target time already passed today, schedule for tomorrow
                target_dt += timedelta(days=1)

            sleep_secs = (target_dt - now).total_seconds()
            hours, rem = divmod(int(sleep_secs), 3600)
            mins = rem // 60

            print(
                f"[SCHEDULER] Next run at {target_dt.strftime('%Y-%m-%d %H:%M:%S')} "
                f"(in {hours}h {mins}m)"
            )

            try:
                time.sleep(sleep_secs)
            except KeyboardInterrupt:
                raise

            run_count += 1
            print(f"[SCHEDULER] Run #{run_count} starting...")
            try:
                self._pipeline.run()
            except KeyboardInterrupt:
                raise
            except Exception as exc:
                print(f"[ERROR] Run #{run_count} crashed: {exc}")

            # Jitter prevention: sleep briefly to avoid multiple firings on target second
            time.sleep(61)


# ─────────────────────────── CLI Entry ────────────────────────────────────────

def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="auto_load_item_master",
        description="Scrape, clean, and consolidate ItemMaster report data from iPBASS portal.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples
--------
  # One-off execution (run once, save Excel, and exit)
  python auto_load_item_master.py

  # Interval scheduler: run every 15 minutes
  python auto_load_item_master.py --interval 15

  # Daily scheduler: run daily at 08:30 AM
  python auto_load_item_master.py --schedule 08:30

  # Override output folder
  python auto_load_item_master.py --output-dir D:/PowerBI/Outputs
        """,
    )

    # Scheduler settings
    sched = p.add_argument_group("Scheduler mode (choose one)")
    mode = sched.add_mutually_exclusive_group()
    mode.add_argument(
        "--schedule", type=str, metavar="HH:MM",
        help="Run daily at this specific wall-clock time, e.g. 08:30"
    )
    mode.add_argument(
        "--interval", type=int, metavar="N",
        help="Run repeatedly every N minutes, e.g. 10"
    )

    # Output settings
    p.add_argument(
        "--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR,
        metavar="PATH",
        help=f"Target output directory for the final Excel (default: Raw_output_data folder in same dir)"
    )

    return p


def main() -> None:
    parser = _build_parser()
    args = parser.parse_args()

    # Validate schedule format
    if args.schedule:
        try:
            datetime.strptime(args.schedule, "%H:%M")
        except ValueError:
            parser.error("--schedule requires HH:MM format (24h), e.g. 08:30")

    # Validate interval value
    if args.interval is not None and args.interval <= 0:
        parser.error("--interval must be a positive integer greater than 0")

    pipeline = ItemMasterPipeline(output_dir=args.output_dir)

    # Daily Scheduler
    if args.schedule:
        try:
            DailyScheduler(pipeline, args.schedule).start()
        except KeyboardInterrupt:
            print("\n[INFO] Scheduler stopped by user.")
        return

    # Interval Scheduler
    if args.interval:
        try:
            IntervalScheduler(pipeline, args.interval).start()
        except KeyboardInterrupt:
            print("\n[INFO] Scheduler stopped by user.")
        return

    # One-off execution
    pipeline.run()


if __name__ == "__main__":
    main()
