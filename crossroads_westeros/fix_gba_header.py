#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('.')
path = ROOT / 'src/rom_header_gf.c'
text = path.read_text(encoding='utf-8')
text = text.replace('.gameName = "game of thrones rpg",', '.gameName = "THRONES RPG",')
text = text.replace('.gameName = "westeros rpg",', '.gameName = "THRONES RPG",')
path.write_text(text, encoding='utf-8')
print('GBA header title constrained to 12-byte cartridge field: THRONES RPG')
