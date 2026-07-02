// Définition des 10 niveaux et génération déterministe des champs d'obstacles.
//
// Chaque niveau précise :
//   name           nom affiché
//   theme          environnement du niveau (voir THEMES dans main.js)
//   fuel           carburant au départ (unités)
//   gravity        gravité du niveau (m/s²)
//   spawn          position de départ de la fusée [x, y, z]
//   platformRadius rayon de la plateforme d'atterrissage (centrée à l'origine)
//   coin           position de la pièce à récupérer avant de pouvoir se poser
//   obstacles      nombre d'obstacles, répartis TOUT AUTOUR de la cible
//   maxHeight      hauteur max des obstacles flottants
//   types          familles d'obstacles et leurs poids relatifs :
//                  rock (rocher), box (bloc), crystal (cristal),
//                  ring (anneau de pierre), column (pilier ancré au sol)
//   seed           graine du générateur (champ identique à chaque partie)

export const LEVELS = [
  { name: "La Forêt d'Émeraude", theme: "forest", fuel: 160, gravity: 9.81, spawn: [0, 70, 30],     platformRadius: 12,  coin: [0, 25, -50],     obstacles: 6,  maxHeight: 45,  seed: 101,
    types: { rock: 1 } },
  { name: "Le Monde de Glace",   theme: "ice",    fuel: 150, gravity: 9.81, spawn: [0, 72, 85],     platformRadius: 10.5, coin: [60, 30, -30],   obstacles: 14, maxHeight: 55,  seed: 202,
    types: { rock: 3, box: 1 } },
  { name: "Les Terres Mystiques", theme: "mystic", fuel: 145, gravity: 9.81, spawn: [20, 78, 125],  platformRadius: 9.5, coin: [-70, 35, 40],    obstacles: 22, maxHeight: 62,  seed: 303,
    types: { rock: 3, box: 1, crystal: 1 } },
  { name: "Le Grand Désert",     theme: "desert", fuel: 140, gravity: 9.81, spawn: [-30, 82, 155],  platformRadius: 9,   coin: [80, 40, -60],    obstacles: 30, maxHeight: 68,  seed: 404,
    types: { rock: 3, box: 1, crystal: 1, ring: 1 } },
  { name: "La Fournaise",        theme: "volcano", fuel: 135, gravity: 9.81, spawn: [40, 86, 185],  platformRadius: 8,   coin: [-90, 45, -60],   obstacles: 40, maxHeight: 74,  seed: 505,
    types: { rock: 3, box: 1, crystal: 1.2, ring: 1, column: 0.8 } },
  { name: "L'Archipel",          theme: "ocean",  fuel: 130, gravity: 9.81, spawn: [0, 90, 215],    platformRadius: 7.5, coin: [100, 40, 80],    obstacles: 50, maxHeight: 80,  seed: 606,
    types: { rock: 2.5, box: 1, crystal: 1.2, ring: 1.2, column: 1 } },
  { name: "Le Marais Toxique",   theme: "swamp",  fuel: 140, gravity: 12.0, spawn: [-50, 92, 225],  platformRadius: 7,   coin: [90, 50, -90],    obstacles: 55, maxHeight: 82,  seed: 707,
    types: { rock: 2.5, box: 1, crystal: 1.5, ring: 1.2, column: 1 } },
  { name: "La Nuit des Lucioles", theme: "night", fuel: 130, gravity: 9.81, spawn: [60, 96, 255],   platformRadius: 6.5, coin: [-110, 45, 90],   obstacles: 65, maxHeight: 88,  seed: 808,
    types: { rock: 2, box: 1, crystal: 1.5, ring: 1.5, column: 1.2 } },
  { name: "Le Royaume Sucré",    theme: "candy",  fuel: 125, gravity: 9.81, spawn: [0, 102, 285],   platformRadius: 6,   coin: [120, 55, -100],  obstacles: 80, maxHeight: 94,  seed: 909,
    types: { rock: 2, box: 1, crystal: 1.5, ring: 1.5, column: 1.5 } },
  { name: "La Planète X",        theme: "alien",  fuel: 125, gravity: 12.0, spawn: [-70, 110, 305], platformRadius: 5,   coin: [130, 50, 120],   obstacles: 95, maxHeight: 100, seed: 1010,
    types: { rock: 2, box: 1, crystal: 2, ring: 2, column: 1.5 } },
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

// Génère les obstacles d'un niveau, répartis dans un anneau complet autour
// de la plateforme (360°), en épargnant trois bulles de sécurité : le départ,
// la pièce à ramasser, et le ciel juste au-dessus de la plateforme.
export function buildObstacles(cfg) {
  const rng = mulberry32(cfg.seed);
  const [sx, sy, sz] = cfg.spawn;
  const [cx, cy, cz] = cfg.coin;
  const rMin = cfg.platformRadius + 16;
  const rMax = Math.max(Math.hypot(sx, sz), Math.hypot(cx, cz)) + 30;

  const kinds = Object.entries(cfg.types);
  const totalWeight = kinds.reduce((s, [, w]) => s + w, 0);
  const pickKind = () => {
    let r = rng() * totalWeight;
    for (const [k, w] of kinds) { r -= w; if (r <= 0) return k; }
    return kinds[0][0];
  };

  const list = [];
  let attempts = 0;
  while (list.length < cfg.obstacles && attempts < cfg.obstacles * 60) {
    attempts++;
    const kind = pickKind();
    const a = rng() * Math.PI * 2;
    // Tirage uniforme en surface dans l'anneau [rMin, rMax]
    const d = Math.sqrt(rMin * rMin + (rMax * rMax - rMin * rMin) * rng());
    const x = Math.cos(a) * d, z = Math.sin(a) * d;

    let size, h = 0, y, rot;
    if (kind === "column") {
      size = 1.6 + rng() * 1.6;                 // rayon du pilier
      h = 12 + rng() * cfg.maxHeight * 0.6;     // hauteur, ancré au sol
      y = h / 2;
      rot = [0, rng() * Math.PI * 2, 0];
      if (d < cfg.platformRadius + 22) continue; // jamais collé à la plateforme
    } else if (kind === "ring") {
      size = 4 + rng() * 3;                     // rayon majeur de l'anneau
      y = 10 + rng() * cfg.maxHeight * 0.85;
      rot = [rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2];
    } else if (kind === "crystal") {
      size = 2 + rng() * 3.2;
      y = 6 + rng() * cfg.maxHeight;
      rot = [rng() * 0.5, rng() * Math.PI * 2, rng() * 0.5];
    } else { // rock / box
      size = 2.5 + rng() * 6.5;
      y = 6 + rng() * cfg.maxHeight;
      rot = [rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2];
    }

    // Ciel dégagé juste au-dessus de la plateforme
    if (d < cfg.platformRadius + 14 && y < 42) continue;
    // Bulle de sécurité au départ…
    if (Math.hypot(x - sx, y - sy, z - sz) < 26) continue;
    // …et autour de la pièce
    if (Math.hypot(x - cx, y - cy, z - cz) < 18) continue;
    if (kind === "column" && Math.hypot(x - cx, z - cz) < 16 && cy < h + 8) continue;

    list.push({ kind, pos: [x, y, z], size, h, rot, hue: rng() });
  }
  return list;
}
