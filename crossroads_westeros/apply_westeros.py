#!/usr/bin/env python3
from pathlib import Path
import re
import sys

ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")


def read(rel):
    return (ROOT / rel).read_text(encoding="utf-8")


def write(rel, text):
    p = ROOT / rel
    p.write_text(text, encoding="utf-8")
    print(f"updated {rel}")


def replace_once(rel, old, new):
    text = read(rel)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected exactly one match in {rel}, found {count}: {old!r}")
    write(rel, text.replace(old, new, 1))


def replace_block(rel, start_label, next_label, body):
    text = read(rel)
    pattern = rf"(?ms)^{re.escape(start_label)}:\n.*?(?=^{re.escape(next_label)}:)"
    replacement = f"{start_label}:\n{body.rstrip()}\n\n"
    text2, count = re.subn(pattern, lambda _m: replacement, text, count=1)
    if count != 1:
        raise SystemExit(f"Could not replace block {start_label} in {rel}; matches={count}")
    write(rel, text2)


# Give the cartridge a distinct identity while keeping the Crossroads engine.
replace_once("Makefile", "TITLE        ?= POKEMON EMER", "TITLE        ?= WESTEROS RPG")
replace_once("Makefile", "FILE_NAME := poke$(BUILD_NAME)", "FILE_NAME := westeros_crossroads")
replace_once("src/rom_header_gf.c", '.gameName = "pokemon emerald version",', '.gameName = "westeros rpg",')

# Littleroot is the first playable Westeros location for this prototype.
replace_once(
    "src/data/region_map/region_map_sections.json",
    '"id": "MAPSEC_LITTLEROOT_TOWN",\n      "name": "LITTLEROOT TOWN",',
    '"id": "MAPSEC_LITTLEROOT_TOWN",\n      "name": "WINTERFELL",',
)

# Rewrite the new-game introduction while preserving every symbol the engine expects.
birch = r'''gText_Birch_Welcome::
	.string "The long summer is ending.\p"
	.string "Welcome to WESTEROS.\p"
	.string "I am MAESTER WALYS, sworn to\n"
	.string "the great castle of WINTERFELL.\p"
	.string "$"

gText_Birch_Pokemon::
	.string "Beyond these walls live beasts,\n"
	.string "outlaws, and stranger things.\p"
	.string "\n"
	.string "$"

gText_Birch_MainSpeech::
	.string "Seven Kingdoms share this land,\n"
	.string "but peace never lasts forever.\p"
	.string "Great Houses make alliances,\n"
	.string "break oaths, and march to war.\p"
	.string "Knights seek glory. Smallfolk seek\n"
	.string "safety. The North remembers.\p"
	.string "Your choices will decide whom you\n"
	.string "serve, whom you trust, and who falls.\p"
	.string "For now, you begin beneath the\n"
	.string "grey walls of WINTERFELL.\p"
	.string "$"

gText_Birch_AndYouAre::
	.string "Before we begin... who are you?$"

gText_Birch_BoyOrGirl::
	.string "Are you a boy?\n"
	.string "Or are you a girl?$"

gText_Birch_WhatsYourName::
	.string "And what name do you carry?$"

gText_Birch_SoItsPlayer::
	.string "So you are {PLAYER}{KUN}?$"

gText_Birch_YourePlayer::
	.string "Very well.\p"
	.string "You are {PLAYER}{KUN}, newly arrived\n"
	.string "at WINTERFELL in the North.\p"
	.string "Lord Stark's household has work\n"
	.string "for anyone brave enough to take it.\p"
	.string "$"

gText_Birch_AreYouReady::
	.string "Steel yourself.\p"
	.string "Your story is about to begin.\p"
	.string "Choose your loyalties carefully.\n"
	.string "In WESTEROS, every oath has a cost.\p"
	.string "Find me in the maester's chamber\n"
	.string "when you are ready.\p"
	.string "$"
'''
write("data/text/birch_speech.inc", birch)

# Turn the opening settlement dialogue into a small Winterfell-flavoured quest setup.
scripts = "data/maps/LittlerootTown/scripts.inc"
replace_block(scripts, "LittlerootTown_Text_OurNewHomeLetsGoInside", "LittlerootTown_Text_WaitPlayer", r'''	.string "MOM: {PLAYER}, we're here.\p"
	.string "Those grey walls are WINTERFELL,\n"
	.string "seat of House Stark.\p"
	.string "The road was long, but the castle\n"
	.string "is safer than the kingsroad tonight.\p"
	.string "Get settled. Then speak with the\n"
	.string "people outside. They need help.\p"
	.string "And remember: winter is coming.$"''')

replace_block(scripts, "LittlerootTown_Text_CanUsePCToStoreItems", "LittlerootTown_Text_BirchSpendsDaysInLab", r'''	.string "A raven came from the kingsroad.\p"
	.string "Travellers vanished north of here,\n"
	.string "and the guards found fresh tracks.\p"
	.string "If you mean to earn a name, ask\n"
	.string "around the castle yard.$"''')

replace_block(scripts, "LittlerootTown_Text_BirchSpendsDaysInLab", "LittlerootTown_Text_IfYouGoInGrassPokemonWillJumpOut", r'''	.string "The MAESTER keeps his chamber lit\n"
	.string "long after the rest of us sleep.\p"
	.string "Ravens keep arriving from the south.\n"
	.string "None of them bring good news.$"''')

replace_block(scripts, "LittlerootTown_Text_IfYouGoInGrassPokemonWillJumpOut", "LittlerootTown_Text_DangerousIfYouDontHavePokemon", r'''	.string "Don't leave the walls unarmed!\p"
	.string "Wolves and worse have been seen\n"
	.string "beyond WINTERFELL.$"''')

replace_block(scripts, "LittlerootTown_Text_DangerousIfYouDontHavePokemon", "LittlerootTown_Text_CanYouGoSeeWhatsHappening", r'''	.string "The road is dangerous without\n"
	.string "a companion at your side.$"''')

replace_block(scripts, "LittlerootTown_Text_CanYouGoSeeWhatsHappening", "LittlerootTown_Text_YouSavedBirch", r'''	.string "Please! Something is happening\n"
	.string "outside the walls!\p"
	.string "I heard shouting on the road, then\n"
	.string "a beast howling in the brush.\p"
	.string "A man went out there alone.\n"
	.string "Can you see if he still lives?$"''')

replace_block(scripts, "LittlerootTown_Text_YouSavedBirch", "LittlerootTown_Text_GoodLuckCatchingPokemon", r'''	.string "You brought him back alive!\p"
	.string "Word of that will travel through\n"
	.string "WINTERFELL quickly.$"''')

replace_block(scripts, "LittlerootTown_Text_GoodLuckCatchingPokemon", "LittlerootTown_Text_TownSign", r'''	.string "Heading beyond the walls again?\n"
	.string "Keep your steel close.$"''')

replace_block(scripts, "LittlerootTown_Text_TownSign", "LittlerootTown_Text_ProfBirchsLab", r'''	.string "WINTERFELL\n"
	.string "Seat of House Stark - The North.$"''')

replace_block(scripts, "LittlerootTown_Text_ProfBirchsLab", "LittlerootTown_Text_PlayersHouse", r'''	.string "THE MAESTER'S CHAMBER$"''')

replace_block(scripts, "LittlerootTown_Text_ProfBirchsHouse", "LittlerootTown_Text_BirchSomethingToShowYouAtLab", r'''	.string "THE MAESTER'S HOUSE$"''')

# Re-theme the post-rescue hook as the first quest completion beat.
# This block is last in the file, so replace from its label to EOF.
text = read(scripts)
pattern = r"(?ms)^LittlerootTown_Text_BirchSomethingToShowYouAtLab:\n.*\Z"
replacement = r'''LittlerootTown_Text_BirchSomethingToShowYouAtLab:
	.string "MAESTER: {PLAYER}{KUN}! You returned.\p"
	.string "The man you rescued was one of\n"
	.string "Winterfell's scouts.\p"
	.string "He saw armed riders on the road\n"
	.string "before the beast drove him off.\p"
	.string "That is no small matter. Come to\n"
	.string "my chamber. We must speak.$"
'''
text2, count = re.subn(pattern, lambda _m: replacement, text, count=1)
if count != 1:
    raise SystemExit(f"Could not replace final quest block; matches={count}")
write(scripts, text2)

print("Westeros Crossroads prototype edits applied successfully.")
