#!/usr/bin/env python3
from pathlib import Path
from PIL import Image, ImageDraw
import hashlib, re, sys

ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('.')

CREATURE_NAMES = [
    'DIREWOLF','DRAGON','LION','RAVEN','STAG','KRAKEN','WIGHT','WARHORSE',
    'SHADOWCAT','BOAR','BEAR','HOUND','MAMMOTH','SERPENT','FALCON','GOAT',
    'FIREWYRM','ICEWOLF','SEA DRAKE','BASILISK','WYVERN','SPIDER','AUROCHS',
    'SNOW BEAR','RED LION','GREY WOLF','BLACKCAT','NIGHT BAT','STONECRAB',
    'SAND SNAKE','MARSH LIZ','IRON BOAR'
]
ARCHETYPES = ['wolf','dragon','lion','raven','stag','kraken','wight','horse','bear','hound']
SPECIAL_SPECIES = {
    'treecko': ('DIREWOLF','wolf'), 'grovyle': ('GREY WOLF','wolf'), 'sceptile': ('GREYWIND','wolf'),
    'torchic': ('DRAGON EGG','dragon'), 'combusken': ('HATCHLING','dragon'), 'blaziken': ('DRAGON','dragon'),
    'mudkip': ('LION CUB','lion'), 'marshtomp': ('RED LION','lion'), 'swampert': ('WAR LION','lion'),
    'poochyena': ('HOUND','hound'), 'mightyena': ('WAR HOUND','hound'),
    'zigzagoon': ('GREY WOLF','wolf'), 'linoone': ('DIREWOLF','wolf'),
    'taillow': ('RAVEN','raven'), 'swellow': ('WAR RAVEN','raven'),
    'rayquaza': ('BALERION','dragon'), 'groudon': ('DROGON','dragon'), 'kyogre': ('SEA DRAKE','kraken'),
    'regice': ('ICE WIGHT','wight'), 'regirock': ('STONE WIGHT','wight'), 'registeel': ('IRON WIGHT','wight'),
    'absol': ('SHADOWCAT','lion'), 'stantler': ('GREAT STAG','stag'), 'murkrow': ('BLACK RAVEN','raven'),
    'houndour': ('HELL HOUND','hound'), 'houndoom': ('WAR HOUND','hound')
}

CAST = [
    ('PROF. BIRCH','MAESTER LUWIN'),('PROFESSOR BIRCH','MAESTER LUWIN'),('BIRCH','LUWIN'),
    ('BRENDAN','ROBB'),('MAY','SANSA'),('WALLY','JON'),('STEVEN','JAIME'),('WALLACE','RENLY'),
    ('ROXANNE','BRIENNE'),('BRAWLY','THE HOUND'),('WATTSON','BERIC'),('FLANNERY','MELISANDRE'),
    ('NORMAN','EDDARD'),('WINONA','YGRITTE'),('TATE','BRAN'),('LIZA','ARYA'),('JUAN','OBERYN'),
    ('ARCHIE','EURON'),('MAXIE','TYWIN'),('TEAM AQUA','GREYJOY MEN'),('TEAM MAGMA','LANNISTER MEN'),
    ('AQUA','GREYJOY'),('MAGMA','LANNISTER'),
    ('LITTLEROOT','WINTERFELL'),('OLDALE','WINTER TOWN'),('PETALBURG','MOAT CAILIN'),
    ('RUSTBORO','WHITE HARBOR'),('DEWFORD','PYKE'),('SLATEPORT','GULLTOWN'),('MAUVILLE','RIVERRUN'),
    ('VERDANTURF','THE EYRIE'),('FALLARBOR','CASTLE BLACK'),('LAVARIDGE','HARRENHAL'),
    ('FORTREE','HIGHGARDEN'),('LILYCOVE',"KING'S LANDING"),('MOSSDEEP','DRAGONSTONE'),
    ('SOOTOPOLIS',"STORM'S END"),('EVER GRANDE','RED KEEP'),
    ('POKéMON','BEAST'),('POKEMON','BEAST'),('POKéDEX','LOREBOOK'),('POKEDEX','LOREBOOK'),
    ('POKéNAV','REALM MAP'),('POKENAV','REALM MAP'),('POKé BALL','SNARE'),('POKE BALL','SNARE'),
    ('TRAINER','FIGHTER'),('GYM LEADER','CASTELLAN'),('GYM','KEEP'),('BADGE','SIGIL'),
    ('ELITE FOUR','KINGSGUARD'),('CHAMPION','SOVEREIGN')
]

PALETTE = [
    (0,0,0),(28,24,24),(64,58,54),(108,98,84),(158,142,116),(214,194,154),(240,226,188),(255,248,224),
    (86,30,28),(148,44,34),(192,64,40),(92,104,118),(148,164,174),(50,74,54),(88,120,72),(188,154,48)
]

def stable_int(s):
    return int(hashlib.sha1(s.encode()).hexdigest()[:8], 16)

def visible_replace(s):
    parts = re.split(r'(\{[^{}]*\})', s)
    for i in range(0, len(parts), 2):
        for old, new in CAST:
            parts[i] = parts[i].replace(old, new)
    return ''.join(parts)

def rewrite_story():
    string_re = re.compile(r'"(?:\\.|[^"\\\r\n])*"')
    count = 0
    for base in [ROOT/'data/maps', ROOT/'data/text', ROOT/'data/scripts', ROOT/'src/data/text']:
        if not base.exists():
            continue
        for p in base.rglob('*'):
            if not p.is_file() or p.suffix not in {'.inc','.h'}:
                continue
            text = p.read_text(encoding='utf-8')
            def repl(m):
                nonlocal count
                token = m.group(0)
                inner = token[1:-1]
                new = visible_replace(inner)
                if new != inner:
                    count += 1
                return '"' + new + '"'
            new_text = string_re.sub(repl, text)
            if new_text != text:
                p.write_text(new_text, encoding='utf-8')
    print(f'Westeros story/cast rewrite: {count} strings')

def rewrite_species_names():
    root = ROOT/'src/data/pokemon/species_info'
    changed = 0
    if not root.exists():
        return
    for p in root.rglob('*.h'):
        low = str(p).lower()
        name = CREATURE_NAMES[stable_int(p.stem) % len(CREATURE_NAMES)]
        for key, (special, _) in SPECIAL_SPECIES.items():
            if key in low:
                name = special
                break
        text = p.read_text(encoding='utf-8')
        new_text, n = re.subn(r'(\.speciesName\s*=\s*_\()"[^"\r\n]*"(\))',
                              lambda m: m.group(1) + '"' + name[:12] + '"' + m.group(2), text)
        if n:
            p.write_text(new_text, encoding='utf-8')
            changed += n
    print(f'Westeros creature names: {changed}')

def pimage(size):
    im = Image.new('P', size, 0)
    pal = []
    for c in PALETTE:
        pal.extend(c)
    pal.extend([0,0,0] * (256-len(PALETTE)))
    im.putpalette(pal)
    im.info['transparency'] = 0
    return im

def X(x,w): return max(0, min(w-1, int(x*w/64)))
def Y(y,h): return max(0, min(h-1, int(y*h/64)))

def archetype(stem):
    low = stem.lower()
    if low in SPECIAL_SPECIES:
        return SPECIAL_SPECIES[low][1]
    return ARCHETYPES[stable_int(low) % len(ARCHETYPES)]

def draw_creature(size, kind):
    w,h=size
    im=pimage(size); d=ImageDraw.Draw(im)
    d.ellipse((X(10,w),Y(52,h),X(55,w),Y(60,h)), fill=2)
    if kind in {'wolf','hound'}:
        d.polygon([(X(8,w),Y(39,h)),(X(18,w),Y(27,h)),(X(30,w),Y(29,h)),(X(39,w),Y(19,h)),
                   (X(54,w),Y(25,h)),(X(58,w),Y(36,h)),(X(43,w),Y(42,h)),(X(20,w),Y(47,h))], fill=11)
        d.polygon([(X(39,w),Y(21,h)),(X(42,w),Y(8,h)),(X(47,w),Y(22,h))], fill=12)
        d.polygon([(X(49,w),Y(24,h)),(X(56,w),Y(12,h)),(X(57,w),Y(29,h))], fill=12)
        d.rectangle((X(18,w),Y(44,h),X(23,w),Y(56,h)), fill=3); d.rectangle((X(38,w),Y(43,h),X(43,w),Y(56,h)), fill=3)
        d.rectangle((X(52,w),Y(28,h),X(54,w),Y(30,h)), fill=15)
    elif kind == 'dragon':
        d.polygon([(X(7,w),Y(44,h)),(X(19,w),Y(30,h)),(X(35,w),Y(30,h)),(X(44,w),Y(19,h)),
                   (X(59,w),Y(24,h)),(X(51,w),Y(36,h)),(X(38,w),Y(43,h)),(X(18,w),Y(48,h))], fill=9)
        d.polygon([(X(20,w),Y(31,h)),(X(15,w),Y(7,h)),(X(38,w),Y(28,h))], fill=10)
        d.polygon([(X(35,w),Y(30,h)),(X(49,w),Y(7,h)),(X(47,w),Y(35,h))], fill=10)
        d.polygon([(X(12,w),Y(41,h)),(X(1,w),Y(30,h)),(X(7,w),Y(48,h))], fill=8)
        d.rectangle((X(52,w),Y(24,h),X(54,w),Y(26,h)), fill=15)
    elif kind == 'lion':
        d.ellipse((X(26,w),Y(17,h),X(56,w),Y(45,h)), fill=15); d.ellipse((X(32,w),Y(22,h),X(54,w),Y(42,h)), fill=5)
        d.rectangle((X(13,w),Y(34,h),X(43,w),Y(49,h)), fill=15)
        d.rectangle((X(17,w),Y(46,h),X(22,w),Y(57,h)), fill=4); d.rectangle((X(36,w),Y(46,h),X(41,w),Y(57,h)), fill=4)
        d.rectangle((X(47,w),Y(27,h),X(49,w),Y(29,h)), fill=1)
    elif kind == 'raven':
        d.ellipse((X(22,w),Y(23,h),X(46,w),Y(47,h)), fill=1)
        d.polygon([(X(27,w),Y(30,h)),(X(4,w),Y(16,h)),(X(21,w),Y(43,h))], fill=11)
        d.polygon([(X(42,w),Y(29,h)),(X(61,w),Y(18,h)),(X(48,w),Y(43,h))], fill=11)
        d.polygon([(X(45,w),Y(29,h)),(X(60,w),Y(34,h)),(X(46,w),Y(38,h))], fill=15)
        d.rectangle((X(39,w),Y(27,h),X(41,w),Y(29,h)), fill=7)
    elif kind == 'stag':
        d.rectangle((X(16,w),Y(34,h),X(44,w),Y(49,h)), fill=4); d.ellipse((X(35,w),Y(19,h),X(55,w),Y(38,h)), fill=5)
        d.line((X(42,w),Y(21,h),X(35,w),Y(6,h)), fill=6, width=max(1,w//32)); d.line((X(48,w),Y(20,h),X(53,w),Y(5,h)), fill=6, width=max(1,w//32))
        d.line((X(35,w),Y(10,h),X(28,w),Y(5,h)), fill=6, width=max(1,w//32)); d.line((X(53,w),Y(10,h),X(60,w),Y(4,h)), fill=6, width=max(1,w//32))
        d.rectangle((X(20,w),Y(46,h),X(24,w),Y(58,h)), fill=3); d.rectangle((X(38,w),Y(46,h),X(42,w),Y(58,h)), fill=3)
    elif kind == 'kraken':
        d.ellipse((X(19,w),Y(13,h),X(48,w),Y(40,h)), fill=11)
        for i in range(6):
            x=14+i*7; d.arc((X(x,w),Y(32,h),X(x+18,w),Y(61,h)),30,210,fill=12,width=max(1,w//32))
        d.rectangle((X(29,w),Y(24,h),X(32,w),Y(28,h)), fill=15); d.rectangle((X(39,w),Y(24,h),X(42,w),Y(28,h)), fill=15)
    elif kind == 'wight':
        d.ellipse((X(23,w),Y(11,h),X(44,w),Y(30,h)), fill=12)
        d.polygon([(X(20,w),Y(27,h)),(X(47,w),Y(27,h)),(X(53,w),Y(54,h)),(X(13,w),Y(54,h))], fill=11)
        d.rectangle((X(28,w),Y(19,h),X(31,w),Y(22,h)), fill=7); d.rectangle((X(37,w),Y(19,h),X(40,w),Y(22,h)), fill=7)
        d.line((X(48,w),Y(29,h),X(60,w),Y(8,h)), fill=6, width=max(1,w//32))
    elif kind == 'horse':
        d.rectangle((X(13,w),Y(33,h),X(45,w),Y(49,h)), fill=4)
        d.polygon([(X(37,w),Y(34,h)),(X(45,w),Y(17,h)),(X(56,w),Y(24,h)),(X(50,w),Y(39,h))], fill=5)
        d.rectangle((X(18,w),Y(47,h),X(22,w),Y(59,h)), fill=2); d.rectangle((X(38,w),Y(47,h),X(42,w),Y(59,h)), fill=2)
    elif kind == 'bear':
        d.ellipse((X(12,w),Y(22,h),X(49,w),Y(53,h)), fill=3); d.ellipse((X(33,w),Y(14,h),X(57,w),Y(38,h)), fill=4)
        d.ellipse((X(35,w),Y(11,h),X(42,w),Y(20,h)), fill=3); d.ellipse((X(50,w),Y(12,h),X(57,w),Y(21,h)), fill=3)
        d.rectangle((X(46,w),Y(24,h),X(49,w),Y(27,h)), fill=1)
    else:
        d.rectangle((X(17,w),Y(25,h),X(46,w),Y(50,h)), fill=8)
    return im

def write_jasc(path):
    path.write_text('\n'.join(['JASC-PAL','0100','16'] + [f'{r} {g} {b}' for r,g,b in PALETTE]) + '\n', encoding='ascii')

def replace_creatures():
    root=ROOT/'graphics/pokemon'; count=0
    if not root.exists(): return
    for folder in root.iterdir():
        if not folder.is_dir(): continue
        kind=archetype(folder.name)
        for fn in ['front.png','back.png','anim_front.png','front_gba.png','back_gba.png','anim_front_gba.png','icon.png','icon_gba.png','overworld.png']:
            p=folder/fn
            if not p.exists(): continue
            try:
                old=Image.open(p); draw_creature(old.size,kind).save(p); count+=1
            except Exception: pass
        for fn in ['normal.pal','shiny.pal','normal_gba.pal','shiny_gba.pal','overworld_normal.pal','overworld_shiny.pal']:
            p=folder/fn
            if p.exists(): write_jasc(p)
    print(f'Repainted creature graphics: {count}')

def medievalize_trainers():
    base=ROOT/'graphics/trainers/front_pics'; count=0
    if not base.exists(): return
    for p in base.glob('*.png'):
        try:
            old=Image.open(p).convert('P'); w,h=old.size; im=Image.new('P',(w,h),0)
            pal=old.getpalette();
            if pal: im.putpalette(pal)
            d=ImageDraw.Draw(im)
            d.ellipse((int(w*.34),int(h*.10),int(w*.66),int(h*.38)),fill=3)
            d.polygon([(int(w*.24),int(h*.36)),(int(w*.76),int(h*.36)),(int(w*.84),int(h*.87)),(int(w*.16),int(h*.87))],fill=5)
            d.polygon([(int(w*.20),int(h*.40)),(int(w*.36),int(h*.30)),(int(w*.64),int(h*.30)),(int(w*.80),int(h*.40)),(int(w*.72),int(h*.58)),(int(w*.28),int(h*.58))],fill=7)
            d.line((int(w*.70),int(h*.42),int(w*.89),int(h*.12)),fill=2,width=max(1,w//32))
            d.line((int(w*.76),int(h*.26),int(w*.89),int(h*.36)),fill=2,width=max(1,w//32))
            d.polygon([(int(w*.16),int(h*.44)),(int(w*.29),int(h*.39)),(int(w*.23),int(h*.86)),(int(w*.07),int(h*.80))],fill=4)
            d.rectangle((int(w*.40),int(h*.20),int(w*.44),int(h*.24)),fill=1); d.rectangle((int(w*.56),int(h*.20),int(w*.60),int(h*.24)),fill=1)
            d.rectangle((int(w*.36),int(h*.10),int(w*.64),int(h*.16)),fill=2)
            im.save(p); count+=1
        except Exception: pass
    print(f'Medieval trainer portraits: {count}')

def medievalize_people():
    base=ROOT/'graphics/object_events/pics/people'; count=0
    if not base.exists(): return
    for p in base.glob('*.png'):
        try:
            old=Image.open(p).convert('P'); w,h=old.size; im=Image.new('P',(w,h),0)
            pal=old.getpalette();
            if pal: im.putpalette(pal)
            d=ImageDraw.Draw(im); cw,ch=16,32
            if w % 16: cw=max(16,min(32,w))
            if h<32: ch=h
            for y in range(0,h,ch):
                for x in range(0,w,cw):
                    cellw=min(cw,w-x); cellh=min(ch,h-y)
                    if cellw<8 or cellh<12: continue
                    cx=x+cellw//2
                    d.ellipse((cx-4,y+3,cx+4,min(y+11,h-1)),fill=3)
                    d.polygon([(cx-6,y+12),(cx+6,y+12),(cx+7,min(y+cellh-5,h-1)),(cx-7,min(y+cellh-5,h-1))],fill=5)
                    d.polygon([(cx-6,y+12),(cx,y+16),(cx+6,y+12),(cx+4,y+20),(cx-4,y+20)],fill=7)
                    d.rectangle((cx-5,min(y+cellh-5,h-1),cx-2,min(y+cellh-1,h-1)),fill=2)
                    d.rectangle((cx+2,min(y+cellh-5,h-1),cx+5,min(y+cellh-1,h-1)),fill=2)
            im.save(p); count+=1
        except Exception: pass
    print(f'Medieval overworld people sheets: {count}')

def darken_tilesets():
    base=ROOT/'data/tilesets'; count=0
    if not base.exists(): return
    for p in base.rglob('*.pal'):
        try:
            lines=p.read_text(encoding='ascii').splitlines()
            if len(lines)<4 or lines[0].strip()!='JASC-PAL': continue
            n=int(lines[2]); out=lines[:3]
            for line in lines[3:3+n]:
                r,g,b=map(int,line.split()); avg=(r+g+b)//3
                r=int(r*.62+avg*.18); g=int(g*.58+avg*.18); b=int(b*.50+avg*.16)
                out.append(f'{max(0,min(255,r))} {max(0,min(255,g))} {max(0,min(255,b))}')
            out.extend(lines[3+n:]); p.write_text('\n'.join(out)+'\n',encoding='ascii'); count+=1
        except Exception: pass
    print(f'Darkened Westeros tileset palettes: {count}')

rewrite_story()
rewrite_species_names()
replace_creatures()
medievalize_trainers()
medievalize_people()
darken_tilesets()
print('Full Westeros visual/story conversion pass complete.')
