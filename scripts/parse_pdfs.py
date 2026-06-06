#!/usr/bin/env python3
"""Parse Rosetta Stone Dutch PDFs → content/units.json"""

import json
import re
from pathlib import Path
import pdfplumber

DUTCH_DIR = Path(
    "/Users/Fancy/Library/CloudStorage/"
    "GoogleDrive-sl1217@georgetown.edu/My Drive/Language/Dutch"
)
OUTPUT_FILE = Path(__file__).parent.parent / "content" / "units.json"

# Each PDF uses internal unit numbers 1-4; offset maps to global unit numbers
PDF_FILES = [
    ("NED_L1-4.pdf", 0),   # internal 1-4 → global 1-4
    ("NED_5-8.pdf",  4),   # internal 1-4 → global 5-8
    ("NED_9-12.pdf", 8),   # internal 1-4 → global 9-12
]

UNIT_NAMES = {
    1: "Basis van de taal",
    2: "Begroeting en kennismaking",
    3: "Werk en school",
    4: "Winkelen",
    5: "Reizen",
    6: "Verleden en toekomst",
    7: "Vrienden en vrije tijd",
    8: "Eten en vakantie",
    9: "Wonen en gezondheid",
    10: "Leven in de wereld",
    11: "Alledaagse zaken",
    12: "Plaatsen en gebeurtenissen",
}

UNIT_FOLDERS = {
    1: "NED_L1U01", 2: "NED_L1U02", 3: "NED_L1U03", 4: "NED_L1U04",
    5: "NED_L2U05", 6: "NED_L2U06", 7: "NED_L2U07", 8: "NED_L2U08",
    9: "NED_L3U09", 10: "NED_L3U10", 11: "NED_L3U11", 12: "NED_L3U12",
}


# ── Word / line utilities ────────────────────────────────────────────────────

def group_into_lines(words, tol=4):
    """Cluster words into text lines by vertical proximity, left-to-right order."""
    if not words:
        return []
    sorted_w = sorted(words, key=lambda w: w["top"])
    lines, cur = [], [sorted_w[0]]
    for w in sorted_w[1:]:
        if abs(w["top"] - cur[0]["top"]) <= tol:
            cur.append(w)
        else:
            lines.append(sorted(cur, key=lambda w: w["x0"]))
            cur = [w]
    lines.append(sorted(cur, key=lambda w: w["x0"]))
    return lines


def line_text(words):
    return " ".join(w["text"] for w in words).strip()


# ── Lesson header detection ──────────────────────────────────────────────────

HEADER_TYPES = {"Hoofdles", "Vervolg", "Mijlpaal"}

def detect_header(line):
    """Return (pdf_unit, sublesson, header_type) or None."""
    if len(line) < 2:
        return None
    first, second = line[0]["text"], line[1]["text"]
    # First word looks like "1.1" but bullet char may render as non-dot
    if not re.match(r"^\d.\d$", first):
        return None
    if second not in HEADER_TYPES:
        return None
    return int(first[0]), int(first[2]), second


# ── Column parser ────────────────────────────────────────────────────────────

def parse_column(lines, num_x_min, num_x_max):
    """
    Parse one column's lines into segments: [(pdf_unit, sublesson, type, items), ...]
    Items with no preceding header go into a segment with type=None.
    """
    segments = []
    cur_header = None   # (pdf_unit, sublesson, type)
    cur_items = []
    cur_item = None

    def flush():
        if cur_header is not None or cur_items:
            segments.append((cur_header, list(cur_items)))
        cur_items.clear()

    for line in lines:
        if not line:
            continue

        header = detect_header(line)
        if header:
            flush()
            cur_header = header
            cur_item = None
            continue

        first = line[0]
        is_num = (
            re.match(r"^\d{2}$", first["text"])
            and num_x_min <= first["x0"] <= num_x_max
        )

        if is_num:
            cur_item = {"number": int(first["text"]), "sentences": []}
            cur_items.append(cur_item)
            rest = line_text(line[1:])
            if rest:
                cur_item["sentences"].append(rest)
        elif cur_item is not None:
            txt = line_text(line)
            if txt:
                cur_item["sentences"].append(txt)

    flush()
    return segments


# ── Page parser ──────────────────────────────────────────────────────────────

def parse_page(page):
    """Return list of (header_tuple_or_None, items) for both columns."""
    words = page.extract_words()
    if not words:
        return []

    mid = page.width / 2   # ≈ 270 for these PDFs

    left_lines  = group_into_lines([w for w in words if w["x0"] < mid])
    right_lines = group_into_lines([w for w in words if w["x0"] >= mid])

    # Left col: item numbers at x0 ≈ 36  →  range 25–58
    # Right col: item numbers at x0 ≈ 278 → range 260–295
    left_segs  = parse_column(left_lines,  25, 58)
    right_segs = parse_column(right_lines, 260, 295)

    return left_segs + right_segs


# ── PDF-level parser ─────────────────────────────────────────────────────────

def parse_pdf(pdf_path, unit_offset):
    """
    Parse one PDF and return a dict of global_lesson_id → lesson data.
    unit_offset converts PDF-internal unit numbers to global unit numbers.
    """
    lessons = {}
    current_lid = None   # current global lesson id

    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            for header, items in parse_page(page):
                if header is None:
                    # Continuation with no header — append to current lesson
                    if current_lid and items:
                        lessons[current_lid]["items"].extend(items)
                    continue

                pdf_unit, sublesson, htype = header
                global_unit = pdf_unit + unit_offset
                global_lid = f"{global_unit}.{sublesson}"

                if htype == "Vervolg":
                    # Continue whichever lesson is current (same ID)
                    if current_lid and items:
                        lessons[current_lid]["items"].extend(items)
                else:
                    # New lesson
                    current_lid = global_lid
                    if global_lid not in lessons:
                        lessons[global_lid] = {
                            "id": global_lid,
                            "type": htype,
                            "unit": global_unit,
                            "sublesson": sublesson,
                            "items": [],
                        }
                    lessons[global_lid]["items"].extend(items)

    return lessons


# ── Audio file mapping ───────────────────────────────────────────────────────

def get_lesson_audio(unit_folder_name, sublesson):
    """Return dict of audio type → filename for a specific sublesson."""
    folder = DUTCH_DIR / unit_folder_name
    if not folder.exists() or sublesson == 5:
        return {}
    audio = {}
    for f in sorted(folder.glob("*.mp3")):
        m = re.match(rf"\d+ - Lesson {sublesson} (.+)\.mp3", f.name)
        if m:
            key = m.group(1).lower().replace(" ", "_")
            audio[key] = f.name
    return audio


# ── Final assembly ───────────────────────────────────────────────────────────

def build_output(all_lessons):
    units_map = {}

    for lid, lesson in all_lessons.items():
        u = lesson["unit"]
        if u not in units_map:
            units_map[u] = {
                "id": UNIT_FOLDERS[u],
                "unit": u,
                "level": (u - 1) // 4 + 1,
                "name": UNIT_NAMES[u],
                "folder": UNIT_FOLDERS[u],
                "lessons": [],
            }

        # Deduplicate items by number (Vervolg pages can cause duplicates)
        seen = {}
        for item in lesson["items"]:
            n = item["number"]
            if n not in seen:
                seen[n] = item
        deduped = [seen[k] for k in sorted(seen)]

        # Assign stable IDs
        items_out = []
        for item in deduped:
            item_id = f"{UNIT_FOLDERS[u]}-{lid}-{item['number']:02d}"
            items_out.append({
                "id": item_id,
                "number": item["number"],
                "sentences": item["sentences"],
            })

        units_map[u]["lessons"].append({
            "id": lid,
            "type": lesson["type"],
            "sublesson": lesson["sublesson"],
            "audio": get_lesson_audio(UNIT_FOLDERS[u], lesson["sublesson"]),
            "items": items_out,
        })

    units = []
    for u in sorted(units_map):
        unit = units_map[u]
        unit["lessons"] = sorted(unit["lessons"], key=lambda l: l["sublesson"])
        units.append(unit)

    return {"units": units}


# ── Entry point ──────────────────────────────────────────────────────────────

def main():
    all_lessons = {}

    for pdf_name, unit_offset in PDF_FILES:
        pdf_path = DUTCH_DIR / pdf_name
        print(f"Parsing {pdf_name}...")
        lessons = parse_pdf(pdf_path, unit_offset)
        print(f"  Found {len(lessons)} lessons")
        all_lessons.update(lessons)

    output = build_output(all_lessons)

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    # Print summary
    total_items = 0
    for unit in output["units"]:
        unit_items = sum(len(l["items"]) for l in unit["lessons"])
        total_items += unit_items
        print(f"  Unit {unit['unit']:2d} ({unit['name']:<30s}): "
              f"{len(unit['lessons'])} lessons, {unit_items} items")

    print(f"\nTotal: {total_items} items across {len(output['units'])} units")
    print(f"Written to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
