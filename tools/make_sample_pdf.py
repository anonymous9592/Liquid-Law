"""Fabricate a *scanned-looking* (image-only, no text layer) legal PDF for testing.

Usage:  python tools/make_sample_pdf.py  [out.pdf]
"""
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1240, 1754  # A4 at 150 dpi
MARGIN = 120
FONT = r"C:\Windows\Fonts\times.ttf"
FONT_B = r"C:\Windows\Fonts\timesbd.ttf"

body = ImageFont.truetype(FONT, 30)
bold = ImageFont.truetype(FONT_B, 32)
title = ImageFont.truetype(FONT_B, 40)

LOREM = (
    "That the Petitioner is a law-abiding citizen of India and is entitled to the "
    "protection of the fundamental rights guaranteed under Part III of the Constitution. "
    "The Respondent authority, without affording any opportunity of hearing, passed the "
    "impugned order dated 12.03.2024 which is arbitrary, illegal and violative of the "
    "principles of natural justice. The Petitioner has no other efficacious remedy."
)


def wrap(draw, text, font, max_w):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if draw.textlength(t, font=font) <= max_w:
            cur = t
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


class Page:
    def __init__(self, n):
        self.img = Image.new("L", (W, H), 255)
        self.d = ImageDraw.Draw(self.img)
        self.y = MARGIN
        self.n = n

    def center(self, text, font=title, gap=24):
        tw = self.d.textlength(text, font=font)
        self.d.text(((W - tw) / 2, self.y), text, font=font, fill=0)
        self.y += font.size + gap

    def heading(self, text, font=bold, gap=18):
        self.d.text((MARGIN, self.y), text, font=font, fill=0)
        self.y += font.size + gap

    def para(self, text, indent=0, font=body, gap=16):
        for ln in wrap(self.d, text, font, W - 2 * MARGIN - indent):
            self.d.text((MARGIN + indent, self.y), ln, font=font, fill=0)
            self.y += font.size + 8
        self.y += gap

    def space(self, px=30):
        self.y += px

    def finish(self):
        d = self.d
        d.text((W / 2 - 15, H - 80), str(self.n), font=body, fill=0)
        # "scan" artefacts: slight rotation, blur, noise, grey tint
        img = self.img.rotate(random.uniform(-0.6, 0.6), fillcolor=255, resample=Image.BICUBIC)
        img = img.filter(ImageFilter.GaussianBlur(0.6))
        px = img.load()
        for _ in range(4000):
            x, y = random.randrange(W), random.randrange(H)
            px[x, y] = max(0, px[x, y] - random.randrange(60, 120))
        img = Image.eval(img, lambda v: min(255, int(v * 0.96 + 8)))
        return img.convert("RGB")


def build():
    pages = []
    n = 1

    p = Page(n); n += 1
    p.center("IN THE HIGH COURT OF KARNATAKA AT BENGALURU")
    p.center("WRIT PETITION No. 14521 OF 2024 (GM-RES)", font=bold)
    p.space(40)
    p.center("INDEX", font=title, gap=40)
    rows = [
        ("Synopsis and List of Dates", "2"),
        ("Memo of Parties", "3"),
        ("Pleadings", "4"),
        ("Grounds", "6"),
        ("Prayer", "8"),
        ("Verification", "8"),
        ("Annexure P-1  Impugned Order dated 12.03.2024", "9"),
    ]
    for i, (t, pg) in enumerate(rows, 1):
        p.d.text((MARGIN, p.y), f"{i}.  {t}", font=body, fill=0)
        p.d.text((W - MARGIN - 40, p.y), pg, font=body, fill=0)
        p.y += 48
    pages.append(p.finish())

    p = Page(n); n += 1
    p.center("SYNOPSIS", font=title)
    p.para(LOREM)
    p.para(LOREM)
    p.center("LIST OF DATES", font=title)
    for dt, ev in [("01.01.2023", "Petitioner applied for licence under the Act."),
                   ("15.06.2023", "Show-cause notice issued without particulars."),
                   ("12.03.2024", "Impugned order passed cancelling the licence."),
                   ("20.03.2024", "Hence the present Writ Petition.")]:
        p.para(f"{dt}      {ev}", gap=4)
    pages.append(p.finish())

    p = Page(n); n += 1
    p.center("MEMO OF PARTIES", font=title)
    p.heading("BETWEEN:")
    p.para("Sri Ramesh Kumar, aged about 45 years, S/o late Sri Gopal Kumar, residing at No. 12, 4th Cross, Jayanagar, Bengaluru - 560011.", indent=40)
    p.heading("... PETITIONER", font=body)
    p.heading("AND:")
    p.para("1. The State of Karnataka, represented by its Principal Secretary, Department of Commerce, Vidhana Soudha, Bengaluru - 560001.", indent=40)
    p.para("2. The Deputy Commissioner, Bengaluru Urban District, Bengaluru - 560009.", indent=40)
    p.heading("... RESPONDENTS", font=body)
    pages.append(p.finish())

    p = Page(n); n += 1
    p.center("PLEADINGS", font=title)
    p.heading("A.  Brief facts of the case")
    p.para("1.  " + LOREM)
    p.para("2.  " + LOREM)
    p.heading("B.  The show-cause notice")
    p.para("3.  " + LOREM)
    pages.append(p.finish())

    p = Page(n); n += 1
    p.para("4.  " + LOREM)
    p.heading("C.  The impugned order")
    p.para("5.  " + LOREM)
    p.heading("    (a)  Absence of reasons", font=body)
    p.para("6.  " + LOREM, indent=40)
    p.heading("    (b)  Violation of natural justice", font=body)
    p.para("7.  " + LOREM, indent=40)
    pages.append(p.finish())

    p = Page(n); n += 1
    p.center("GROUNDS", font=title)
    p.heading("I.  Violation of Article 14 of the Constitution")
    p.para(LOREM)
    p.heading("II.  Violation of Article 19(1)(g)")
    p.para(LOREM)
    pages.append(p.finish())

    p = Page(n); n += 1
    p.heading("III.  The order is without jurisdiction")
    p.para(LOREM)
    p.heading("IV.  Balance of convenience")
    p.para(LOREM)
    pages.append(p.finish())

    p = Page(n); n += 1
    p.center("PRAYER", font=title)
    p.para("Wherefore, the Petitioner most respectfully prays that this Hon'ble Court be pleased to:")
    p.para("(a)  Issue a writ of certiorari quashing the impugned order dated 12.03.2024 (Annexure P-1);", indent=40)
    p.para("(b)  Issue a writ of mandamus directing the Respondents to restore the licence of the Petitioner;", indent=40)
    p.para("(c)  Pass such other orders as this Hon'ble Court deems fit in the circumstances of the case.", indent=40)
    p.center("INTERIM RELIEF", font=title)
    p.para("Pending disposal of the Writ Petition, stay the operation of the impugned order dated 12.03.2024.")
    p.center("VERIFICATION", font=title)
    p.para("I, Ramesh Kumar, the Petitioner herein, do hereby verify that the contents of the above petition are true and correct to the best of my knowledge.")
    pages.append(p.finish())

    p = Page(n); n += 1
    p.center("ANNEXURE P-1", font=title)
    p.center("OFFICE OF THE DEPUTY COMMISSIONER", font=bold)
    p.para("Order No. DC/LIC/2024/0317                                   Dated: 12.03.2024")
    p.para("Whereas the licensee failed to respond to the notice dated 15.06.2023, the licence bearing No. 4471 stands cancelled with immediate effect.")
    p.para("Sd/- Deputy Commissioner")
    pages.append(p.finish())

    return pages


def build_counter():
    """The State's counter affidavit — a second document to cross-link against the petition."""
    pages = []
    n = 1

    p = Page(n); n += 1
    p.center("IN THE HIGH COURT OF KARNATAKA AT BENGALURU")
    p.center("WRIT PETITION No. 14521 OF 2024 (GM-RES)", font=bold)
    p.space(30)
    p.center("STATEMENT OF OBJECTIONS", font=title)
    p.center("FILED ON BEHALF OF RESPONDENTS 1 AND 2", font=bold)
    p.space(20)
    p.heading("PRELIMINARY OBJECTIONS")
    p.para("1.  The Writ Petition is not maintainable as the Petitioner has an alternative and efficacious remedy of appeal under Section 21 of the Act, which has not been availed.")
    p.para("2.  The Petitioner has suppressed the fact that a personal hearing was offered on 10.02.2024 and the Petitioner chose not to appear. The petition deserves dismissal on this ground alone.")
    pages.append(p.finish())

    p = Page(n); n += 1
    p.center("PARAWISE REPLY", font=title)
    p.heading("A.  Reply to Brief facts")
    p.para("3.  The averments in paragraphs 1 and 2 of the petition are denied. The licence was granted subject to conditions which the Petitioner repeatedly violated, as recorded in inspection reports dated 02.04.2023 and 18.05.2023.")
    p.heading("B.  Reply to the show-cause notice")
    p.para("4.  The show-cause notice dated 15.06.2023 set out the particulars of violation in its Annexure. The allegation that it was issued without particulars is false and is denied.")
    p.heading("C.  Reply to the impugned order")
    p.para("5.  The impugned order dated 12.03.2024 was passed after affording an opportunity of hearing on 10.02.2024, a notice of which was served on the Petitioner by registered post.")
    pages.append(p.finish())

    p = Page(n); n += 1
    p.center("REPLY TO GROUNDS", font=title)
    p.heading("I.  Article 14")
    p.para("The classification is reasonable and bears a nexus to the object of the Act. No discrimination is made out.")
    p.heading("II.  Article 19(1)(g)")
    p.para("The right to carry on business is subject to reasonable restrictions in the interest of the general public under Article 19(6).")
    p.heading("III.  Jurisdiction")
    p.para("The Deputy Commissioner is the licensing authority under Section 7 and is fully competent to cancel a licence.")
    pages.append(p.finish())

    p = Page(n); n += 1
    p.center("PRAYER", font=title)
    p.para("It is therefore prayed that this Hon'ble Court be pleased to dismiss the Writ Petition with costs, in the interest of justice.")
    p.center("VERIFICATION", font=title)
    p.para("I, the Deputy Commissioner, Bengaluru Urban District, do hereby verify that the contents of the above objections are true to my knowledge derived from official records.")
    p.center("ANNEXURE R-1", font=title)
    p.center("NOTICE OF PERSONAL HEARING dated 25.01.2024", font=bold)
    p.para("The licensee is hereby called upon to appear before the undersigned on 10.02.2024 at 11.00 a.m. for a personal hearing in connection with the show-cause notice dated 15.06.2023.")
    pages.append(p.finish())
    return pages


if __name__ == "__main__":
    out_dir = Path(sys.argv[1] if len(sys.argv) > 1 else "prototype/sample")
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, fn, seed in [("scanned_petition.pdf", build, 7), ("scanned_counter.pdf", build_counter, 11)]:
        random.seed(seed)
        pages = fn()
        out = out_dir / name
        pages[0].save(out, save_all=True, append_images=pages[1:], resolution=150)
        print(f"wrote {out} ({len(pages)} pages)")
