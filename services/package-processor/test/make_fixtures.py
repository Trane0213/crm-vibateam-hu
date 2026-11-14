# Kitalált TESZT-mintafájlok a feldolgozó tesztjeihez (valós ügyféladat nélkül).
import io, os, sys, zipfile
from PIL import Image, ImageDraw, ImageFont

out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "fixtures")
os.makedirs(out, exist_ok=True)

def pdf(pages):
    """pages: list of ('text', str) | ('image', jpeg_bytes, w, h)"""
    objs = []
    def add(b): objs.append(b); return len(objs)
    font = add(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    kids = []
    page_ids_placeholder = []
    pages_id = None
    contents = []
    for p in pages:
        if p[0] == "text":
            lines = p[1].split("\n")
            ops = "BT /F1 14 Tf 60 780 Td 18 TL " + " ".join("(" + l.replace("(", "\\(").replace(")", "\\)") + ") '" for l in lines) + " ET"
            c = add(b"<< /Length %d >>\nstream\n" % len(ops) + ops.encode("latin-1") + b"\nendstream")
            contents.append((c, None))
        else:
            jpg, w, h = p[1], p[2], p[3]
            im = add(b"<< /Type /XObject /Subtype /Image /Width %d /Height %d /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length %d >>\nstream\n" % (w, h, len(jpg)) + jpg + b"\nendstream")
            ops = b"q 595 0 0 842 0 0 cm /Im1 Do Q"
            c = add(b"<< /Length %d >>\nstream\n" % len(ops) + ops + b"\nendstream")
            contents.append((c, im))
    pages_id = len(objs) + len(contents) + 1
    for c, im in contents:
        res = b"<< /Font << /F1 %d 0 R >>" % font + (b" /XObject << /Im1 %d 0 R >>" % im if im else b"") + b" >>"
        kids.append(add(b"<< /Type /Page /Parent %d 0 R /MediaBox [0 0 595 842] /Resources " % pages_id + res + b" /Contents %d 0 R >>" % c))
    assert add(b"<< /Type /Pages /Kids [" + b" ".join(b"%d 0 R" % k for k in kids) + b"] /Count %d >>" % len(kids)) == pages_id
    cat = add(b"<< /Type /Catalog /Pages %d 0 R >>" % pages_id)
    buf = io.BytesIO(); buf.write(b"%PDF-1.4\n"); offs = []
    for i, o in enumerate(objs, 1):
        offs.append(buf.tell()); buf.write(b"%d 0 obj\n" % i + o + b"\nendobj\n")
    x = buf.tell(); buf.write(b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1))
    for o in offs: buf.write(b"%010d 00000 n \n" % o)
    buf.write(b"trailer\n<< /Size %d /Root %d 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, cat, x))
    return buf.getvalue()

def scan_jpeg(text):
    img = Image.new("RGB", (1240, 1754), "white"); d = ImageDraw.Draw(img)
    try: f = ImageFont.truetype("DejaVuSans.ttf", 48)
    except Exception: f = ImageFont.load_default()
    y = 200
    for line in text.split("\n"): d.text((120, y), line, fill="black", font=f); y += 80
    b = io.BytesIO(); img.save(b, "JPEG", quality=80); return b.getvalue(), img.width, img.height

jpg, w, h = scan_jpeg("TESZT szkennelt oldal\nE-03 kapcsolasi rajz\nElosztoszekreny ESZ-1")
open(os.path.join(out, "tervlap-vegyes.pdf"), "wb").write(pdf([
    ("text", "TESZT Kiviteli terv\nE-01 Alaprajz - Erosaram\nTervszam: VT-E-01 rev B\nSzekreny: ESZ-1, ESZ-2"),
    ("image", jpg, w, h),
    ("text", "TESZT Muszaki leiras\nKabelezes NYY-J 3x2,5 mm2\nVilagitasi aramkorok: 12 db"),
]))
open(os.path.join(out, "scan.jpg"), "wb").write(jpg)

z = zipfile.ZipFile(os.path.join(out, "csomag.zip"), "w", zipfile.ZIP_DEFLATED)
z.writestr("Terv/E-Erosaram/E-01.pdf", pdf([("text", "TESZT E-01 alaprajz\nTervszam VT-E-01")]))
z.writestr("Terv/G-Gyengearam/G-01.pdf", pdf([("text", "TESZT G-01 gyengearam\nTervszam VT-G-01")]))
z.writestr("Koltsegvetes/leiras.txt", "TESZT muszaki leiras\nKabeltalca 50 m\n")
z.writestr("Koltsegvetes/masolat.txt", "TESZT muszaki leiras\nKabeltalca 50 m\n")
z.writestr("__MACOSX/._E-01.pdf", b"x")
z.writestr("Terv/", b"")
z.close()

z = zipfile.ZipFile(os.path.join(out, "veszelyes.zip"), "w", zipfile.ZIP_DEFLATED)
z.writestr("../../etc/kitores.txt", "TESZT")
z.writestr("/abszolut.txt", "TESZT")
z.writestr("rendben/ok.txt", "TESZT rendben")
z.close()

z = zipfile.ZipFile(os.path.join(out, "bomba.zip"), "w", zipfile.ZIP_DEFLATED)
z.writestr("nagy.txt", b"0" * (60 * 1024 * 1024))
z.close()
print("ok", sorted(os.listdir(out)))
