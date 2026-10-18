"""Render the generated deck with PyMuPDF after LibreOffice PDF conversion.
Requires: pip install pymupdf pillow. Does not read or modify the submitted report.
"""
from pathlib import Path
import json, re, zipfile
import fitz
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
out = root / 'research-prep'
meta = json.loads((out / 'presentation.json').read_text(encoding='utf-8'))
doc = fitz.open(out / 'presentation-10min.pdf')
assert len(doc) == meta['totalSlides'] == 15
slides = out / 'slides'
slides.mkdir(exist_ok=True)
report = {'pages': len(doc), 'emptyPages': [], 'outOfBoundsText': [], 'screensInMainSlides': meta['screenSlides'], 'previews': []}
for i, page in enumerate(doc):
    if not page.get_text().strip():
        report['emptyPages'].append(i + 1)
    for block in page.get_text('blocks'):
        if block[0] < -1 or block[1] < -1 or block[2] > page.rect.width + 1 or block[3] > page.rect.height + 1:
            report['outOfBoundsText'].append({'page': i + 1, 'bounds': list(block[:4]), 'text': block[4]})
    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
    img = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
    target = slides / f'slide-{i + 1:02d}.jpg'
    img.save(target, quality=90, optimize=True)
    report['previews'].append(target.relative_to(root).as_posix())
    assert target.stat().st_size > 10000
with zipfile.ZipFile(out / 'presentation-10min.pptx') as z:
    names = z.namelist()
    slide_xml = [n for n in names if re.fullmatch(r'ppt/slides/slide\d+\.xml', n)]
    notes = [n for n in names if re.fullmatch(r'ppt/notesSlides/notesSlide\d+\.xml', n)]
    report['pptxSlides'] = len(slide_xml)
    report['speakerNotes'] = len(notes)
    report['embeddedPictures'] = sum(z.read(n).count(b'<p:pic>') for n in slide_xml)
assert report['speakerNotes'] == 15
assert len(report['screensInMainSlides']) >= 10
assert not report['emptyPages'] and not report['outOfBoundsText'], report
qa = root.parent / 'report-submission-qa' / 'screen-story-render'
qa.mkdir(parents=True, exist_ok=True)
for start, stop in [(0, 9), (9, 15)]:
    count = stop - start
    canvas = Image.new('RGB', (1440, ((count + 2) // 3) * 294), '#dfe7ef')
    for idx in range(start, stop):
        thumb = Image.open(slides / f'slide-{idx + 1:02d}.jpg')
        thumb.thumbnail((470, 265))
        x, y = ((idx - start) % 3) * 480, ((idx - start) // 3) * 294
        canvas.paste(thumb, (x, y))
        ImageDraw.Draw(canvas).text((x + 8, y + 269), f'{idx + 1:02d}', fill='black')
    canvas.save(qa / f'montage-{start + 1:02d}-{stop:02d}.jpg')
(qa / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False))
