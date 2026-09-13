from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'word-card-character-reference.jpg'
OUTPUT = ROOT / 'assets' / 'aiedue-literacy-detective.webp'

base = Image.open(SOURCE).convert('RGBA')
art = base.copy()
draw = ImageDraw.Draw(art, 'RGBA')

ink = (48, 34, 24, 255)
brown = (111, 72, 38, 255)
light_brown = (166, 112, 59, 255)
gold = (225, 168, 48, 255)
cream = (255, 244, 205, 230)

# Compact detective shoulder cape and collar. Keep the hoodie and arms visible.
draw.polygon([(236, 690), (350, 635), (480, 704), (610, 635), (724, 690),
              (664, 812), (566, 770), (480, 820), (394, 770), (296, 812)],
             fill=(112, 72, 38, 230), outline=ink)
draw.line([(236, 690), (350, 635), (480, 704), (610, 635), (724, 690)], fill=ink, width=14, joint='curve')
draw.polygon([(365, 650), (480, 704), (422, 770), (346, 674)], fill=(184, 125, 65, 255), outline=ink)
draw.polygon([(595, 650), (480, 704), (538, 770), (614, 674)], fill=(184, 125, 65, 255), outline=ink)
draw.ellipse((452, 690, 508, 746), fill=gold, outline=ink, width=9)

# Deerstalker cap. The sprout pixels are restored over it below.
draw.ellipse((252, 112, 708, 326), fill=brown, outline=ink, width=16)
draw.rounded_rectangle((232, 214, 728, 282), radius=34, fill=light_brown, outline=ink, width=14)
draw.polygon([(246, 250), (146, 308), (292, 300)], fill=light_brown, outline=ink)
draw.polygon([(714, 250), (814, 308), (668, 300)], fill=light_brown, outline=ink)
draw.line([(480, 120), (480, 248)], fill=(74, 47, 27, 220), width=9)
draw.arc((306, 140, 654, 314), 198, 342, fill=(224, 176, 106, 210), width=7)

# Restore the original bright-green sprout over the cap.
rgb = np.array(base.convert('RGB'))
leaf = ((rgb[:, :, 1] > rgb[:, :, 0] * 1.12) &
        (rgb[:, :, 1] > rgb[:, :, 2] * 1.08) &
        (rgb[:, :, 1] > 105))
leaf[185:, :] = False
leaf_mask = Image.fromarray((leaf * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(0.7))
art.paste(base, (0, 0), leaf_mask)
draw = ImageDraw.Draw(art, 'RGBA')

# Gold-rimmed magnifying glass held near the outstretched right hand.
draw.ellipse((706, 486, 876, 656), fill=(255, 255, 255, 55), outline=ink, width=24)
draw.ellipse((715, 495, 867, 647), outline=gold, width=15)
draw.line([(844, 628), (916, 722)], fill=ink, width=34)
draw.line([(844, 628), (916, 722)], fill=light_brown, width=20)
draw.ellipse((896, 700, 943, 754), fill=brown, outline=ink, width=7)
# Lens glint.
draw.arc((742, 517, 838, 613), 196, 286, fill=(255, 255, 255, 225), width=10)

# Restore the original hand and sleeve above the handle so the prop looks held.
hand_region = np.zeros((base.height, base.width), dtype=bool)
hand_region[650:805, 810:960] = True
foreground = np.min(rgb, axis=2) < 244
hand_mask = Image.fromarray(((hand_region & foreground) * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(0.6))
art.paste(base, (0, 0), hand_mask)
draw = ImageDraw.Draw(art, 'RGBA')

# Detective badge on the cape.
draw.ellipse((524, 765, 582, 823), fill=cream, outline=ink, width=7)
draw.regular_polygon((553, 794, 20), n_sides=5, rotation=-18, fill=gold, outline=ink)

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
art.convert('RGB').save(OUTPUT, 'WEBP', quality=92, method=6)
print(f'created {OUTPUT} {art.size}')
