#!/usr/bin/env python3
from pathlib import Path
import json
import re
import sys

ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('.')


def read(path):
    return Path(path).read_text(encoding='utf-8')


def write(path, text):
    path = Path(path)
    path.write_text(text, encoding='utf-8')
    print(f'updated {path.relative_to(ROOT) if path.is_relative_to(ROOT) else path}')


def transform_quoted_strings(path, replacements):
    path = Path(path)
    if not path.exists():
        return 0
    text = path.read_text(encoding='utf-8')
    string_re = re.compile(r'"(?:\\.|[^"\\])*"')
    changed = 0

    def repl(match):
        nonlocal changed
        token = match.group(0)
        inner = token[1:-1]
        new_inner = inner
        for old, new in replacements:
            new_inner = new_inner.replace(old, new)
        if new_inner != inner:
            changed += 1
        return '"' + new_inner + '"'

    new_text = string_re.sub(repl, text)
    if new_text != text:
        path.write_text(new_text, encoding='utf-8')
        print(f'presentation text: {path.relative_to(ROOT)} ({changed} strings)')
    return changed


def set_const_string(path, symbol, value):
    path = Path(path)
    text = path.read_text(encoding='utf-8')
    # Most user-facing globals in strings.c use either [] or a fixed-size array.
    pattern = re.compile(
        rf'(const\s+u8\s+{re.escape(symbol)}(?:\[[^\]]*\])?\s*=\s*_\()"(?:\\.|[^"\\])*"(\)\s*;)'
    )
    new_text, count = pattern.subn(lambda m: m.group(1) + '"' + value + '"' + m.group(2), text, count=1)
    if count:
        path.write_text(new_text, encoding='utf-8')
        print(f'UI label: {symbol} -> {value}')
    else:
        print(f'UI label not found (non-fatal): {symbol}')


def rename_map_sections():
    path = ROOT / 'src/data/region_map/region_map_sections.json'
    data = json.loads(path.read_text(encoding='utf-8'))
    names = {
        'MAPSEC_LITTLEROOT_TOWN': 'WINTERFELL',
        'MAPSEC_OLDALE_TOWN': 'WINTER TOWN',
        'MAPSEC_DEWFORD_TOWN': 'PYKE',
        'MAPSEC_LAVARIDGE_TOWN': 'HARRENHAL',
        'MAPSEC_FALLARBOR_TOWN': 'CASTLE BLACK',
        'MAPSEC_VERDANTURF_TOWN': 'THE EYRIE',
        'MAPSEC_PACIFIDLOG_TOWN': 'SUNSPEAR',
        'MAPSEC_PETALBURG_CITY': 'MOAT CAILIN',
        'MAPSEC_SLATEPORT_CITY': 'GULLTOWN',
        'MAPSEC_MAUVILLE_CITY': 'RIVERRUN',
        'MAPSEC_RUSTBORO_CITY': 'WHITE HARBOR',
        'MAPSEC_FORTREE_CITY': 'HIGHGARDEN',
        'MAPSEC_LILYCOVE_CITY': "KING'S LANDING",
        'MAPSEC_MOSSDEEP_CITY': 'DRAGONSTONE',
        'MAPSEC_SOOTOPOLIS_CITY': "STORM'S END",
        'MAPSEC_EVER_GRANDE_CITY': 'RED KEEP',
        'MAPSEC_ROUTE_101': 'WOLFSWOOD',
        'MAPSEC_ROUTE_102': 'KINGSROAD NORTH',
        'MAPSEC_ROUTE_103': 'WHITE KNIFE ROAD',
        'MAPSEC_ROUTE_104': 'THE NECK',
        'MAPSEC_ROUTE_105': 'SUNSET SEA',
        'MAPSEC_ROUTE_106': "IRONMAN'S BAY",
        'MAPSEC_ROUTE_107': 'NARROW SEA',
        'MAPSEC_ROUTE_108': 'THE TRIDENT',
        'MAPSEC_ROUTE_109': 'GULLTOWN ROAD',
        'MAPSEC_ROUTE_110': 'RIVER ROAD',
    }
    changed = 0
    for section in data.get('map_sections', []):
        new_name = names.get(section.get('id'))
        if new_name and section.get('name') != new_name:
            section['name'] = new_name
            changed += 1
    path.write_text(json.dumps(data, indent=2) + '\n', encoding='utf-8')
    print(f'renamed {changed} map sections for Westeros')


def replace_species_display_names():
    replacements = [
        ('TREECKO', 'DIREWOLF'),
        ('GROVYLE', 'ALPHA WOLF'),
        ('SCEPTILE', 'GREYWIND'),
        ('TORCHIC', 'DRAGON EGG'),
        ('COMBUSKEN', 'HATCHLING'),
        ('BLAZIKEN', 'DRAGON'),
        ('MUDKIP', 'SQUIRE'),
        ('MARSHTOMP', 'SWORNSWORD'),
        ('SWAMPERT', 'KNIGHT'),
        ('POOCHYENA', 'WILD HOUND'),
        ('MIGHTYENA', 'WAR HOUND'),
        ('ZIGZAGOON', 'GREY WOLF'),
        ('LINOONE', 'DIREWOLF'),
    ]
    species_root = ROOT / 'src/data/pokemon/species_info'
    for p in species_root.rglob('*.h'):
        transform_quoted_strings(p, replacements)


def jasc_palette(path, colors, count=256):
    colors = list(colors)
    while len(colors) < count:
        colors.append((0, 0, 0))
    lines = ['JASC-PAL', '0100', str(count)]
    lines.extend(f'{r} {g} {b}' for r, g, b in colors[:count])
    Path(path).write_text('\n'.join(lines) + '\n', encoding='ascii')


def make_title_art():
    try:
        from PIL import Image, ImageDraw, ImageFont
    except Exception as exc:
        print(f'Pillow unavailable; skipping title artwork: {exc}')
        return

    title_dir = ROOT / 'graphics/title_screen'
    logo_path = title_dir / 'pokemon_logo.png'
    if not logo_path.exists():
        print('title logo source missing; skipping artwork')
        return

    font_candidates = [
        '/usr/share/fonts/truetype/dejavu/DejaVuSerifCondensed-Bold.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    ]
    font_path = next((f for f in font_candidates if Path(f).exists()), None)

    palette = [
        (0, 0, 0),
        (20, 20, 22),
        (65, 65, 70),
        (130, 130, 138),
        (198, 178, 118),
        (235, 220, 166),
        (248, 242, 214),
        (120, 38, 32),
        (170, 55, 42),
        (255, 255, 255),
    ]

    def new_pal(size):
        img = Image.new('P', size, 0)
        flat = []
        for rgb in palette:
            flat.extend(rgb)
        flat.extend([0, 0, 0] * (256 - len(palette)))
        img.putpalette(flat)
        img.info['transparency'] = 0
        return img

    def font_for(text, max_width, max_height, start):
        if not font_path:
            return ImageFont.load_default()
        size = max(6, start)
        probe = Image.new('P', (max_width, max_height), 0)
        d = ImageDraw.Draw(probe)
        while size >= 6:
            f = ImageFont.truetype(font_path, size=size)
            box = d.textbbox((0, 0), text, font=f)
            if box[2] - box[0] <= max_width and box[3] - box[1] <= max_height:
                return f
            size -= 1
        return ImageFont.truetype(font_path, size=6)

    original = Image.open(logo_path)
    w, h = original.size
    logo = new_pal((w, h))
    d = ImageDraw.Draw(logo)
    top = 'GAME OF'
    bottom = 'THRONES'
    f1 = font_for(top, max(8, w - 8), max(6, h // 3), max(8, h // 3))
    f2 = font_for(bottom, max(8, w - 6), max(8, (h * 2) // 3), max(10, h // 2))

    def center_text(text, font, y, fill, outline):
        box = d.textbbox((0, 0), text, font=font, stroke_width=1)
        tw = box[2] - box[0]
        x = (w - tw) // 2
        d.text((x + 1, y + 1), text, font=font, fill=1, stroke_width=1, stroke_fill=1)
        d.text((x, y), text, font=font, fill=fill, stroke_width=1, stroke_fill=outline)

    center_text(top, f1, 0, 5, 2)
    top_box = d.textbbox((0, 0), top, font=f1)
    y2 = max(5, top_box[3] - top_box[1] - 1)
    center_text(bottom, f2, y2, 6, 4)
    logo.save(logo_path)
    jasc_palette(title_dir / 'pokemon_logo.pal', palette, 256)
    print(f'replaced Pokemon logo source art with Game of Thrones logo ({w}x{h})')

    # Reuse the existing version-banner dimensions, but make its pixels Westeros-specific.
    version_path = title_dir / 'emerald_version.png'
    if version_path.exists():
        old = Image.open(version_path)
        vw, vh = old.size
        version = new_pal((vw, vh))
        vd = ImageDraw.Draw(version)
        text = 'WESTEROS RPG'
        vf = font_for(text, max(8, vw - 4), max(6, vh - 2), max(8, vh - 2))
        box = vd.textbbox((0, 0), text, font=vf, stroke_width=1)
        vd.text(((vw - (box[2]-box[0])) // 2, max(0, (vh - (box[3]-box[1])) // 2 - 1)), text,
                font=vf, fill=5, stroke_width=1, stroke_fill=1)
        version.save(version_path)
        print(f'replaced Emerald version banner ({vw}x{vh})')

    # Remove Rayquaza from the title scene. A custom dragon replaces this in a later art pass.
    ray_path = title_dir / 'rayquaza.png'
    if ray_path.exists():
        ray_old = Image.open(ray_path).convert('P')
        blank = Image.new('P', ray_old.size, 0)
        old_palette = ray_old.getpalette()
        if old_palette:
            blank.putpalette(old_palette)
        blank.save(ray_path)
        print('removed Rayquaza title mascot')


# Make the cartridge identify as a Thrones RPG rather than Pokemon Emerald.
makefile = ROOT / 'Makefile'
text = makefile.read_text(encoding='utf-8')
text = text.replace('TITLE        ?= WESTEROS RPG', 'TITLE        ?= THRONES RPG')
makefile.write_text(text, encoding='utf-8')

header = ROOT / 'src/rom_header_gf.c'
text = header.read_text(encoding='utf-8')
text = text.replace('.gameName = "westeros rpg",', '.gameName = "game of thrones rpg",')
header.write_text(text, encoding='utf-8')

# Broad player-facing terminology pass. Only quoted string contents are touched;
# identifiers, macros, function names and engine internals remain Pokemon-compatible.
terminology = [
    ('POKéMON CENTER', "HEALER'S HALL"),
    ('POKEMON CENTER', "HEALER'S HALL"),
    ('POKéMON LEAGUE', 'IRON THRONE'),
    ('POKEMON LEAGUE', 'IRON THRONE'),
    ('ELITE FOUR', 'KINGSGUARD'),
    ('HALL OF FAME', 'BOOK OF DEEDS'),
    ('BATTLE FRONTIER', 'WAR CAMP'),
    ('BATTLE TOWER', 'TOURNEY TOWER'),
    ('POKéDEX', 'LOREBOOK'),
    ('POKEDEX', 'LOREBOOK'),
    ('POKéNAV', 'REALM MAP'),
    ('POKENAV', 'REALM MAP'),
    ('POKé BALLS', 'SNARES'),
    ('POKé BALL', 'SNARE'),
    ('POKE BALLS', 'SNARES'),
    ('POKE BALL', 'SNARE'),
    ('POKéMON', 'CREATURE'),
    ('POKEMON', 'CREATURE'),
    ('GYM LEADER', 'CASTELLAN'),
    ('GYM', 'KEEP'),
    ('TRAINER', 'FIGHTER'),
    ('BADGES', 'SIGILS'),
    ('BADGE', 'SIGIL'),
    ('CHAMPION', 'SOVEREIGN'),
    ('PROF. BIRCH', 'MAESTER WALYS'),
    ('PROFESSOR BIRCH', 'MAESTER WALYS'),
    ('MONEY', 'GOLD'),
    ('CLOSE BAG', 'CLOSE PACK'),
]

paths = [ROOT / 'src/strings.c']
for base, suffixes in [
    (ROOT / 'data/text', {'.inc'}),
    (ROOT / 'data/maps', {'.inc'}),
    (ROOT / 'data/scripts', {'.inc'}),
    (ROOT / 'src/data/text', {'.h', '.inc'}),
]:
    if base.exists():
        for p in base.rglob('*'):
            if p.is_file() and p.suffix in suffixes:
                paths.append(p)

changed_total = 0
for p in paths:
    changed_total += transform_quoted_strings(p, terminology)
print(f'changed terminology in {changed_total} player-facing strings')

# High-value UI labels should read like an RPG rather than generic creature terminology.
strings = ROOT / 'src/strings.c'
for symbol, value in {
    'gText_Pokemon': 'ALLY',
    'gText_Pokedex': 'LOREBOOK',
    'gText_Badges': 'SIGILS',
    'gText_MenuPokedex': 'LORE',
    'gText_MenuPokemon': 'PARTY',
    'gText_MenuBag': 'PACK',
    'gText_MenuPokenav': 'REALM MAP',
    'gText_MenuDexNav': 'HUNT MAP',
    'gText_TrainerCardMoney': 'GOLD',
    'gText_TrainerCardPokedex': 'LORE',
    'gText_PokemonLeague': 'IRON THRONE',
    'gText_PokemonCenter': "HEALER'S HALL",
    'gText_WelcomeToHOF': 'Your deeds enter the BOOK OF DEEDS!',
    'gText_LeagueChamp': 'THE IRON THRONE IS YOURS!',
    'gText_HOFNumber': 'REIGN No. {STR_VAR_1}',
    'gText_ConfirmStarterChoice': 'Choose this companion?',
    'gText_BirchInTrouble': 'A scout is in danger! Choose an ally and save him!',
    'gText_FlyToWhere': 'TRAVEL to where?',
    'gText_CloseBag': 'CLOSE PACK',
    'gText_ThePokemonList': 'the PARTY',
    'gText_NoPokemon': 'There is no ally.',
}.items():
    set_const_string(strings, symbol, value)

rename_map_sections()
replace_species_display_names()
make_title_art()

print('Westeros presentation pass v2 applied successfully.')
