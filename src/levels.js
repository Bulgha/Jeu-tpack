// Définition des 10 niveaux et génération déterministe des champs d'astéroïdes.
//
// Chaque niveau précise :
//   name           nom affiché
//   fuel           carburant au départ (unités ; la poussée à fond brûle BURN_RATE u/s)
//   gravity        gravité du niveau (m/s²)
//   spawn          position de départ de la fusée [x, y, z]
//   platformRadius rayon de la plateforme d'atterrissage (centrée à l'origine)
//   asteroids      nombre d'astéroïdes sur le trajet
//   corridor       demi-largeur (m) de la zone où les astéroïdes sont dispersés
//   maxHeight      hauteur max des astéroïdes
//   seed           graine du générateur (champ identique à chaque partie)

export const LEVELS = [
  { name: "Premier envol",   fuel: 130, gravity: 9.81, spawn: [0, 70, 30],     platformRadius: 14,  asteroids: 0,  corridor: 0,  maxHeight: 0,  seed: 101 },
  { name: "Dérive douce",    fuel: 115, gravity: 9.81, spawn: [0, 72, 85],     platformRadius: 12,  asteroids: 7,  corridor: 30, maxHeight: 55, seed: 202 },
  { name: "Champ clairsemé", fuel: 110, gravity: 9.81, spawn: [20, 78, 125],   platformRadius: 11,  asteroids: 13, corridor: 34, maxHeight: 62, seed: 303 },
  { name: "Slalom rocheux",  fuel: 105, gravity: 9.81, spawn: [-30, 82, 155],  platformRadius: 10,  asteroids: 20, corridor: 36, maxHeight: 68, seed: 404 },
  { name: "La ceinture",     fuel: 100, gravity: 9.81, spawn: [40, 86, 185],   platformRadius: 9,   asteroids: 28, corridor: 38, maxHeight: 74, seed: 505 },
  { name: "Passage étroit",  fuel: 95,  gravity: 9.81, spawn: [0, 90, 215],    platformRadius: 8.5, asteroids: 36, corridor: 30, maxHeight: 80, seed: 606 },
  { name: "Gravité lourde",  fuel: 105, gravity: 12.0, spawn: [-50, 92, 225],  platformRadius: 8,   asteroids: 40, corridor: 38, maxHeight: 82, seed: 707 },
  { name: "Mer de pierres",  fuel: 95,  gravity: 9.81, spawn: [60, 96, 255],   platformRadius: 7,   asteroids: 50, corridor: 42, maxHeight: 88, seed: 808 },
  { name: "Le gant",         fuel: 90,  gravity: 9.81, spawn: [0, 102, 285],   platformRadius: 6.5, asteroids: 62, corridor: 32, maxHeight: 94, seed: 909 },
  { name: "L'aiguille",      fuel: 90,  gravity: 12.0, spawn: [-70, 110, 305], platformRadius: 5.5, asteroids: 74, corridor: 40, maxHeight: 100, seed: 1010 },
];

// Générateur pseudo-aléatoire déterministe (mulberry32).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Génère les astéroïdes d'un niveau : dispersés le long du couloir qui relie
// le point de départ à la plateforme (à l'origine), en épargnant une zone de
// sécurité autour du départ et au-dessus de la plateforme.
export function buildAsteroids(cfg) {
  const rng = mulberry32(cfg.seed);
  const list = [];
  const [sx, , sz] = cfg.spawn;
  const spawnDist = Math.hypot(sx, sz);

  let attempts = 0;
  while (list.length < cfg.asteroids && attempts < cfg.asteroids * 40) {
    attempts++;

    // Position le long du couloir départ → plateforme (t=0 : plateforme).
    const t = 0.12 + 0.83 * rng();
    const cx = sx * t;
    const cz = sz * t;
    // Décalage latéral perpendiculaire au couloir.
    const perpX = spawnDist > 0 ? -sz / spawnDist : 1;
    const perpZ = spawnDist > 0 ? sx / spawnDist : 0;
    const lat = (rng() * 2 - 1) * cfg.corridor;
    const x = cx + perpX * lat;
    const z = cz + perpZ * lat;
    const y = 6 + rng() * cfg.maxHeight;
    const size = 2.5 + rng() * 6.5;

    // Zone de sécurité : pas d'astéroïde bas au-dessus de la plateforme…
    const distPlat = Math.hypot(x, z);
    if (distPlat < cfg.platformRadius + 20 && y < 45) continue;
    // …ni trop près du point de départ.
    const dSpawn = Math.hypot(x - sx, y - cfg.spawn[1], z - sz);
    if (dSpawn < 28) continue;

    list.push({
      pos: [x, y, z],
      size,
      kind: rng() < 0.25 ? "box" : "rock",
      rot: [rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2],
      hue: rng(),
    });
  }
  return list;
}
