"""
State Bills browser — loads data/bills_states.csv and exposes filter helpers.

Optional: set STATE_BILLS_CSV to an absolute path if the CSV lives outside the repo.
"""
import csv
import re
import os
from typing import List, Dict, Optional, Tuple

# Cached load: (resolved path, mtime) -> rows; avoids stale empty results from @lru_cache
# when the CSV is added after the server starts, and allows relocating the file.
_load_cache: Optional[Tuple[str, float, List[Dict]]] = None


def _resolve_csv_path() -> Optional[str]:
    """First existing path wins: env, package-relative data/, then cwd data/."""
    env = os.environ.get("STATE_BILLS_CSV", "").strip()
    if env and os.path.isfile(env):
        return os.path.abspath(env)
    here = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(here, "..", "data", "bills_states.csv"),
        os.path.join(os.getcwd(), "data", "bills_states.csv"),
    ]
    for p in candidates:
        ap = os.path.abspath(p)
        if os.path.isfile(ap):
            return ap
    return None


def _parse_year(date_str: str) -> Optional[int]:
    """Convert 'Apr-61' / 'Dec-99' / 'Jan-05' → full 4-digit year."""
    m = re.search(r"-(\d{2})$", date_str.strip())
    if not m:
        return None
    yy = int(m.group(1))
    # yy >= 61 → 1961-1999; yy < 61 → 2000-2060
    return 1900 + yy if yy >= 61 else 2000 + yy


def load_state_bills() -> List[Dict]:
    """Return all rows from bills_states.csv with a parsed `year` int field."""
    global _load_cache
    path = _resolve_csv_path()
    if not path:
        _load_cache = None
        return []
    try:
        mtime = os.path.getmtime(path)
    except OSError:
        _load_cache = None
        return []
    if _load_cache and _load_cache[0] == path and _load_cache[1] == mtime:
        return _load_cache[2]

    rows = []
    with open(path, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if not row.get("state", "").strip():
                continue
            row = dict(row)
            row["year"] = _parse_year(row.get("date", ""))
            # Align with API/UI field name (CSV column is `house`)
            if "legislature" not in row and row.get("house"):
                row["legislature"] = row["house"]
            rows.append(row)
    _load_cache = (path, mtime, rows)
    return rows


def get_states() -> List[str]:
    return sorted(set(r["state"] for r in load_state_bills() if r["state"]))


def get_year_range() -> tuple:
    years = [r["year"] for r in load_state_bills() if r["year"]]
    return (min(years), max(years)) if years else (1961, 2024)


def filter_bills(
    state: Optional[str] = None,
    year_from: Optional[int] = None,
    year_to: Optional[int] = None,
    query: str = "",
) -> List[Dict]:
    rows = load_state_bills()
    if state and state != "All States":
        rows = [r for r in rows if r["state"] == state]
    if year_from:
        rows = [r for r in rows if r["year"] and r["year"] >= year_from]
    if year_to:
        rows = [r for r in rows if r["year"] and r["year"] <= year_to]
    if query.strip():
        q = query.strip().lower()
        rows = [r for r in rows if q in r["bill"].lower()]
    return rows
