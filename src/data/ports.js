// Where a ship will take you, and what it costs.
//
// The fare is the same in both directions and rises with the distance, which is
// the only thing keeping the Free Cities from being a fast-travel network.

export const PORTS = [
  { map: 'kingsLanding', name: "King's Landing", x: 11, y: 20, dir: 'down', fare: 400 },
  { map: 'braavos', name: 'Braavos', x: 11, y: 18, dir: 'up', fare: 500 },
  { map: 'pentos', name: 'Pentos', x: 11, y: 18, dir: 'up', fare: 450 },
  { map: 'volantis', name: 'Volantis', x: 11, y: 18, dir: 'up', fare: 900 },
  { map: 'meereen', name: 'Meereen', x: 11, y: 18, dir: 'up', fare: 1400 },
];

export const PORT_MAPS = PORTS.map((p) => p.map);

export function port(mapId) {
  return PORTS.find((p) => p.map === mapId) ?? null;
}
