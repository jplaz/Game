// How the world looks at you.
//
// Everybody in this game says the same sentence to you on the first morning
// and on the day you take the ninth seat, which is the single largest reason
// it does not feel like a story you are inside of. These are the lines people
// add when they notice something about you - the sigils on your arm, the
// swords at your back, the count of men you have put in the ground, or the
// fact that you have been north and come back saying things nobody wants to
// hear.
//
// Each entry carries the conditions it needs. The cartridge walks the list and
// keeps the LAST one that fits, so the specific beats the general: write the
// mild observations first and the ones that only a few players will ever earn
// at the bottom.
//
//   sigils   how many seats must have bent to you
//   host     how many sworn swords must be at your back
//   kills    how many people you must have killed
//   needs    a story flag that must be set
//   unless   a story flag that shuts the line off
//
// Nothing here fires every time. A remark somebody makes about you now and
// then reads as being noticed; the same remark on every conversation reads as
// a label somebody stapled to your chest.

export const REGARD = [
  // --- the long climb, measured in seats ------------------------------------
  { sigils: 1, line: 'They notice the sigil you are carrying and their voice changes a little.' },
  { sigils: 3, line: 'Three seats have bent to you. Word of that arrived before you did.' },
  { sigils: 5, line: 'They know your name. That is new, and you are not sure you like it.' },
  { sigils: 7, line: 'They stand when you stop, and are embarrassed about standing.' },
  { sigils: 9, line: 'Nine seats. Nobody in living memory has held nine, and they know it.' },

  // --- the company you keep -------------------------------------------------
  { host: 2, line: 'They count the swords behind you before they say anything at all.' },
  { host: 4, line: 'Four swords at your back. They speak to you the way people speak to a lord.' },
  { host: 6, line: 'Six sworn and armed behind you: they choose their words like a man on ice.' },

  // --- what you have done to people ----------------------------------------
  { kills: 20, line: 'They have heard how the last few ended, and they keep the table between you.' },
  { kills: 60, line: 'They will not meet your eye. Somewhere behind theirs they are counting.' },

  // --- the choices that carried --------------------------------------------
  { needs: 'hangingTree_saved',
    line: 'Somebody cut three men down at a crossroads for the price of a pig, and they have worked out it was you.' },
  { needs: 'hangingTree_ignored',
    line: 'They ask, without asking, whether you were the one who rode past the hanging tree.' },
  { needs: 'deserterAtTheGate_freed',
    line: 'You are the one who let the crow go. Half of them think you a fool and the other half do not say.' },

  // --- and the thing nobody wants to hear -----------------------------------
  { needs: 'sawADragon',
    line: 'You have seen one in the sky, and they can tell, because you keep looking up.' },
  { needs: 'metTheWatch',
    line: 'You mention the Wall and they find something to do with their hands.' },
  { needs: 'sawOneOfThem',
    line: 'You have stood in front of one of them. Nothing they say afterwards quite reaches you.' },
  { needs: 'theNorthIsSilent',
    line: 'Eleven days of silence out of the North, and you are the only one in the room who has counted them.' },

  // --- and the two ways the tower ended -------------------------------------
  { needs: 'brokenTower_burned',
    line: 'They heard about the tower and the fire. Nobody has said whether that was the right way of it.' },
  { needs: 'maestersDebt_fought',
    line: 'You drew on men collecting a debt for the Citadel. That story has legs on it.' },
];
