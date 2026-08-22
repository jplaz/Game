# Game of Thrones / Westeros RPG — Master Build Spec

## Foundation
- Use `eonlynx/pokecrossroads` / pokeemerald-expansion as the permanent GBA engine base.
- Preserve Gen III-style movement, camera, collision, maps, transitions, battles, menus, inventory, saving, followers and Delta compatibility.
- Do not fall back to the old browser/custom prototype engine.
- Crossroads is an engine only; the finished presentation should not feel like a Pokemon game.

## Player fantasy
- Long-form Westeros RPG beginning as a relatively minor character and eventually allowing a path to the Iron Throne.
- Character creation/name plus House/allegiance choice.
- Distinct starting location, early quests, relationships and outcomes by House.
- Slow, meaningful level/XP/rank progression.
- Weapons, armor, shields, consumables, gold and renown/reputation.
- Quest choices, alliances, betrayals and consequences.

## World
Regions and major destinations should include:
- The North / Winterfell
- The Wall / Castle Black / lands beyond the Wall
- Riverlands / Riverrun / the Twins
- The Vale / the Eyrie / Gulltown
- Westerlands / Casterly Rock / Lannisport
- The Reach / Highgarden
- Stormlands / Storm's End
- Dorne / Sunspear
- Dragonstone
- King's Landing / Red Keep / throne room

The world needs routes, roads, forests, towns, ports, caves, castles and interiors. It should look like a Gen III RPG but use Westeros-specific scenery, architecture, signs, NPCs and creatures.

## Houses / factions
Initial major choices should support at least Stark, Targaryen, Lannister, Tully and Greyjoy, with room to expand to Arryn, Baratheon, Tyrell, Martell, Night's Watch, Wildlings and other factions.

House choice should affect:
- Starting seat/location
- Starting level/background
- House colors/sigil presentation
- Early equipment/companion
- Friendly/hostile NPC relationships
- Dialogue and quest branches
- Reputation and political options

## Combat
- Keep the proven Crossroads battle engine internally, but re-present it as Westeros RPG combat.
- Party becomes companions/warband.
- Pokemon species slots can be repurposed as named companions, fighter archetypes, animals, dragons, wights and bosses.
- Moves become techniques, weapon attacks, tactics and dragon abilities.
- Types/abilities/status effects may be repurposed into RPG combat traits.
- Human, animal, undead and faction encounters.
- Named bosses/allies can have levels, vigour/might/guard/swiftness/wind-style stats, techniques, rewards, EXP and loot.
- Support nonlethal/yield and lethal outcomes where story-appropriate.
- Persistent consequences after major encounters.

## Equipment / economy
- Bag becomes Pack.
- Money becomes Gold.
- Weapons, armor, shields, remedies/food and quest items.
- Blacksmiths/armorers and shops/markets.
- Better gear should matter and progression should remain difficult rather than becoming trivial quickly.

## Companions
- Recruitable named companions with relationship/bond values.
- Companion dialogue and reactions to player choices.
- Selectable follower on the overworld when practical.
- Party screen should ultimately read as a companion/warband roster rather than a Pokemon party.

## Dragons
- Dragon eggs can be obtained through story/exploration.
- Egg -> hatchling -> juvenile -> adult progression.
- Select which dragon follows the player.
- Dragon battle abilities and growth.
- Dragons should be original Westeros-style pixel creatures rather than Pokemon stand-ins.

## Living world
Persistent major NPC agents should have:
- Location
- Level/progression
- Bonds and rivalries
- Goals
- Mood/state
- Win/loss record
- Memories of important interactions

Offline simulation should periodically let major NPCs train, explore, socialize, rest, study, seek rivals and fight each other. The world should continue changing outside the player's immediate screen while remaining completely offline/GBA compatible.

## Political progression
- House/faction reputation and renown.
- Branching political quests and alliances.
- Progression toward King's Landing and the Iron Throne should require substantial play, not a short badge replacement loop.
- Different routes/outcomes based on alliances, reputation and major choices.

## Ruler postgame
Claiming the throne is not the end. Postgame should include:
- Small Council decisions
- Treasury/gold
- Realm stability
- Faction relations
- Events/crises
- Continued travel and quests
- Consequences from earlier choices

## Presentation conversion
Remove or replace visible Pokemon identity over time:
- Custom Game of Thrones/Westeros title screen
- Pokemon terminology removed from normal player-facing UI
- Pokedex -> Lorebook
- Pokemon/party -> Party/Companions
- Bag -> Pack
- PokeNav/world navigation -> Realm Map
- Trainer -> Fighter/Knight/etc.
- Pokemon Center -> Healer's Hall / Inn / Maester
- Mart -> Market / Smith
- Gyms -> Keeps / House quest hubs
- Badges -> Sigils / Renown / titles
- Elite Four / Champion -> late-game political/combat progression toward the throne
- Replace Pokemon sprites with humans, animals, dragons, wights and other Westeros units as the content conversion expands.

## Quality bar
- Real Emerald-style tile overworld and camera.
- No flicker, cut-off UI or obvious broken transitions.
- Fully walkable maps with correct exits/interiors.
- Interactable NPCs, quests, shops, blacksmiths and dialogue.
- GoT/Westeros-specific art and content rather than Pokemon stand-ins in the finished game.
- One master source/build line; no disconnected ROM variants.
- Every ROM shared for testing must be compiled from the current source changes and pass the build.