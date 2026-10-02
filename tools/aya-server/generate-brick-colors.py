"""Generate the legacy BrickColor palette from Roblox's documented color values."""
import json,re,urllib.request
from pathlib import Path
source='https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/datatypes/BrickColor.yaml'
text=urllib.request.urlopen(source,timeout=30).read().decode()
colors={key:color.lower() for color,key in re.findall(r'<ColorSwatch value="(#[0-9A-Fa-f]{6})" />.*?<td><code>([0-9]+)</code>',text,re.S)}
assert len(colors)>100 and colors['192']=='#694028', 'Upstream palette format changed'
(Path(__file__).parent/'brick-colors.json').write_text(json.dumps({'source':source,'colors':colors},indent=2)+'\n',encoding='utf8')
print('Documented BrickColor values:',len(colors))
