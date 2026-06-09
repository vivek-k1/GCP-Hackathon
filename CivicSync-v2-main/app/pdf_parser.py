import re
import json
import os
import pdfplumber
from typing import List, Dict

CHUNKS_CACHE_PATH = "data/bill_chunks_cache.json"


def _load_chunks_cache() -> Dict:
    try:
        with open(CHUNKS_CACHE_PATH) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _save_chunks_cache(cache: Dict) -> None:
    os.makedirs("data", exist_ok=True)
    with open(CHUNKS_CACHE_PATH, "w") as f:
        json.dump(cache, f)


BILL_PATHS: Dict[str, str] = {
    "dpdp": "bills/Digital Personal Data Protection Act 2023.pdf",
    "social_security": "bills/Code on Social Security 2020.pdf",
    "bns": "bills/Bharatiya Nyaya Sanhita 2023.pdf",
    "telecom": "bills/Telecommunications Act 2023.pdf",
    "maha_rent": "bills/Maharashtra Rent Control Act 1999.txt",
}

BILL_DISPLAY_NAMES: Dict[str, str] = {
    "dpdp": "Digital Personal Data Protection Act 2023",
    "social_security": "Code on Social Security 2020",
    "bns": "Bharatiya Nyaya Sanhita 2023",
    "telecom": "Telecommunications Act 2023",
    "maha_rent": "Maharashtra Rent Control Act 1999",
}

BILL_TAGS: Dict[str, str] = {
    "dpdp": "Central",
    "social_security": "Central",
    "bns": "Central",
    "telecom": "Central",
    "maha_rent": "⭐ State · Maharashtra",
}


def extract_bill_text(path: str) -> str:
    """Extract full text from a bill PDF or plain-text file."""
    if path.endswith(".txt"):
        with open(path, encoding="utf-8") as f:
            return f.read()
    pages = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                pages.append(text)
    return "\n".join(pages)


def extract_text_from_bytes(pdf_bytes: bytes, max_pages: int = 100) -> str:
    """Extract text from a PDF given as raw bytes (for user-uploaded files)."""
    import io
    pages = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages[:max_pages]:
            text = page.extract_text()
            if text:
                pages.append(text)
    return "\n".join(pages)


def chunk_by_section(raw_text: str, bill_key: str = "") -> List[Dict]:
    """
    Split bill text into Section-level chunks.
    Keeps subsections and provisos with their parent section.
    Returns list of {section, text, has_provisos, token_count} dicts.
    """
    # Find all section start positions using a forgiving pattern
    # Matches "1. Short title..." or "Section 1." style headings
    section_pattern = re.compile(
        r'(?:^|\n)(\d{1,3})\.\s+([A-Z][^\n]{2,})',
        re.MULTILINE
    )

    matches = list(section_pattern.finditer(raw_text))

    if not matches:
        # Fallback: return entire text as one chunk
        return [{
            "section": "Full Text",
            "text": raw_text[:8000],
            "has_provisos": False,
            "token_count": len(raw_text.split()),
        }]

    sections = []
    for i, match in enumerate(matches):
        section_num = match.group(1)
        start = match.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(raw_text)
        section_text = raw_text[start:end].strip()

        # Skip very short chunks (likely headers)
        if len(section_text.split()) < 10:
            continue

        has_provisos = bool(
            re.search(r'[Pp]rovided that', section_text)
            or re.search(r'[Ss]ubject to', section_text)
        )

        sections.append({
            "section": f"Section {section_num}",
            "text": section_text,
            "has_provisos": has_provisos,
            "token_count": len(section_text.split()),
        })

    return sections


def load_all_bills() -> Dict[str, Dict]:
    """
    Load and chunk all bills.
    On first run: parses PDFs and saves chunks to JSON cache.
    On subsequent runs: loads from cache (much faster).
    """
    cache = _load_chunks_cache()
    bills = {}
    cache_dirty = False

    for key, path in BILL_PATHS.items():
        try:
            if key in cache:
                # Fast path: load from disk cache
                chunks = cache[key]["chunks"]
                text = cache[key].get("text_preview", "")
                print(f"[OK] Loaded {key} from cache: {len(chunks)} sections")
            else:
                # Slow path: parse PDF and cache result
                print(f"[..] Parsing {key} PDF (first run - will be cached)...")
                text = extract_bill_text(path)
                chunks = chunk_by_section(text, key)
                # Store first 10k chars of text for source display
                cache[key] = {
                    "chunks": chunks,
                    "text_preview": text[:50_000],
                }
                cache_dirty = True
                print(f"[OK] Parsed {key}: {len(chunks)} sections")

            bills[key] = {
                "text": cache[key].get("text_preview", ""),
                "chunks": chunks,
                "path": path,
                "display_name": BILL_DISPLAY_NAMES[key],
                "tag": BILL_TAGS.get(key, "Central"),
            }
        except Exception as e:
            print(f"[FAIL] Failed to load {key}: {e}")

    if cache_dirty:
        _save_chunks_cache(cache)
        print("[CACHE] Bill chunks cached to data/bill_chunks_cache.json")

    return bills


if __name__ == "__main__":
    bills = load_all_bills()
    for k, v in bills.items():
        print(f"{k}: {len(v['chunks'])} sections")
        if v["chunks"]:
            s = v["chunks"][0]
            print(f"  First section: {s['section']} ({s['token_count']} tokens)")
