// Where a ship will take you, what it costs, and what you have to have done
// first.
//
// The fare rises with the distance, and for a long time that was the only thing
// standing between a new rider and Meereen -- which made the whole sigil ladder
// optional. Wardens hold the Bloody Gate, the roseroad, the Prince's Pass and
// the storm lands against anybody with too few seats behind them; a captain
// with a full purse in front of him held nothing at all, so the road was gated
// and the sea was not. Gold is not an achievement.
//
//   needs   seats you must hold before a captain will take you there
//
// Nothing that is somebody's own beginning is gated: a Greyjoy can always get
// home to Lordsport and a Targaryen to Dragonstone, whatever they have or have
// not done since.

export const PORTS = [
  { map: 'kingsLanding', name: "King's Landing", x: 11, y: 20, dir: 'down', fare: 400, needs: 0 },
  { map: 'lordsportDocks', name: 'Lordsport', x: 11, y: 6, dir: 'down', fare: 350, needs: 0 },
  { map: 'dragonstone', name: 'Dragonstone', x: 11, y: 18, dir: 'up', fare: 600, needs: 0 },
  { map: 'braavos', name: 'Braavos', x: 11, y: 18, dir: 'up', fare: 500, needs: 4 },
  { map: 'pentos', name: 'Pentos', x: 11, y: 18, dir: 'up', fare: 450, needs: 5 },
  { map: 'volantis', name: 'Volantis', x: 16, y: 8, dir: 'up', fare: 900, needs: 7 },
  { map: 'meereen', name: 'Meereen', x: 11, y: 18, dir: 'up', fare: 1400, needs: 9 },
  /* North along the coast rather than east across the sea. Eastwatch is the
     only berth on the Wall, and Hardhome is the only place anybody sails to
     from it - which is why the fare is what it is: nobody wants the work. */
  { map: 'eastwatch', name: 'Eastwatch-by-the-Sea', x: 11, y: 18, dir: 'up', fare: 700, needs: 0 },
  { map: 'hardhome', name: 'Hardhome', x: 11, y: 21, dir: 'up', fare: 1800, needs: 6 },
];

export const PORT_MAPS = PORTS.map((p) => p.map);

export function port(mapId) {
  return PORTS.find((p) => p.map === mapId) ?? null;
}
