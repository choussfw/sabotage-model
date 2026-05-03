"""Compute end-of-2025 H100e shares by bloc from RAW in App.jsx."""
import re
from pathlib import Path

src = Path(r"C:/Users/chous/Downloads/maim-aifp/src/App.jsx").read_text(encoding="utf-8")

# Extract RAW = [...]; block
m = re.search(r"const RAW = \[(.*?)^\];", src, re.S | re.M)
body = m.group(1)

# Each row: ["Country", number, sc, "name", year, "E"|"P", chain]
row_re = re.compile(
    r'\[\s*"(?P<country>[^"]+)"\s*,'
    r'\s*(?P<gpus>-?\d+(?:\.\d+)?)\s*,'
    r'\s*(?P<sc>-?\d+)\s*,'
    r'\s*"(?P<name>(?:[^"\\]|\\.)*)"\s*,'
    r'\s*(?P<year>-?\d+(?:\.\d+)?)\s*,'
    r'\s*"(?P<status>[EP])"\s*,'
    r'\s*(?P<chain>-?\d+)\s*\]'
)

rows = []
for mm in row_re.finditer(body):
    rows.append({
        "country": mm.group("country"),
        "gpus": float(mm.group("gpus")),
        "year": float(mm.group("year")),
        "name": mm.group("name"),
    })

print(f"Parsed {len(rows)} rows")

# End of 2025 = year < 2026.0
THRESH = 2026.0
totals = {"US": 0.0, "China": 0.0, "Ally": 0.0, "Other": 0.0}
counts = {"US": 0, "China": 0, "Ally": 0, "Other": 0}
for r in rows:
    if r["year"] < THRESH:
        totals[r["country"]] += r["gpus"]
        counts[r["country"]] += 1

grand = sum(totals.values())
print(f"\n=== Online by end of 2025 (year < {THRESH}) ===")
print(f"{'Bloc':<8}{'Clusters':>10}{'H100e':>15}{'Share':>10}")
for k in ["US", "China", "Ally", "Other"]:
    print(f"{k:<8}{counts[k]:>10}{totals[k]:>15,.0f}{totals[k]/grand:>9.1%}")
print(f"{'Total':<8}{sum(counts.values()):>10}{grand:>15,.0f}{1.0:>9.1%}")

# Also show 2025.99 and stricter "E"-status only for sanity
print("\n=== Existing-status only (status='E' as set in RAW, regardless of year) ===")
totals_e = {"US": 0.0, "China": 0.0, "Ally": 0.0, "Other": 0.0}
counts_e = {"US": 0, "China": 0, "Ally": 0, "Other": 0}
e_re = re.compile(r'"(E)"\s*,\s*-?\d+\s*\]')
# Re-extract with status:
for mm in row_re.finditer(body):
    if mm.group("status") == "E":
        c = mm.group("country")
        totals_e[c] += float(mm.group("gpus"))
        counts_e[c] += 1
grand_e = sum(totals_e.values())
print(f"{'Bloc':<8}{'Clusters':>10}{'H100e':>15}{'Share':>10}")
for k in ["US", "China", "Ally", "Other"]:
    print(f"{k:<8}{counts_e[k]:>10}{totals_e[k]:>15,.0f}{totals_e[k]/grand_e:>9.1%}")
print(f"{'Total':<8}{sum(counts_e.values()):>10}{grand_e:>15,.0f}{1.0:>9.1%}")
