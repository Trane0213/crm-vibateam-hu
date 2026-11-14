"""P3 független újraszámolás-ellenőrzés LibreOffice-szal (QA, nem része az alkalmazásnak).

Használat: python3 scripts/qa/pricing_libreoffice_check.py <árazott.xlsx> [további.xlsx ...]
A képletcellák mentett eredményét eltávolítja egy másolatban, LibreOffice-szal fejetlenül újraszámoltatja,
majd összeveti az árazómotor által a kimenetbe írt mentett eredményekkel. Ügyféladatot nem ír, nem küld.
"""
import re, shutil, subprocess, sys, tempfile, zipfile, os
from openpyxl import load_workbook

def strip_cached(src, dst):
    with zipfile.ZipFile(src) as zin, zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if item.filename.startswith("xl/worksheets/") and item.filename.endswith(".xml"):
                xml = data.decode("utf-8")
                xml = re.sub(r"(<c\b[^>]*>)(\s*<f\b[^>]*(?:/>|>[\s\S]*?</f>))\s*<v>[\s\S]*?</v>", r"\1\2", xml)
                data = xml.encode("utf-8")
            zout.writestr(item, data)

def check(path):
    tmp = tempfile.mkdtemp()
    stripped = os.path.join(tmp, "stripped.xlsx")
    strip_cached(path, stripped)
    out_dir = os.path.join(tmp, "lo")
    subprocess.run(["soffice", "--headless", "--norestore", "--convert-to", "xlsx", "--outdir", out_dir, stripped], check=True, capture_output=True, timeout=180)
    lo = load_workbook(os.path.join(out_dir, "stripped.xlsx"), data_only=True)
    ours = load_workbook(path, data_only=True)
    formulas = load_workbook(path, data_only=False)
    compared = mismatches = 0
    examples = []
    for ws in formulas.worksheets:
        for row in ws.iter_rows():
            for c in row:
                if isinstance(c.value, str) and c.value.startswith("="):
                    a = ours[ws.title][c.coordinate].value
                    b = lo[ws.title][c.coordinate].value
                    if isinstance(a, (int, float)) or isinstance(b, (int, float)):
                        compared += 1
                        if not (isinstance(a, (int, float)) and isinstance(b, (int, float)) and abs(a - b) <= 0.01 + 1e-9 * abs(a)):
                            mismatches += 1
                            if len(examples) < 5: examples.append((ws.title, c.coordinate, c.value[:40], a, b))
    shutil.rmtree(tmp, ignore_errors=True)
    print(f"{os.path.basename(path)}: LibreOffice-újraszámolás, {compared} numerikus képletcella összevetve, eltérés: {mismatches}", examples)
    return mismatches == 0

if __name__ == "__main__":
    ok = all([check(p) for p in sys.argv[1:]])
    sys.exit(0 if ok else 1)
