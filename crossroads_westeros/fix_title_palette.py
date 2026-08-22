#!/usr/bin/env python3
from pathlib import Path
import sys
from PIL import Image

ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('.')
TITLE = ROOT / 'graphics/title_screen'


def save_4bpp(path: Path):
    if not path.exists():
        return
    img = Image.open(path)
    if img.mode != 'P':
        img = img.convert('P', palette=Image.Palette.ADAPTIVE, colors=16)
    # GBA title sprites are 4bpp. Pillow's bits=4 writes a 16-entry PLTE
    # instead of the default 256-entry palette that gbagfx rejects.
    img.save(path, bits=4, optimize=True)
    print(f'4bpp title image: {path.name}')


for name in ('pokemon_logo.png', 'emerald_version.png', 'rayquaza.png'):
    save_4bpp(TITLE / name)

# v2 creates the replacement logo palette as JASC-PAL. Match the 4bpp
# asset: exactly 16 palette entries, with index 0 reserved for transparency.
logo = Image.open(TITLE / 'pokemon_logo.png')
pal = logo.getpalette() or []
colors = []
for i in range(16):
    base = i * 3
    if base + 2 < len(pal):
        colors.append(tuple(pal[base:base + 3]))
    else:
        colors.append((0, 0, 0))

lines = ['JASC-PAL', '0100', '16']
lines.extend(f'{r} {g} {b}' for r, g, b in colors)
(TITLE / 'pokemon_logo.pal').write_text('\n'.join(lines) + '\n', encoding='ascii')
print('16-color JASC palette: pokemon_logo.pal')
