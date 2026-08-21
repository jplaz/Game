// People who ride with you.
//
// A companion is not a creature and not a hireling. They walk behind you on the
// road, they say things about the places you take them, they step into your
// duels — and if they fall in one, they are dead. Not fainted. There is no
// maester for this and no second chance, which is the only way the risk means
// anything.
//
//   vigour/might/guard   what they bring to a fight
//   aid                  how they help: 'strike', 'shield', 'mend'
//   house                who they answer to, for standing
//   recruit              what they say when they agree to come
//   lines                remarks on the road, one drawn at a time
//   death                what is said when they fall
//   requires             { house, standing } gate, if any

export const COMPANIONS = {
  jory: {
    name: 'Jory Cassel', sprite: 'stark', house: 'stark',
    level: 8, vigour: 90, might: 20, guard: 16, aid: 'shield',
    requires: { house: 'stark', standing: 20 },
    recruit: 'Jory Cassel: Lord Rickard said you would need a second sword. He was not wrong often.',
    refuse: 'Jory Cassel: I serve Winterfell. Come back when Winterfell thinks better of you.',
    lines: [
      'Jory Cassel: Keep your back to something solid. That is most of it.',
      'Jory Cassel: I have ridden this road twenty times. It is never the same twice.',
      'Jory Cassel: Eat something. You fight badly hungry and worse tired.',
    ],
    death: 'Jory Cassel: Tell them... tell them I held the road.',
  },
  bronn: {
    name: 'Bronn', sprite: 'sellsword', house: null,
    level: 14, vigour: 120, might: 34, guard: 14, aid: 'strike',
    cost: 2000,
    recruit: 'Bronn: For that much I will fight beside you, and I will not ask what for.',
    refuse: 'Bronn: Come back with coin. I am fond of you, not that fond.',
    lines: [
      'Bronn: There is no honour in a fair fight. That is rather the point of it.',
      'Bronn: If you die out here I keep the horse. Just so we understand each other.',
      'Bronn: You are getting better. Slowly. Like a boy learning to swim in a storm.',
    ],
    death: 'Bronn: Should have... charged you more.',
  },
  meera: {
    name: 'Meera Reed', sprite: 'wildlingWoman', house: 'stark',
    level: 11, vigour: 96, might: 26, guard: 12, aid: 'strike',
    requires: { house: 'stark', standing: 0 },
    recruit: 'Meera Reed: The Neck is no place to travel alone. Neither is anywhere else, lately.',
    refuse: 'Meera Reed: I do not know you well enough to die for you.',
    lines: [
      'Meera Reed: Crannogmen do not fight fair either. We just do it quietly.',
      'Meera Reed: Watch the ground, not the man. The ground tells you first.',
      'Meera Reed: My brother would have liked you. He liked almost nobody.',
    ],
    death: 'Meera Reed: Go on. Do not stop for me.',
  },
  sam: {
    name: 'Samwell Tarly', sprite: 'nightswatch', house: 'nightswatch',
    level: 9, vigour: 76, might: 12, guard: 10, aid: 'mend',
    requires: { house: 'nightswatch', standing: 0 },
    recruit: 'Samwell Tarly: I am not much good with a sword. I am rather good with everything else.',
    refuse: 'Samwell Tarly: I would only slow you down, and you would resent me for it.',
    lines: [
      'Samwell Tarly: I read about this place. The book was wrong about the smell.',
      'Samwell Tarly: Dragonglass. It kills them. Nobody believes me, but it does.',
      'Samwell Tarly: I am frightened nearly all of the time. It has not killed me yet.',
    ],
    death: 'Samwell Tarly: Oh. That is what it feels like.',
  },
  ygritte: {
    name: 'Ygritte', sprite: 'wildling', house: 'freefolk',
    level: 16, vigour: 128, might: 32, guard: 12, aid: 'strike',
    requires: { house: 'freefolk', standing: 30 },
    recruit: 'Ygritte: You are still a kneeler. But you are my kneeler now. Move.',
    refuse: 'Ygritte: You know nothing, and I do not travel with people who know nothing.',
    lines: [
      'Ygritte: You know nothing. It is almost charming, how much nothing.',
      'Ygritte: Free folk do not follow. I am walking the same way, is all.',
      'Ygritte: South of the Wall everything is soft. Even the weather.',
    ],
    death: 'Ygritte: You know nothing... you never did...',
  },
  brienne: {
    name: 'Brienne of Tarth', sprite: 'brienne', house: 'baratheon',
    level: 24, vigour: 200, might: 44, guard: 30, aid: 'shield',
    requires: { house: 'baratheon', standing: 25 },
    recruit: 'Brienne of Tarth: I swore an oath to keep the innocent from harm. You will do.',
    refuse: 'Brienne of Tarth: I do not know what you are. Until I do, I ride alone.',
    lines: [
      'Brienne of Tarth: An oath is not a thing you keep when it is convenient.',
      'Brienne of Tarth: They laugh at me until the swords are out. Then they stop.',
      'Brienne of Tarth: Stand straighter. People believe what your shoulders tell them.',
    ],
    death: 'Brienne of Tarth: I kept my oath. Say that much for me.',
  },
};

export const COMPANION_IDS = Object.keys(COMPANIONS);

/** What each kind of help does in a duel, in words the scene can print. */
export const AID_DESCRIPTION = {
  strike: 'strikes at your enemy',
  shield: 'turns a blow meant for you',
  mend: 'binds your wounds mid-fight',
};

export function companion(id) {
  const found = COMPANIONS[id];
  if (!found) throw new Error(`Unknown companion: ${id}`);
  return { id, ...found };
}
