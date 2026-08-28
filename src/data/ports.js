// Where a ship will take you, and what it costs.
//
// The fare is the same in both directions and rises with the distance, which is
// the only thing keeping the Free Cities from being a fast-travel network.

export const PORTS = [
  { map: 'kingsLanding', name: "King's Landing", x: 11, y: 20, dir: 'down', fare: 400 },
  { map: 'lordsportDocks', name: 'Lordsport', x: 11, y: 6, dir: 'down', fare: 350 },
  { map: 'dragonstone', name: 'Dragonstone', x: 11, y: 18, dir: 'up', fare: 600 },
  { map: 'braavos', name: 'Braavos', x: 11, y: 18, dir: 'up', fare: 500 },
  { map: 'pentos', name: 'Pentos', x: 11, y: 18, dir: 'up', fare: 450 },
  { map: 'volantis', name: 'Volantis', x: 11, y: 18, dir: 'up', fare: 900 },
  { map: 'meereen', name: 'Meereen', x: 11, y: 18, dir: 'up', fare: 1400 },
  /* North along the coast rather than east across the sea. Eastwatch is the
     only berth on the Wall, and Hardhome is the only place anybody sails to
     from it - which is why the fare is what it is: nobody wants the work. */
  { map: 'eastwatch', name: 'Eastwatch-by-the-Sea', x: 11, y: 18, dir: 'up', fare: 700 },
  { map: 'hardhome', name: 'Hardhome', x: 11, y: 21, dir: 'up', fare: 1800 },
];

export const PORT_MAPS = PORTS.map((p) => p.map);

export function port(mapId) {
  return PORTS.find((p) => p.map === mapId) ?? null;
}
