// Fusée T-Pack — jeu d'atterrissage 3D
// Pilotez une fusée à travers un champ d'astéroïdes et posez-la en douceur
// sur la plateforme. 10 niveaux, carburant limité.

import * as THREE from "three";
import { LEVELS, buildObstacles, mulberry32 } from "./levels.js";

/* ============================== Constantes ============================== */

const MAX_THRUST = 22;      // accélération moteur à pleine puissance (m/s²)
const BURN_RATE = 2.0;      // carburant brûlé par seconde à pleine puissance
const ANG_ACCEL = 2.4;      // accélération angulaire tangage/roulis (rad/s²)
const YAW_ACCEL = 1.9;      // accélération angulaire lacet (rad/s²)
const ANG_DAMP = 1.8;       // amortissement angulaire (exponentiel, 1/s)
const ROCKET_BOTTOM = 2.8;  // distance centre → bas de la fusée
const PLATFORM_TOP = 2;     // hauteur du dessus de la plateforme

// Atterrissage : les trains sortent automatiquement près de la cible ; le
// niveau est réussi quand les 4 pieds reposent sur la plateforme, immobiles
// pendant STABLE_TIME. Le vrai danger : basculer sur le côté.
const STABLE_TIME = 2;      // s d'immobilité requises sur la cible
const BODY_TIP = 70;        // ° : couchée au-delà → explose au contact du sol
const IMPACT_MAX = 12;      // m/s : impact vertical qui casse la structure
const LEG_ANGLE = 0.95;     // rad : ouverture des trains déployés (assise large)
const LEG_PIVOT_Y = -1.85, LEG_PIVOT_R = 0.5, LEG_LEN = 2.2;
const LEG_HIDE_Y = 0.2;     // position du pivot trains rentrés (cachés dans le corps)
const LEG_DEPLOY_T = 1.1;   // s : durée de la sortie des trains
const CONTACT_K = 300;      // raideur du contact pied/sol
const CONTACT_C = 30;       // amortissement du contact
const FRICTION = 0.45;      // frottement des pieds (bas : on glisse au lieu de verser)
const RIGHT_K = 10;         // couple de redressement des trains au contact
const RIGHT_FADE = [0.55, 0.32]; // rad : le redressement s'estompe de ~31° à ~50°
const CONTACT_DAMP = 6;     // amortissement angulaire supplémentaire au contact
const INERTIA = 4;          // inertie en rotation (masse = 1)
const PHYS_H = 1 / 240;     // sous-pas d'intégration des contacts
const HINT_V = 8, HINT_H = 6, HINT_TILT = 25; // seuils indicatifs du HUD

const STORAGE_KEY = "tpack-unlocked";

/* ============================== DOM =================================== */

const $ = (id) => document.getElementById(id);
const menuEl = $("menu"), hudEl = $("hud"), overlayEl = $("overlay");
const overlayTitle = $("overlay-title"), overlayText = $("overlay-text"),
      overlayButtons = $("overlay-buttons"), levelGrid = $("level-grid");

/* ============================== Rendu 3D =============================== */

const renderer = new THREE.WebGLRenderer({ canvas: $("scene"), antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf2c491);
scene.fog = new THREE.Fog(0xf2c491, 300, 1500);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 4000);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Lumières (les couleurs/intensités sont pilotées par le thème du niveau)
const hemiLight = new THREE.HemisphereLight(0xffd9a8, 0x3e5e3f, 0.6);
scene.add(hemiLight);
const sun = new THREE.DirectionalLight(0xffdcb0, 1.3);
sun.position.set(180, 140, 80);
scene.add(sun);
const ambLight = new THREE.AmbientLight(0xfff1de, 0.18);
scene.add(ambLight);

// Objets secrets cachés dans le décor (positions fixes, tous thèmes)
const eggObjects = {};

/* ==================== Environnements thématiques ======================== */
// Chaque niveau a son propre monde : ciel, brouillard, sol, mares, flore,
// collines, lumières… et la teinte des obstacles s'y accorde.

const THEMES = {
  forest: {
    sky: [[0, "#5d8fc9"], [0.5, "#a9c6e0"], [0.78, "#f2c491"], [1, "#f7d9ac"]],
    fog: [0xf2c491, 300, 1500],
    hemi: [0xffd9a8, 0x3e5e3f, 0.6], sun: [0xffdcb0, 1.3], amb: [0xfff1de, 0.18],
    ground: { c: 0x4d8a52, rough: 1, metal: 0 },
    pools: { n: 9, c: 0x4d90c9, rough: 0.15, metal: 0.35 },
    flora: { type: "pine", n: 400 },
    hills: { shape: "cone", n: 12, hsl: [0.37, 0.25, 0.34] },
    rock: [0.06, 0.06, 0.18, 0.15, 0.3, 0.18],
  },
  ice: {
    sky: [[0, "#7ab8dd"], [0.55, "#b8dcf0"], [0.85, "#e8f4fa"], [1, "#f4fafd"]],
    fog: [0xdcecf5, 280, 1450],
    hemi: [0xcfe8ff, 0xdfe8f0, 0.75], sun: [0xffffff, 1.15], amb: [0xe8f2ff, 0.2],
    ground: { c: 0xe8f2f8, rough: 0.9, metal: 0 },
    pools: { n: 8, c: 0xa8d4ea, rough: 0.05, metal: 0.55 },
    flora: { type: "frostpine", n: 320 },
    hills: { shape: "cone", n: 13, hsl: [0.55, 0.12, 0.82] },
    rock: [0.55, 0.05, 0.12, 0.1, 0.55, 0.2],
    particles: { c: 0xffffff, n: 500, h: 70 },
  },
  mystic: {
    sky: [[0, "#160f2e"], [0.5, "#3a2260"], [0.8, "#8a4fb0"], [1, "#c47fd8"]],
    fog: [0x8a5fae, 240, 1300],
    hemi: [0xb08fe0, 0x2a1f3a, 0.55], sun: [0xd8aaff, 0.8], amb: [0xb090e0, 0.2],
    ground: { c: 0x3a2f52, rough: 1, metal: 0 },
    pools: { n: 8, c: 0x8a5fd8, rough: 0.2, metal: 0.3, emissive: 0x6a3fbf, ei: 0.45 },
    flora: { type: "mushroom", n: 300 },
    hills: { shape: "dome", n: 11, hsl: [0.76, 0.3, 0.3] },
    rock: [0.72, 0.08, 0.25, 0.15, 0.3, 0.15],
    stars: true,
    particles: { c: 0xd8a8ff, n: 350, h: 50 },
  },
  desert: {
    sky: [[0, "#6ab0d8"], [0.55, "#aaccdd"], [0.82, "#f2d8a0"], [1, "#f7e2b0"]],
    fog: [0xeed9a8, 300, 1500],
    hemi: [0xffe8c0, 0x9a7a4e, 0.65], sun: [0xffe2b0, 1.35], amb: [0xfff1de, 0.15],
    ground: { c: 0xd8b878, rough: 1, metal: 0 },
    pools: { n: 3, c: 0x4d90c9, rough: 0.1, metal: 0.4 }, // oasis
    flora: { type: "cactus", n: 220 },
    hills: { shape: "mesa", n: 10, hsl: [0.08, 0.42, 0.5] },
    rock: [0.07, 0.04, 0.4, 0.15, 0.42, 0.15],
  },
  volcano: {
    sky: [[0, "#1a0d0d"], [0.5, "#4a1c14"], [0.8, "#a03a1a"], [1, "#d86a2a"]],
    fog: [0x6a3424, 220, 1200],
    hemi: [0xff9a6a, 0x241412, 0.5], sun: [0xff8855, 0.9], amb: [0xff9a6a, 0.15],
    ground: { c: 0x2e2a28, rough: 1, metal: 0 },
    pools: { n: 10, c: 0xff5500, rough: 0.4, metal: 0, emissive: 0xff4400, ei: 1.1 }, // lave
    flora: { type: "charspike", n: 260 },
    hills: { shape: "cone", n: 15, hsl: [0.03, 0.2, 0.14] },
    rock: [0.02, 0.04, 0.15, 0.15, 0.14, 0.1],
    particles: { c: 0xffa040, n: 400, h: 45 }, // braises
  },
  ocean: {
    sky: [[0, "#3a8fd8"], [0.55, "#7ac0e8"], [0.85, "#c8ecf5"], [1, "#e8f8fc"]],
    fog: [0xbfe4f2, 300, 1500],
    hemi: [0xd8f0ff, 0x2b6ca8, 0.7], sun: [0xfff2d8, 1.3], amb: [0xe0f4ff, 0.15],
    ground: { c: 0x2b6ca8, rough: 0.15, metal: 0.35 }, // la mer
    pools: { n: 12, c: 0xe8d8a0, rough: 0.9, metal: 0 }, // îlots de sable
    flora: { type: "palm", n: 90, onPools: true },
    hills: { shape: "dome", n: 8, hsl: [0.34, 0.3, 0.4] }, // îles lointaines
    rock: [0.09, 0.05, 0.3, 0.15, 0.4, 0.15],
  },
  swamp: {
    sky: [[0, "#2a3a26"], [0.5, "#4d6238"], [0.8, "#8fa050"], [1, "#b8c26a"]],
    fog: [0x7d8f52, 160, 950],
    hemi: [0xb8cf8a, 0x22301c, 0.55], sun: [0xd8e8a0, 0.75], amb: [0xb8cf8a, 0.18],
    ground: { c: 0x3a4632, rough: 1, metal: 0 },
    pools: { n: 12, c: 0x9dff4a, rough: 0.3, metal: 0.1, emissive: 0x7ad82a, ei: 0.5 }, // acide
    flora: { type: "deadtree", n: 300 },
    hills: { shape: "dome", n: 9, hsl: [0.24, 0.25, 0.22] },
    rock: [0.22, 0.08, 0.2, 0.15, 0.22, 0.12],
    particles: { c: 0xc8ff8a, n: 300, h: 35 }, // spores
  },
  night: {
    sky: [[0, "#05070f"], [0.55, "#0b1226"], [0.85, "#1c2a4a"], [1, "#2a3a5e"]],
    fog: [0x101a30, 260, 1300],
    hemi: [0x3346aa, 0x0e1414, 0.4], sun: [0x9db4ff, 0.4], amb: [0x8090c0, 0.12],
    ground: { c: 0x17251c, rough: 1, metal: 0 },
    pools: { n: 8, c: 0x1a3a5e, rough: 0.1, metal: 0.5 },
    flora: { type: "nightpine", n: 380 },
    hills: { shape: "cone", n: 12, hsl: [0.6, 0.15, 0.12] },
    rock: [0.6, 0.06, 0.12, 0.1, 0.16, 0.1],
    stars: true, moon: true,
    particles: { c: 0xd8ff7a, n: 450, h: 26 }, // lucioles
  },
  candy: {
    sky: [[0, "#7ac8e8"], [0.5, "#a8d8f0"], [0.8, "#ffd8ec"], [1, "#ffe8f4"]],
    fog: [0xffd8ea, 300, 1500],
    hemi: [0xfff0f8, 0xf2a8c8, 0.7], sun: [0xfff0e0, 1.25], amb: [0xffe8f0, 0.2],
    ground: { c: 0xf2a8c8, rough: 0.9, metal: 0 },
    pools: { n: 9, c: 0x8ae0d8, rough: 0.1, metal: 0.3 }, // lagons menthe
    flora: { type: "candy", n: 300 },
    hills: { shape: "dome", n: 12, hsl: [0.9, 0.45, 0.75] },
    rock: [0.85, 0.3, 0.45, 0.2, 0.6, 0.15], // bonbons pastel
  },
  alien: {
    sky: [[0, "#020208"], [0.6, "#0a0a18"], [0.9, "#1c1428"], [1, "#2a1c34"]],
    fog: [0x160f1e, 300, 1600],
    hemi: [0x8899bb, 0x4a3428, 0.45], sun: [0xe8f0ff, 0.95], amb: [0x9aa8c8, 0.12],
    ground: { c: 0x8a5a42, rough: 1, metal: 0 },
    pools: { n: 7, c: 0x241c18, rough: 1, metal: 0 }, // cratères
    flora: { type: "spire", n: 130 },
    hills: { shape: "cone", n: 12, hsl: [0.05, 0.25, 0.28] },
    rock: [0.04, 0.05, 0.25, 0.15, 0.3, 0.15],
    stars: true, planet: true,
  },
  storm: { // le monde de l'Épreuve Extrême
    sky: [[0, "#14181f"], [0.5, "#2a3340"], [0.8, "#4d5a68"], [1, "#6a7885"]],
    fog: [0x46525e, 210, 1150],
    hemi: [0x8fa3b8, 0x1c2420, 0.5], sun: [0xc8d8e8, 0.85], amb: [0x9ab0c0, 0.14],
    ground: { c: 0x2e3a34, rough: 1, metal: 0 },
    pools: { n: 10, c: 0x22303e, rough: 0.1, metal: 0.5 },
    flora: { type: "deadtree", n: 320 },
    hills: { shape: "cone", n: 14, hsl: [0.58, 0.1, 0.16] },
    rock: [0.58, 0.06, 0.1, 0.1, 0.2, 0.12],
    particles: { c: 0x9ab0c0, n: 600, h: 80 }, // pluie en suspension
  },
  eclipse: { // le monde de l'Éclipse Finale
    sky: [[0, "#050208"], [0.55, "#150a18"], [0.8, "#3a1020"], [1, "#6a1c28"]],
    fog: [0x2a1018, 220, 1200],
    hemi: [0x8a4a5a, 0x140a10, 0.45], sun: [0xff6a5a, 0.7], amb: [0xaa5a6a, 0.15],
    ground: { c: 0x2a2226, rough: 1, metal: 0 }, // cendres
    pools: { n: 9, c: 0x8a1a2a, rough: 0.3, metal: 0.2, emissive: 0xcc1a2a, ei: 0.7 }, // mares écarlates
    flora: { type: "charspike", n: 300 },
    hills: { shape: "cone", n: 14, hsl: [0.98, 0.2, 0.12] },
    rock: [0.97, 0.05, 0.2, 0.15, 0.18, 0.12],
    stars: true, eclipse: true,
    particles: { c: 0xff7a5a, n: 500, h: 60 },
  },
};

/* --------------------- Relief léger du terrain -------------------------- */

// Relief par thème : a = amplitude des collines (m), d = crêtes de dunes (m)
const TERRAIN = {
  forest:  { a: 8,   d: 0 },
  ice:     { a: 10,  d: 2 },
  mystic:  { a: 11,  d: 0 },
  desert:  { a: 15,  d: 6 },   // vraies dunes à crêtes
  volcano: { a: 13,  d: 3 },
  ocean:   { a: 0,   d: 0 },   // la mer reste plate
  swamp:   { a: 3.5, d: 0 },   // marais presque plat
  night:   { a: 8,   d: 0 },
  candy:   { a: 12,  d: 4 },   // collines de guimauve
  alien:   { a: 14,  d: 5 },
  storm:   { a: 13,  d: 4 },
  eclipse: { a: 15,  d: 5 },
};
const FLAT_PAD = 34; // rayon aplati autour de la plateforme
const FLAT_EGGS = [{ x: 140, z: -95, r: 14 }, { x: -180, z: 120, r: 12 }, { x: 200, z: -160, r: 14 }];
let terrainSpots = [];              // zones aplaties (mares) du thème courant
let terrainAmp = 8, terrainDune = 0; // relief du thème courant
let waterTex = null;                // texture d'eau animée du thème courant

function smooth01(v) {
  v = Math.min(1, Math.max(0, v));
  return v * v * (3 - 2 * v);
}

// Hauteur du relief en (x, z) : houle ample + collines + crêtes de dunes,
// aplati autour de la plateforme, des mares et des secrets. Utilisée par le
// rendu ET la physique (contacts, crashs, altitude HUD).
function terrainH(x, z) {
  if (terrainAmp === 0) return 0;
  let b = 0.5
    + 0.30 * Math.sin(x * 0.006 + 1.7) * Math.cos(z * 0.007 + 0.6)
    + 0.16 * Math.sin(x * 0.013 + 0.5) * Math.cos(z * 0.011 - 0.9)
    + 0.09 * Math.sin(x * 0.027 - 0.8) * Math.sin(z * 0.021 + 2.2)
    + 0.05 * Math.cos(x * 0.05 + 0.3) * Math.cos(z * 0.043 - 1.1);
  b = Math.min(1, Math.max(0, b));
  let h = b * terrainAmp;
  if (terrainDune > 0) {
    const ridge = 1 - Math.abs(Math.sin(x * 0.009 + z * 0.012 + 0.8));
    h += ridge * ridge * terrainDune;
  }
  let k = smooth01((Math.hypot(x, z) - FLAT_PAD) / 60);
  for (const s of terrainSpots) k = Math.min(k, smooth01((Math.hypot(x - s.x, z - s.z) - s.r) / 35));
  for (const s of FLAT_EGGS) k = Math.min(k, smooth01((Math.hypot(x - s.x, z - s.z) - s.r) / 35));
  return h * k;
}

// Texture procédurale de vaguelettes pour les plans d'eau (et de lave…)
function makeWaterTexture(baseHex) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  const base = new THREE.Color(baseHex);
  g.fillStyle = `#${base.getHexString()}`;
  g.fillRect(0, 0, 256, 256);
  const light = base.clone().lerp(new THREE.Color(0xffffff), 0.4);
  const dark = base.clone().multiplyScalar(0.7);
  const rng = mulberry32(4242);
  for (let i = 0; i < 36; i++) {
    const col = i % 2 ? light : dark;
    g.strokeStyle = `rgba(${(col.r * 255) | 0},${(col.g * 255) | 0},${(col.b * 255) | 0},${i % 2 ? 0.35 : 0.22})`;
    g.lineWidth = 1.5 + rng() * 2.5;
    g.beginPath();
    const y0 = rng() * 256, amp = 3 + rng() * 6, ph = rng() * 6.28, wl = 40 + rng() * 70;
    for (let x = -8; x <= 264; x += 8) {
      const y = y0 + Math.sin((x / wl) * 6.28 + ph) * amp;
      if (x === -8) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2.5, 2.5);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let envGroup = null;
let currentTheme = THEMES.forest;
let currentThemeName = null;

function buildEnvironment(name) {
  if (name === currentThemeName) return; // même monde : rien à reconstruire
  currentThemeName = name;
  const t = THEMES[name] || THEMES.forest;
  currentTheme = t;
  if (envGroup) { scene.remove(envGroup); disposeGroup(envGroup); }
  envGroup = new THREE.Group();
  const rng = mulberry32(777);

  scene.background = new THREE.Color(t.fog[0]);
  scene.fog = new THREE.Fog(t.fog[0], t.fog[1], t.fog[2]);
  hemiLight.color.setHex(t.hemi[0]);
  hemiLight.groundColor.setHex(t.hemi[1]);
  hemiLight.intensity = t.hemi[2];
  sun.color.setHex(t.sun[0]);
  sun.intensity = t.sun[1];
  ambLight.color.setHex(t.amb[0]);
  ambLight.intensity = t.amb[1];

  // Dôme de ciel en dégradé
  const cv = document.createElement("canvas");
  cv.width = 4; cv.height = 256;
  const c2 = cv.getContext("2d");
  const grad = c2.createLinearGradient(0, 0, 0, 256);
  for (const [p, col] of t.sky) grad.addColorStop(p, col);
  c2.fillStyle = grad;
  c2.fillRect(0, 0, 4, 256);
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1900, 32, 16),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), side: THREE.BackSide, fog: false, depthWrite: false })
  );
  sky.renderOrder = -1;
  envGroup.add(sky);

  // Mares / lacs / îlots / lave / cratères… (positions d'abord : le relief
  // s'aplatit autour de chacune), avec texture de vaguelettes animée
  const terrainCfg = TERRAIN[name] || TERRAIN.forest;
  terrainAmp = terrainCfg.a;
  terrainDune = terrainCfg.d;
  const pools = [];
  waterTex = null;
  if (t.pools) {
    waterTex = makeWaterTexture(t.pools.c);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff, map: waterTex,
      roughness: t.pools.rough, metalness: t.pools.metal,
      emissive: t.pools.emissive || 0x000000, emissiveIntensity: t.pools.ei || 0,
    });
    const geo = new THREE.CircleGeometry(1, 36);
    let guard = 0;
    while (pools.length < t.pools.n && guard++ < 250) {
      const a = rng() * Math.PI * 2, d = 90 + rng() * 650;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const rx = 18 + rng() * 45, rz = 14 + rng() * 40;
      if (Math.hypot(x, z) < Math.max(rx, rz) + 45) continue;
      pools.push({ x, z, rx, rz });
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.06, z);
      m.scale.set(rx, rz, 1);
      envGroup.add(m);
    }
  }
  terrainSpots = pools.map((p) => ({ x: p.x, z: p.z, r: Math.max(p.rx, p.rz) }));

  // Sol vallonné : dunes et collines, crêtes légèrement éclaircies
  {
    const geo = new THREE.PlaneGeometry(3400, 3400, 128, 128);
    geo.rotateX(-Math.PI / 2);
    const pa = geo.getAttribute("position");
    const colors = new Float32Array(pa.count * 3);
    const base = new THREE.Color(t.ground.c);
    const crest = base.clone().lerp(new THREE.Color(0xffffff), 0.22);
    const cc = new THREE.Color();
    const maxAmp = Math.max(1, terrainAmp + terrainDune);
    for (let v = 0; v < pa.count; v++) {
      const h = terrainH(pa.getX(v), pa.getZ(v));
      pa.setY(v, h);
      cc.lerpColors(base, crest, Math.min(h / maxAmp, 1) * 0.95);
      colors[v * 3] = cc.r;
      colors[v * 3 + 1] = cc.g;
      colors[v * 3 + 2] = cc.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: t.ground.rough, metalness: t.ground.metal,
    }));
    envGroup.add(ground);
  }

  if (t.flora) buildFlora(t.flora, rng, pools, envGroup);

  // Collines / mesas / dômes à l'horizon
  for (let i = 0; i < t.hills.n; i++) {
    const a = (i / t.hills.n) * Math.PI * 2 + rng() * 0.4;
    const d = 850 + rng() * 500;
    const r = 140 + rng() * 220, h = 70 + rng() * 130;
    let geo;
    if (t.hills.shape === "mesa") geo = new THREE.CylinderGeometry(r * 0.55, r, h, 8);
    else if (t.hills.shape === "dome") geo = new THREE.SphereGeometry(r, 10, 8);
    else geo = new THREE.ConeGeometry(r, h, 7);
    const hill = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(t.hills.hsl[0] + rng() * 0.05, t.hills.hsl[1], t.hills.hsl[2] + rng() * 0.08),
      roughness: 1, flatShading: true,
    }));
    if (t.hills.shape === "dome") {
      hill.scale.y = h / r;
      hill.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
    } else {
      hill.position.set(Math.cos(a) * d, h / 2 - 2, Math.sin(a) * d);
    }
    envGroup.add(hill);
  }

  // Étoiles, lune, planète annelée, particules d'ambiance
  if (t.stars) {
    const n = 1400, posArr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = rng() * 2 - 1, ph = rng() * Math.PI * 2, r = 1500 + rng() * 300;
      const s = Math.sqrt(1 - u * u);
      posArr[i * 3] = r * s * Math.cos(ph);
      posArr[i * 3 + 1] = Math.abs(r * u) * 0.95 + 30;
      posArr[i * 3 + 2] = r * s * Math.sin(ph);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
    envGroup.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xcfd8ff, size: 2, sizeAttenuation: false, fog: false })));
  }
  if (t.moon) {
    const moon = new THREE.Mesh(new THREE.SphereGeometry(28, 20, 14), new THREE.MeshBasicMaterial({ color: 0xf0ead0, fog: false }));
    moon.position.set(500, 420, -700);
    envGroup.add(moon);
  }
  if (t.planet) {
    const planet = new THREE.Mesh(new THREE.SphereGeometry(110, 24, 16), new THREE.MeshBasicMaterial({ color: 0xc4785a, fog: false }));
    planet.position.set(-600, 430, -850);
    envGroup.add(planet);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(180, 9, 8, 40), new THREE.MeshBasicMaterial({ color: 0xd8c9a8, fog: false }));
    ring.position.copy(planet.position);
    ring.rotation.x = 1.9;
    ring.rotation.y = 0.4;
    envGroup.add(ring);
  }
  if (t.eclipse) {
    // Soleil noir à couronne de feu, suspendu dans le ciel
    const g = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CircleGeometry(48, 40), new THREE.MeshBasicMaterial({ color: 0x000000, fog: false }));
    disc.position.z = 2;
    g.add(disc);
    const corona = new THREE.Mesh(new THREE.TorusGeometry(50, 7, 12, 48),
      new THREE.MeshBasicMaterial({ color: 0xffd9a8, fog: false }));
    g.add(corona);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(56, 14, 12, 48),
      new THREE.MeshBasicMaterial({ color: 0xff7a3a, fog: false, transparent: true, opacity: 0.35 }));
    g.add(halo);
    g.position.set(380, 430, -820);
    g.lookAt(0, 40, 0);
    envGroup.add(g);
  }
  if (t.particles) {
    const n = t.particles.n, posArr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2, d = 20 + rng() * 500;
      posArr[i * 3] = Math.cos(a) * d;
      posArr[i * 3 + 1] = 1.5 + rng() * t.particles.h;
      posArr[i * 3 + 2] = Math.sin(a) * d;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
    envGroup.add(new THREE.Points(g, new THREE.PointsMaterial({
      color: t.particles.c, size: 0.7, sizeAttenuation: true, transparent: true, opacity: 0.85,
    })));
  }

  scene.add(envGroup);
}

// Flore instanciée : chaque thème a la sienne (décorative, sans collision).
// Un « pied » (tronc, tige, pilier…) + une « tête » (feuillage, chapeau…).
function buildFlora(spec, rng, pools, parent) {
  const spots = [];
  let tries = 0;
  while (spots.length < spec.n && tries < spec.n * 15) {
    tries++;
    let x, z;
    if (spec.onPools && pools.length) {
      // Flore plantée SUR les îlots (thème océan)
      const p = pools[Math.floor(rng() * pools.length)];
      const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * 0.7;
      x = p.x + Math.cos(a) * rr * p.rx;
      z = p.z + Math.sin(a) * rr * p.rz;
    } else {
      const a = rng() * Math.PI * 2, d = 35 + Math.pow(rng(), 0.75) * 800;
      x = Math.cos(a) * d;
      z = Math.sin(a) * d;
      if (pools.some((l) => ((x - l.x) / (l.rx + 4)) ** 2 + ((z - l.z) / (l.rz + 4)) ** 2 < 1)) continue;
    }
    spots.push({ x, z, s: 0.8 + rng() * 1.2, h: rng(), t: terrainH(x, z) });
  }

  const stdMat = (c, rough = 0.9) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, flatShading: true });
  let geoA, matA, yA, geoB, matB, yB, sclB = null, colorFn = null;
  switch (spec.type) {
    case "frostpine": // sapins givrés
      geoA = new THREE.CylinderGeometry(0.22, 0.34, 2.4, 6); matA = stdMat(0x5a4a42); yA = 1.2;
      geoB = new THREE.ConeGeometry(1.8, 4.6, 8); matB = stdMat(0xffffff); yB = 4.0;
      colorFn = (h, c) => c.setHSL(0.55, 0.18, 0.72 + h * 0.18);
      break;
    case "nightpine": // sapins nocturnes
      geoA = new THREE.CylinderGeometry(0.22, 0.34, 2.4, 6); matA = stdMat(0x241c18); yA = 1.2;
      geoB = new THREE.ConeGeometry(1.8, 4.6, 8); matB = stdMat(0xffffff); yB = 4.0;
      colorFn = (h, c) => c.setHSL(0.35 + h * 0.05, 0.35, 0.1 + h * 0.08);
      break;
    case "cactus":
      geoA = new THREE.CylinderGeometry(0.42, 0.55, 3.4, 8); matA = stdMat(0x3f8a44); yA = 1.7;
      geoB = new THREE.SphereGeometry(0.52, 10, 8); matB = stdMat(0x3f8a44); yB = 3.5;
      break;
    case "palm":
      geoA = new THREE.CylinderGeometry(0.16, 0.3, 4.4, 6); matA = stdMat(0x9a7a4e); yA = 2.2;
      geoB = new THREE.IcosahedronGeometry(1.6, 0); matB = stdMat(0xffffff); yB = 4.6;
      sclB = [1.7, 0.5, 1.7];
      colorFn = (h, c) => c.setHSL(0.3 + h * 0.06, 0.55, 0.3 + h * 0.12);
      break;
    case "mushroom": // champignons luminescents
      geoA = new THREE.CylinderGeometry(0.32, 0.48, 2.2, 7); matA = stdMat(0xd8cfe0, 0.6); yA = 1.1;
      geoB = new THREE.SphereGeometry(1.5, 10, 8); yB = 2.3;
      sclB = [1, 0.55, 1];
      matB = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x7a3fbf, emissiveIntensity: 0.5, roughness: 0.4, flatShading: true });
      colorFn = (h, c) => c.setHSL(0.72 + h * 0.16, 0.7, 0.55);
      break;
    case "deadtree": // arbres morts
      geoA = new THREE.CylinderGeometry(0.16, 0.3, 3.4, 5); matA = stdMat(0x3f342a); yA = 1.7;
      geoB = new THREE.TetrahedronGeometry(1.25, 0); matB = stdMat(0x2e2620); yB = 3.8;
      break;
    case "charspike": // pics de basalte à cœur incandescent
      geoA = new THREE.ConeGeometry(1.1, 3.4, 5); matA = stdMat(0x1f1a18); yA = 1.7;
      geoB = new THREE.SphereGeometry(0.28, 8, 6); yB = 3.4;
      matB = new THREE.MeshStandardMaterial({ color: 0xff5522, emissive: 0xff4400, emissiveIntensity: 0.9, roughness: 0.5 });
      break;
    case "candy": // sucettes géantes
      geoA = new THREE.CylinderGeometry(0.15, 0.15, 2.6, 6); matA = stdMat(0xf2eef0, 0.4); yA = 1.3;
      geoB = new THREE.SphereGeometry(1.15, 12, 10); yB = 3.2;
      matB = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.15, flatShading: true });
      colorFn = (h, c) => c.setHSL(h, 0.75, 0.62);
      break;
    case "spire": // flèches aliens à balise lumineuse
      geoA = new THREE.ConeGeometry(1.0, 8.5, 5); matA = stdMat(0x3a3f4a, 0.6); yA = 4.25;
      geoB = new THREE.SphereGeometry(0.32, 8, 6); yB = 8.7;
      matB = new THREE.MeshStandardMaterial({ color: 0x8affee, emissive: 0x44ddcc, emissiveIntensity: 1.0, roughness: 0.3 });
      break;
    default: // pine — sapins classiques
      geoA = new THREE.CylinderGeometry(0.22, 0.34, 2.4, 6); matA = stdMat(0x7a5230, 0.95); yA = 1.2;
      geoB = new THREE.ConeGeometry(1.8, 4.6, 8); matB = stdMat(0xffffff); yB = 4.0;
      colorFn = (h, c) => c.setHSL(0.29 + h * 0.07, 0.5, 0.26 + h * 0.14);
  }

  const A = new THREE.InstancedMesh(geoA, matA, spots.length);
  const B = new THREE.InstancedMesh(geoB, matB, spots.length);
  const m4 = new THREE.Matrix4(), q0 = new THREE.Quaternion(),
        v3 = new THREE.Vector3(), s3 = new THREE.Vector3(), col = new THREE.Color();
  spots.forEach((p, i) => {
    s3.setScalar(p.s);
    m4.compose(v3.set(p.x, yA * p.s + p.t, p.z), q0, s3);
    A.setMatrixAt(i, m4);
    if (sclB) s3.set(p.s * sclB[0], p.s * sclB[1], p.s * sclB[2]);
    m4.compose(v3.set(p.x, yB * p.s + p.t, p.z), q0, s3);
    B.setMatrixAt(i, m4);
    if (colorFn) { colorFn(p.h, col); B.setColorAt(i, col); }
  });
  parent.add(A, B);
}

/* ------------- Secrets cachés (positions fixes, tous thèmes) ------------ */
{
  // Un canard géant, quelque part au sol… (chut !)
  const duck = new THREE.Group();
  const yellow = new THREE.MeshStandardMaterial({ color: 0xffd83d, roughness: 0.6 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xff8c1a, roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(2.2, 14, 12), yellow);
  body.scale.set(1.3, 0.95, 1);
  duck.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(1.25, 12, 10), yellow);
  head.position.set(1.9, 2.1, 0);
  duck.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.1, 10), orange);
  beak.rotation.z = -Math.PI / 2;
  beak.position.set(3.2, 2, 0);
  duck.add(beak);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x14141c });
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), eyeMat);
    eye.position.set(2.7, 2.5, s * 0.55);
    duck.add(eye);
  }
  duck.position.set(140, 1.1, -95);
  duck.rotation.y = 2.4;
  scene.add(duck);
  eggObjects.duck = duck;

  // Un monolithe noir, seul au milieu de nulle part
  const monolith = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 6.8, 3.1),
    new THREE.MeshStandardMaterial({ color: 0x0a0a10, roughness: 0.15, metalness: 0.9 })
  );
  monolith.position.set(-180, 3.4, 120);
  monolith.rotation.y = 0.6;
  scene.add(monolith);
  eggObjects.monolith = monolith;

  // Une soucoupe posée discrètement
  const ufo = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x9aa7b8, metalness: 0.85, roughness: 0.3 });
  const hull = new THREE.Mesh(new THREE.SphereGeometry(3.2, 18, 10), hullMat);
  hull.scale.set(1, 0.32, 1);
  ufo.add(hull);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1.3, 14, 10),
    new THREE.MeshStandardMaterial({ color: 0x9fe3ff, emissive: 0x3fa8d8, emissiveIntensity: 0.5, roughness: 0.1 })
  );
  dome.scale.set(1, 0.75, 1);
  dome.position.y = 0.8;
  ufo.add(dome);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe28a });
  for (let k = 0; k < 6; k++) {
    const a2 = (k / 6) * Math.PI * 2;
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), lampMat);
    lamp.position.set(Math.cos(a2) * 2.4, -0.15, Math.sin(a2) * 2.4);
    ufo.add(lamp);
  }
  ufo.position.set(200, 1.6, -160);
  scene.add(ufo);
  eggObjects.ufo = ufo;
}

/* --------------------------- Plateforme -------------------------------- */

let platformGroup = null;
let platformBeam = null;
let platformLight = null;

// Balise de la plateforme : ambre tant que la pièce n'est pas ramassée,
// verte quand l'atterrissage est autorisé.
function setBeacon(armed) {
  const c = armed ? 0x6fe08a : 0xffb84a;
  if (platformBeam) platformBeam.material.color.setHex(c);
  if (platformLight) platformLight.color.setHex(c);
}

function buildPlatform(radius) {
  if (platformGroup) { scene.remove(platformGroup); disposeGroup(platformGroup); }
  const g = new THREE.Group();

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius + 0.8, PLATFORM_TOP, 48),
    new THREE.MeshStandardMaterial({ color: 0x55607a, roughness: 0.5, metalness: 0.4 })
  );
  base.position.y = PLATFORM_TOP / 2;
  g.add(base);

  const pad = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.97, 48),
    new THREE.MeshBasicMaterial({ color: 0x232b47 })
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = PLATFORM_TOP + 0.01;
  g.add(pad);

  for (const [rr, color] of [[0.9, 0x3dbf6e], [0.55, 0x3dbf6e], [0.18, 0xffd24a]]) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius * rr - 0.35, radius * rr, 48),
      new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = PLATFORM_TOP + 0.02;
    g.add(ring);
  }

  // Colonne lumineuse de balisage
  platformBeam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 0.6, 90, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffb84a, transparent: true, opacity: 0.13, depthWrite: false })
  );
  platformBeam.position.y = 45 + PLATFORM_TOP;
  g.add(platformBeam);

  platformLight = new THREE.PointLight(0xffb84a, 30, 60);
  platformLight.position.y = PLATFORM_TOP + 4;
  g.add(platformLight);

  scene.add(g);
  platformGroup = g;
}

/* ----------------------------- Fusée ----------------------------------- */

const rocketMesh = new THREE.Group();
{
  const white = new THREE.MeshStandardMaterial({ color: 0xe9ecf2, roughness: 0.35, metalness: 0.15 });
  const red = new THREE.MeshStandardMaterial({ color: 0xd6452e, roughness: 0.4 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2c2f38, roughness: 0.6, metalness: 0.6 });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 4, 20), white);
  rocketMesh.add(body);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.6, 20), red);
  nose.position.y = 2.8;
  rocketMesh.add(nose);

  const finGeo = new THREE.BoxGeometry(0.14, 1.5, 1.1);
  for (let i = 0; i < 4; i++) {
    const fin = new THREE.Mesh(finGeo, red);
    const a = (i / 4) * Math.PI * 2;
    fin.position.set(Math.cos(a) * 0.95, -1.6, Math.sin(a) * 0.95);
    fin.rotation.y = -a + Math.PI / 2;
    rocketMesh.add(fin);
  }

  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.65, 0.9, 20), dark);
  nozzle.position.y = -2.35;
  rocketMesh.add(nozzle);
}

// Trains d'atterrissage : 4 jambes cachées à l'intérieur du fuselage. À
// l'approche de la cible, elles coulissent hors du bas de la fusée (phase 1)
// puis s'écartent en position d'atterrissage (phase 2).
const legPivots = [];
const FEET_LOCAL = []; // position des pieds (repère fusée), trains déployés
{
  const legMat = new THREE.MeshStandardMaterial({ color: 0x2c2f38, roughness: 0.5, metalness: 0.6 });
  const strutGeo = new THREE.CylinderGeometry(0.07, 0.09, LEG_LEN, 8);
  const footGeo = new THREE.CylinderGeometry(0.26, 0.3, 0.14, 10);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const pivot = new THREE.Group();
    pivot.position.set(Math.cos(a) * LEG_PIVOT_R, LEG_HIDE_Y, Math.sin(a) * LEG_PIVOT_R);
    pivot.rotation.y = -a; // le X local du pivot pointe vers l'extérieur
    const strut = new THREE.Mesh(strutGeo, legMat);
    strut.position.y = -LEG_LEN / 2;
    pivot.add(strut);
    const foot = new THREE.Mesh(footGeo, legMat);
    foot.position.y = -LEG_LEN;
    pivot.add(foot);
    rocketMesh.add(pivot);
    legPivots.push(pivot);

    FEET_LOCAL.push(new THREE.Vector3(
      (LEG_PIVOT_R + LEG_LEN * Math.sin(LEG_ANGLE)) * Math.cos(a),
      LEG_PIVOT_Y - LEG_LEN * Math.cos(LEG_ANGLE),
      (LEG_PIVOT_R + LEG_LEN * Math.sin(LEG_ANGLE)) * Math.sin(a)
    ));
  }
}

// Anime les trains : coulissement vers le bas puis ouverture.
function setLegPose(deploy) {
  const slide = Math.min(1, deploy / 0.45);
  const swing = Math.max(0, (deploy - 0.45) / 0.55);
  for (const p of legPivots) {
    p.position.y = LEG_HIDE_Y + (LEG_PIVOT_Y - LEG_HIDE_Y) * slide;
    p.rotation.z = LEG_ANGLE * swing;
  }
}

// Flamme du moteur
const flame = new THREE.Mesh(
  new THREE.ConeGeometry(0.55, 2.6, 14),
  new THREE.MeshBasicMaterial({ color: 0xff9a3d, transparent: true, opacity: 0.92, blending: THREE.AdditiveBlending, depthWrite: false })
);
flame.rotation.x = Math.PI;
flame.position.y = -3.7;
flame.visible = false;
rocketMesh.add(flame);

const flameCore = new THREE.Mesh(
  new THREE.ConeGeometry(0.28, 1.6, 12),
  new THREE.MeshBasicMaterial({ color: 0x9ecbff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false })
);
flameCore.rotation.x = Math.PI;
flameCore.position.y = -3.2;
flameCore.visible = false;
rocketMesh.add(flameCore);

const flameLight = new THREE.PointLight(0xff9a3d, 0, 30);
flameLight.position.y = -3.5;
rocketMesh.add(flameLight);

scene.add(rocketMesh);

/* --------------------------- Astéroïdes -------------------------------- */

const asteroidGroup = new THREE.Group();
scene.add(asteroidGroup);
let colliders = []; // { center: Vector3, r: number, kind: string }

const OBSTACLE_LABEL = {
  rock: "un rocher", box: "un bloc", crystal: "un cristal",
  ring: "un anneau de pierre", column: "un pilier rocheux",
};

function buildObstacleField(cfg) {
  disposeGroup(asteroidGroup);
  asteroidGroup.clear();
  colliders = [];

  const list = buildObstacles(cfg);
  const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _c = new THREE.Vector3();

  list.forEach((o, i) => {
    let mesh;
    let yOff = 0;
    // Les obstacles flottants sont soulevés au-dessus des dunes : rien
    // ne doit rester enterré (et donc invisible) dans le relief.
    if (o.kind !== "column") {
      const minY = terrainH(o.pos[0], o.pos[2]) + o.size + 3;
      if (o.pos[1] < minY) yOff = minY - o.pos[1];
    }
    const center = new THREE.Vector3(o.pos[0], o.pos[1] + yOff, o.pos[2]);

    if (o.kind === "box") {
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(o.size * 1.6, o.size * 1.1, o.size * 1.3),
        rockMaterial(o.hue, true)
      );
      colliders.push({ center, r: o.size * 0.95, kind: o.kind });

    } else if (o.kind === "crystal") {
      // Cristal : octaèdre étiré, légèrement lumineux, + deux éclats
      const c = new THREE.Color().setHSL(0.5 + o.hue * 0.28, 0.6, 0.55);
      const mat = new THREE.MeshStandardMaterial({
        color: c, emissive: c, emissiveIntensity: 0.35,
        roughness: 0.25, metalness: 0.1, flatShading: true,
      });
      mesh = new THREE.Mesh(new THREE.OctahedronGeometry(o.size, 0), mat);
      mesh.scale.y = 1.6;
      for (const [dx, dz, s] of [[0.7, 0.35, 0.45], [-0.55, -0.5, 0.35]]) {
        const shard = new THREE.Mesh(new THREE.OctahedronGeometry(o.size * s, 0), mat);
        shard.position.set(o.size * dx, -o.size * 0.4, o.size * dz);
        shard.rotation.set(0.4, 1.2, 0.3);
        mesh.add(shard);
      }
      colliders.push({ center, r: o.size * 1.35, kind: o.kind });

    } else if (o.kind === "ring") {
      // Anneau de pierre : on peut passer par le trou ! La collision est
      // modélisée par 10 sphères le long du tore.
      const minor = o.size * 0.3;
      mesh = new THREE.Mesh(new THREE.TorusGeometry(o.size, minor, 8, 22), rockMaterial(o.hue, false));
      _e.set(...o.rot);
      _q.setFromEuler(_e);
      for (let k = 0; k < 10; k++) {
        const th = (k / 10) * Math.PI * 2;
        _c.set(Math.cos(th) * o.size, Math.sin(th) * o.size, 0).applyQuaternion(_q);
        colliders.push({ center: _c.clone().add(center), r: minor * 1.4, kind: o.kind });
      }

    } else if (o.kind === "column") {
      // Pilier rocheux ancré au sol (il suit le relief) : sphères empilées
      const th = terrainH(o.pos[0], o.pos[2]);
      yOff = th;
      mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(o.size * 0.65, o.size * 1.05, o.h, 9),
        rockMaterial(o.hue, false)
      );
      const n = Math.max(2, Math.ceil(o.h / (o.size * 1.6)));
      for (let k = 0; k < n; k++) {
        colliders.push({
          center: new THREE.Vector3(o.pos[0], th + ((k + 0.5) / n) * o.h, o.pos[2]),
          r: o.size * 1.05, kind: o.kind,
        });
      }

    } else { // rock
      const geo = new THREE.IcosahedronGeometry(o.size, 1);
      // Déformation aléatoire des sommets pour un aspect rocheux
      const rng = mulberry32(cfg.seed * 977 + i);
      const p = geo.getAttribute("position");
      for (let v = 0; v < p.count; v++) {
        const k = 1 + (rng() - 0.5) * 0.45;
        p.setXYZ(v, p.getX(v) * k, p.getY(v) * k, p.getZ(v) * k);
      }
      geo.computeVertexNormals();
      mesh = new THREE.Mesh(geo, rockMaterial(o.hue, false));
      colliders.push({ center, r: o.size * 1.15, kind: o.kind });
    }

    mesh.position.set(o.pos[0], o.pos[1] + yOff, o.pos[2]);
    mesh.rotation.set(...o.rot);
    asteroidGroup.add(mesh);
  });
}

function rockMaterial(hue, isBox) {
  // La teinte des roches suit le thème du niveau : [h, Δh, s, Δs, l, Δl]
  const r = currentTheme.rock;
  const c = new THREE.Color().setHSL((r[0] + hue * r[1]) % 1, r[2] + hue * r[3], r[4] + hue * r[5]);
  return new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, flatShading: true, metalness: isBox ? 0.25 : 0 });
}

function disposeGroup(g) {
  g.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
      if (m.map) m.map.dispose();
      m.dispose();
    });
  });
}

/* ----------------------------- Débris ---------------------------------- */

const debris = [];
const debrisGeo = new THREE.TetrahedronGeometry(0.45);
const debrisMats = [0xe9ecf2, 0xd6452e, 0x2c2f38, 0xff9a3d].map(
  (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, flatShading: true })
);
// Confettis de fête (pièce ramassée, secrets découverts)
const confettiMats = [0xff5252, 0xffd24a, 0x6fe08a, 0x4a7dff, 0xff8ae2].map(
  (c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.4, roughness: 0.5, flatShading: true })
);
let flashLight = null;

function spawnDebris(at, mats = debrisMats, flash = true) {
  for (let i = 0; i < 32; i++) {
    const m = new THREE.Mesh(debrisGeo, mats[i % mats.length]);
    m.position.copy(at);
    const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5)
      .normalize().multiplyScalar(6 + Math.random() * 14);
    debris.push({ mesh: m, vel: v, spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8), life: 2.5 });
    scene.add(m);
  }
  if (!flash) return;
  flashLight = new THREE.PointLight(0xffa040, 400, 120);
  flashLight.position.copy(at);
  scene.add(flashLight);
}

function updateDebris(dt) {
  for (let i = debris.length - 1; i >= 0; i--) {
    const d = debris[i];
    d.life -= dt;
    d.vel.y -= 9.81 * 0.7 * dt;
    d.mesh.position.addScaledVector(d.vel, dt);
    const gy = surfaceYAt(d.mesh.position.x, d.mesh.position.z) + 0.3;
    if (d.mesh.position.y < gy) { d.mesh.position.y = gy; d.vel.y *= -0.35; d.vel.multiplyScalar(0.8); }
    d.mesh.rotation.x += d.spin.x * dt;
    d.mesh.rotation.y += d.spin.y * dt;
    if (d.life < 0.6) d.mesh.scale.setScalar(Math.max(d.life / 0.6, 0.01));
    if (d.life <= 0) { scene.remove(d.mesh); debris.splice(i, 1); }
  }
  if (flashLight) {
    flashLight.intensity *= Math.exp(-6 * dt);
    if (flashLight.intensity < 1) { scene.remove(flashLight); flashLight = null; }
  }
}

function clearDebris() {
  debris.forEach((d) => scene.remove(d.mesh));
  debris.length = 0;
  if (flashLight) { scene.remove(flashLight); flashLight = null; }
}

/* ======================= Pièces à récupérer ============================= */
// Un niveau peut demander une ou plusieurs pièces (cfg.coin ou cfg.coins).
// Les trains d'atterrissage ne s'arment que lorsqu'elles sont TOUTES à bord.

let coinsState = [];    // { pos, group, spin, collected }
let piecesNeeded = 1;
let piecesGot = 0;
const coinPos = new THREE.Vector3(); // première pièce (debug/tests)

const allPieces = () => piecesGot >= piecesNeeded;

function buildCoins(cfg) {
  for (const c of coinsState) { scene.remove(c.group); disposeGroup(c.group); }
  coinsState = [];
  const list = cfg.coins || [cfg.coin];
  piecesNeeded = list.length;
  piecesGot = 0;

  for (const p of list) {
    const group = new THREE.Group();
    const gold = new THREE.MeshStandardMaterial({
      color: 0xffd24a, metalness: 0.85, roughness: 0.25,
      emissive: 0xaa7700, emissiveIntensity: 0.4,
    });
    const spin = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.35, 26), gold);
    disc.rotation.z = Math.PI / 2; // debout, comme une pièce
    spin.add(disc);
    spin.add(new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.22, 10, 26), gold));
    spin.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 0), gold));
    group.add(spin);

    // Balise dorée jusqu'au sol pour repérer la pièce de loin
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.45, 80, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.16, depthWrite: false })
    );
    beam.position.y = -p[1] + 40;
    group.add(beam);
    group.add(new THREE.PointLight(0xffd24a, 25, 35));

    group.position.set(...p);
    scene.add(group);
    coinsState.push({ pos: new THREE.Vector3(...p), group, spin, collected: false });
  }
  coinPos.copy(coinsState[0].pos);
}

function collectPiece(c) {
  c.collected = true;
  c.group.visible = false;
  piecesGot++;
  spawnDebris(c.pos, confettiMats, false);
  audioCoin();
  if (allPieces()) {
    setBeacon(true);
    showToast(piecesNeeded > 1
      ? "⭐ Toutes les pièces ! Trains armés — cap sur la plateforme."
      : "⭐ Pièce récupérée ! Trains d'atterrissage armés — cap sur la plateforme.");
  } else {
    showToast(`⭐ Pièce ${piecesGot}/${piecesNeeded} — encore ${piecesNeeded - piecesGot} !`);
  }
}

/* ====================== Toast & secrets cachés ========================== */

let toastTimer = 0;

function showToast(text) {
  const t = $("toast");
  t.textContent = text;
  t.classList.remove("hidden", "pop");
  void t.offsetWidth; // relance l'animation CSS
  t.classList.add("pop");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), 5000);
}

const EGGS = [
  { id: "canard", obj: () => eggObjects.duck, r: 13,
    msg: "🦆 COIN-COIN ! Le Canard Ancestral vous accorde sa bénédiction." },
  { id: "monolithe", obj: () => eggObjects.monolith, r: 13,
    msg: "🗿 Le Monolithe vibre doucement… « L'aube de l'humanité », murmure-t-il. ✨" },
  { id: "ovni", obj: () => eggObjects.ufo, r: 14,
    msg: "👽 Repérés ! Les visiteurs plient bagage — à bientôt, pilote." },
];
let eggsFound = new Set();
try { eggsFound = new Set(JSON.parse(localStorage.getItem("tpack-eggs") || "[]")); } catch { /* tant pis */ }
const eggsThisRun = new Set();
const eggAnims = []; // { type, obj, t }

function checkEggs() {
  for (const egg of EGGS) {
    if (eggsThisRun.has(egg.id)) continue;
    const obj = egg.obj();
    if (!obj || pos.distanceToSquared(obj.position) > egg.r * egg.r) continue;
    eggsThisRun.add(egg.id);
    showToast(egg.msg);
    audioEgg();
    spawnDebris(obj.position.clone().add(new THREE.Vector3(0, 3, 0)), confettiMats, false);
    eggAnims.push({ type: egg.id, obj, t: 0, baseY: obj.position.y });
    if (!eggsFound.has(egg.id)) {
      eggsFound.add(egg.id);
      localStorage.setItem("tpack-eggs", JSON.stringify([...eggsFound]));
    }
  }
}

// Petites animations de célébration des secrets
function updateEggAnims(dt) {
  for (let i = eggAnims.length - 1; i >= 0; i--) {
    const a = eggAnims[i];
    a.t += dt;
    if (a.type === "canard") {
      a.obj.rotation.y += 7 * dt;
      a.obj.position.y = a.baseY + Math.abs(Math.sin(a.t * 6)) * 1.4;
      if (a.t > 2.6) { a.obj.position.y = a.baseY; eggAnims.splice(i, 1); }
    } else if (a.type === "ovni") {
      a.obj.rotation.y += 6 * dt;
      a.obj.position.y += (6 + a.t * 22) * dt;
      a.obj.position.x += a.t * 14 * dt;
      if (a.t > 5) { a.obj.visible = false; eggAnims.splice(i, 1); }
    } else if (a.type === "monolithe") {
      const s = 1 + Math.sin(Math.min(a.t, 2) * Math.PI) * 0.08;
      a.obj.scale.set(s, s, s);
      a.obj.rotation.y += 0.4 * dt;
      if (a.t > 2) { a.obj.scale.set(1, 1, 1); eggAnims.splice(i, 1); }
    } else {
      eggAnims.splice(i, 1);
    }
  }
}

/* ============================== Audio =================================== */

let AC = null, thrustGain = null, thrustFilter = null;

function ensureAudio() {
  if (AC) { AC.resume?.(); return; }
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    const len = AC.sampleRate;
    const buf = AC.createBuffer(1, len, AC.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = AC.createBufferSource();
    src.buffer = buf; src.loop = true;
    thrustFilter = AC.createBiquadFilter();
    thrustFilter.type = "lowpass"; thrustFilter.frequency.value = 300;
    thrustGain = AC.createGain(); thrustGain.gain.value = 0;
    src.connect(thrustFilter).connect(thrustGain).connect(AC.destination);
    src.start();
  } catch { AC = null; }
}

function audioThrust(level) {
  if (!AC || !thrustGain) return;
  thrustGain.gain.setTargetAtTime(level * 0.35, AC.currentTime, 0.06);
  thrustFilter.frequency.setTargetAtTime(250 + level * 900, AC.currentTime, 0.06);
}

function audioCrash() {
  if (!AC) return;
  const buf = AC.createBuffer(1, AC.sampleRate * 0.7, AC.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = AC.createBufferSource(); src.buffer = buf;
  const f = AC.createBiquadFilter(); f.type = "lowpass";
  f.frequency.setValueAtTime(1400, AC.currentTime);
  f.frequency.exponentialRampToValueAtTime(90, AC.currentTime + 0.65);
  const g = AC.createGain(); g.gain.value = 0.8;
  src.connect(f).connect(g).connect(AC.destination);
  src.start();
}

function audioSuccess() {
  if (!AC) return;
  [[660, 0], [880, 0.18]].forEach(([freq, at]) => {
    const o = AC.createOscillator(); o.type = "sine"; o.frequency.value = freq;
    const g = AC.createGain();
    g.gain.setValueAtTime(0.25, AC.currentTime + at);
    g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + at + 0.35);
    o.connect(g).connect(AC.destination);
    o.start(AC.currentTime + at); o.stop(AC.currentTime + at + 0.4);
  });
}

function audioCoin() {
  if (!AC) return;
  [[988, 0], [1319, 0.09]].forEach(([freq, at]) => {
    const o = AC.createOscillator(); o.type = "triangle"; o.frequency.value = freq;
    const g = AC.createGain();
    g.gain.setValueAtTime(0.22, AC.currentTime + at);
    g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + at + 0.25);
    o.connect(g).connect(AC.destination);
    o.start(AC.currentTime + at); o.stop(AC.currentTime + at + 0.3);
  });
}

function audioEgg() {
  if (!AC) return;
  [523, 659, 784, 1047].forEach((freq, i) => {
    const at = i * 0.11;
    const o = AC.createOscillator(); o.type = "square"; o.frequency.value = freq;
    const g = AC.createGain();
    g.gain.setValueAtTime(0.12, AC.currentTime + at);
    g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + at + 0.28);
    o.connect(g).connect(AC.destination);
    o.start(AC.currentTime + at); o.stop(AC.currentTime + at + 0.3);
  });
}

/* ============================ État du jeu =============================== */

let state = "menu"; // menu | ready | flying | paused | landed | crashed
let levelIndex = 0;
let cfg = LEVELS[0];
let runId = 0;

const pos = new THREE.Vector3();
const vel = new THREE.Vector3();
const quat = new THREE.Quaternion();
const angVel = new THREE.Vector3();
let fuel = 0, throttle = 1, elapsed = 0;
let legsTriggered = false; // les trains ont reçu l'ordre de sortir
let legsDeploy = 0;        // 0 repliés → 1 déployés
let stableT = 0;           // temps d'immobilité sur la cible
let grassT = 0;            // temps d'immobilité hors cible
let feetOn = 0;            // pieds en contact avec la plateforme
let wasContact = false;    // un pied touchait déjà au pas précédent

let unlocked = parseInt(localStorage.getItem(STORAGE_KEY) || "1", 10);
if (!(unlocked >= 1 && unlocked <= LEVELS.length)) unlocked = Math.min(Math.max(unlocked, 1), LEVELS.length) || 1;

const input = { pitchUp: false, pitchDown: false, rollL: false, rollR: false, yawL: false, yawR: false, thrust: false };

/* --------------------------- Navigation -------------------------------- */

function showMenu() {
  state = "menu";
  menuEl.classList.remove("hidden");
  hudEl.classList.add("hidden");
  overlayEl.classList.add("hidden");
  rebuildLevelGrid();
  $("menu-eggs").textContent = eggsFound.size
    ? `🥚 Secrets découverts : ${eggsFound.size}/3`
    : "🥚 On raconte que 3 secrets se cachent quelque part dans la carte…";
}

function rebuildLevelGrid() {
  levelGrid.innerHTML = "";
  LEVELS.forEach((lv, i) => {
    const b = document.createElement("button");
    b.textContent = i + 1;
    b.title = lv.name;
    if (i + 1 > unlocked) b.disabled = true;
    if (i + 1 < unlocked) b.classList.add("done");
    b.addEventListener("click", () => startLevel(i));
    levelGrid.appendChild(b);
  });
}

function startLevel(i) {
  runId++;
  levelIndex = i;
  cfg = LEVELS[i];

  buildEnvironment(cfg.theme);
  buildPlatform(cfg.platformRadius);
  buildObstacleField(cfg);
  buildCoins(cfg);
  setBeacon(false);
  eggsThisRun.clear();
  clearDebris();

  pos.set(...cfg.spawn);
  vel.set(0, 0, 0);
  quat.identity();
  angVel.set(0, 0, 0);
  fuel = cfg.fuel;
  throttle = 1;
  elapsed = 0;
  legsTriggered = false;
  legsDeploy = 0;
  stableT = 0;
  grassT = 0;
  feetOn = 0;
  wasContact = false;
  setLegPose(0);
  rocketMesh.visible = true;
  rocketMesh.position.copy(pos);
  rocketMesh.quaternion.copy(quat);

  snapCamera();

  menuEl.classList.add("hidden");
  hudEl.classList.remove("hidden");
  $("hud-level").textContent = `Niveau ${i + 1}/${LEVELS.length}`;
  $("hud-name").textContent = cfg.name;
  $("hud-timer").classList.toggle("hidden", !cfg.timeLimit);

  state = "ready";
  const dist = Math.round(Math.hypot(cfg.spawn[0], cfg.spawn[2]));
  const coinTxt = piecesNeeded > 1
    ? `1) Récupérez les ${piecesNeeded} pièces ⭐ (balises dorées) : sans elles, les trains restent verrouillés.`
    : `1) Récupérez la pièce ⭐ (balise dorée, à ${Math.round(Math.hypot(cfg.coin[0], cfg.coin[2]))} m de la plateforme) : sans elle, les trains restent verrouillés.`;
  showOverlay(
    `Niveau ${i + 1} — ${cfg.name}`,
    `Plateforme à ${dist} m (rayon ${cfg.platformRadius} m). Carburant : ${cfg.fuel} unités.` +
      (cfg.gravity > 10 ? " ⚠️ Gravité renforcée !" : "") +
      (cfg.timeLimit ? `\n⏱ LIMITE DE TEMPS : ${cfg.timeLimit} secondes !` : "") +
      `\n${coinTxt}` +
      `\n2) Posez les 4 pieds sur la plateforme et restez stable ${STABLE_TIME} s — sans basculer !`,
    [["Décoller 🚀", beginFlight]]
  );
}

function beginFlight() {
  if (state !== "ready") return;
  ensureAudio();
  state = "flying";
  overlayEl.classList.add("hidden");
}

function showOverlay(title, text, buttons) {
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  overlayButtons.innerHTML = "";
  buttons.forEach(([label, fn], k) => {
    const b = document.createElement("button");
    b.textContent = label;
    if (k > 0) b.classList.add("secondary");
    b.addEventListener("click", fn);
    overlayButtons.appendChild(b);
  });
  overlayEl.classList.remove("hidden");
}

/* ------------------------- Fin de niveau ------------------------------- */

function landSuccess() {
  state = "landed";
  vel.set(0, 0, 0);
  angVel.set(0, 0, 0);
  audioThrust(0);
  audioSuccess();

  if (levelIndex + 2 > unlocked) {
    unlocked = Math.min(levelIndex + 2, LEVELS.length);
    localStorage.setItem(STORAGE_KEY, String(unlocked));
  }

  const stats = `Carburant restant : ${Math.round(fuel)} u · Temps : ${elapsed.toFixed(1)} s` +
    (cfg.timeLimit ? ` (${(cfg.timeLimit - elapsed).toFixed(1)} s d'avance !)` : "");
  if (levelIndex === LEVELS.length - 1) {
    showOverlay("🏆 Défi ultime accompli !", `${cfg.name} n'a pas résisté : les ${LEVELS.length} niveaux sont maîtrisés. Chapeau bas, pilote !\n${stats}`,
      [["Rejouer ce niveau", () => startLevel(levelIndex)], ["Menu", showMenu]]);
  } else {
    showOverlay("🎉 Atterrissage réussi !", stats, [
      ["Niveau suivant ▶", () => startLevel(levelIndex + 1)],
      ["Rejouer", () => startLevel(levelIndex)],
      ["Menu", showMenu],
    ]);
  }
}

function crash(reason, explode = true) {
  state = "crashed";
  audioThrust(0);
  flame.visible = flameCore.visible = false;
  flameLight.intensity = 0;
  if (explode) {
    audioCrash();
    rocketMesh.visible = false;
    spawnDebris(pos.clone());
  }

  const id = runId;
  setTimeout(() => {
    if (id !== runId || state !== "crashed") return;
    showOverlay(explode ? "💥 Crash !" : "❌ Raté !", reason, [
      ["Réessayer (R)", () => startLevel(levelIndex)],
      ["Menu", showMenu],
    ]);
  }, 1100);
}

/* ============================ Physique ================================== */

const UP = new THREE.Vector3(0, 1, 0);
const _axis = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _dq = new THREE.Quaternion();
const _up = new THREE.Vector3();
const _p = new THREE.Vector3();
const _foot = new THREE.Vector3();
const _r = new THREE.Vector3();
const _vp = new THREE.Vector3();
const _F = new THREE.Vector3();

// Hauteur du sol sous un point : plateau de la plateforme ou relief du terrain.
function surfaceYAt(x, z) {
  return Math.hypot(x, z) < cfg.platformRadius + 0.4 ? PLATFORM_TOP : terrainH(x, z);
}

function physicsStep(dt) {
  elapsed += dt;

  // --- Limite de temps (niveau extrême) ---
  if (cfg.timeLimit && elapsed >= cfg.timeLimit) {
    crash("⏱ Temps écoulé ! La fusée s'est autodétruite.");
    return;
  }

  // --- Rotation (commandes relatives à l'écran : « ↑ » incline toujours la
  // fusée vers le fond de l'écran, même quand la caméra tourne autour de la
  // plateforme — pas d'inversion des commandes) ---
  const pitch = (input.pitchUp ? -1 : 0) + (input.pitchDown ? 1 : 0);
  const roll = (input.rollR ? 1 : 0) + (input.rollL ? -1 : 0);
  const yaw = (input.yawL ? 1 : 0) + (input.yawR ? -1 : 0);

  if (pitch || roll) {
    _fwd.copy(camDir).negate();          // direction « fond de l'écran » (horizontale)
    _axis.crossVectors(_fwd, UP);        // direction « droite de l'écran »
    if (pitch) angVel.addScaledVector(_axis, pitch * ANG_ACCEL * dt);
    if (roll) angVel.addScaledVector(_fwd, roll * ANG_ACCEL * dt);
  }
  if (yaw) angVel.addScaledVector(UP, yaw * YAW_ACCEL * dt);

  // --- Trains d'atterrissage : ils ne s'arment qu'avec la pièce à bord,
  // sortent à l'approche de la cible et RENTRENT si on s'en éloigne
  // (impossible de se poser ailleurs que sur la plateforme) ---
  const hDistNow = Math.hypot(pos.x, pos.z);
  const altPad = pos.y - PLATFORM_TOP;
  if (!wasContact) {
    if (allPieces() && hDistNow < cfg.platformRadius + 25 && altPad < 45) legsTriggered = true;
    else if (!allPieces() || hDistNow > cfg.platformRadius + 35 || altPad > 55) legsTriggered = false;
  }
  const legStep = dt / LEG_DEPLOY_T;
  legsDeploy += THREE.MathUtils.clamp((legsTriggered ? 1 : 0) - legsDeploy, -legStep, legStep);
  setLegPose(legsDeploy);
  const legsOut = legsDeploy >= 0.95;

  // --- Poussée & carburant (au sol comme en vol : on peut se rattraper) ---
  const thrusting = input.thrust && fuel > 0;
  if (thrusting) fuel = Math.max(0, fuel - BURN_RATE * throttle * dt);

  // --- Intégration en sous-pas : les contacts pied/sol sont raides ---
  const vyBefore = vel.y;
  let newContact = false;
  let anyContact = false;
  const steps = Math.max(1, Math.ceil(dt / PHYS_H));
  const h = dt / steps;
  for (let s = 0; s < steps; s++) {
    if (thrusting) {
      _up.set(0, 1, 0).applyQuaternion(quat);
      vel.addScaledVector(_up, MAX_THRUST * throttle * h);
    }
    vel.y -= cfg.gravity * h;

    if (legsOut) {
      let touching = false;
      for (const fl of FEET_LOCAL) {
        _foot.copy(fl).applyQuaternion(quat).add(pos);
        const pen = surfaceYAt(_foot.x, _foot.z) - _foot.y;
        if (pen <= 0) continue;
        if (!wasContact) newContact = true;
        anyContact = true;
        touching = true;

        _r.copy(_foot).sub(pos);                    // bras de levier
        _vp.copy(angVel).cross(_r).add(vel);        // vitesse du point de contact
        // Force normale (ressort amorti, plafonnée), masse = 1
        let fn = CONTACT_K * Math.min(pen, 0.25) - CONTACT_C * _vp.y;
        fn = Math.max(0, Math.min(fn, 200));
        _F.set(0, fn, 0);
        // Frottement horizontal, plafonné par μ·Fn
        const vh = Math.hypot(_vp.x, _vp.z);
        if (vh > 1e-4) {
          const ff = Math.min(40 * vh, FRICTION * fn);
          _F.x -= (_vp.x / vh) * ff;
          _F.z -= (_vp.z / vh) * ff;
        }
        vel.addScaledVector(_F, h);
        _r.cross(_F);                               // couple = r × F
        angVel.addScaledVector(_r, h / INERTIA);
      }

      // Les trains stabilisent la fusée : couple de redressement (qui
      // s'estompe aux grandes inclinaisons — trop penché, elle bascule) et
      // amortissement des oscillations tant qu'un pied touche le sol.
      if (touching) {
        _up.set(0, 1, 0).applyQuaternion(quat);
        _axis.crossVectors(_up, UP); // |axe| = sin(inclinaison)
        const s = _axis.length();
        if (s > 1e-4 && _up.y > 0.2) {
          const tiltR = Math.asin(Math.min(s, 1));
          const falloff = THREE.MathUtils.clamp(1 - (tiltR - RIGHT_FADE[0]) / RIGHT_FADE[1], 0, 1);
          if (falloff > 0) angVel.addScaledVector(_axis.divideScalar(s), RIGHT_K * s * falloff * h);
        }
        angVel.multiplyScalar(Math.exp(-CONTACT_DAMP * h));
      }
    }

    angVel.multiplyScalar(Math.exp(-ANG_DAMP * h));
    pos.addScaledVector(vel, h);
    const w = angVel.length();
    if (w > 1e-6) {
      _dq.setFromAxisAngle(_axis.copy(angVel).divideScalar(w), w * h);
      quat.premultiply(_dq).normalize();
    }
  }
  wasContact = anyContact;

  audioThrust(thrusting ? throttle : 0);

  // --- Flamme ---
  flame.visible = flameCore.visible = thrusting;
  if (thrusting) {
    const flick = 0.85 + Math.random() * 0.3;
    flame.scale.set(1, throttle * flick, 1);
    flameCore.scale.set(1, throttle * flick, 1);
    flameLight.intensity = 60 * throttle;
  } else {
    flameLight.intensity = 0;
  }

  rocketMesh.position.copy(pos);
  rocketMesh.quaternion.copy(quat);

  // --- Premier contact trop violent : la structure casse ---
  if (newContact && vyBefore < -IMPACT_MAX) {
    crash(`Impact trop violent : ${(-vyBefore).toFixed(1)} m/s à la verticale (max ${IMPACT_MAX}).`);
    return;
  }

  checkCollisions();
  if (state !== "flying") return;

  // --- Pièces à récupérer & secrets cachés ---
  for (const c of coinsState) {
    if (!c.collected && pos.distanceToSquared(c.pos) < 5.5 * 5.5) collectPiece(c);
  }
  checkEggs();

  // --- Stabilisation : 4 pieds posés + immobilité pendant STABLE_TIME ---
  feetOn = 0;
  let onGrass = 0;
  if (legsOut) {
    for (const fl of FEET_LOCAL) {
      _foot.copy(fl).applyQuaternion(quat).add(pos);
      const hd = Math.hypot(_foot.x, _foot.z);
      if (_foot.y <= PLATFORM_TOP + 0.08 && hd <= cfg.platformRadius + 0.3) feetOn++;
      else if (_foot.y <= terrainH(_foot.x, _foot.z) + 0.08) onGrass++;
    }
  }
  const still = vel.length() < 0.4 && angVel.length() < 0.3;
  stableT = feetOn === 4 && still ? stableT + dt : 0;
  grassT = onGrass === 4 && still ? grassT + dt : 0;
  if (stableT >= STABLE_TIME) landSuccess();
  else if (grassT >= STABLE_TIME) {
    crash("La fusée s'est posée… mais hors de la plateforme. Visez la cible !", false);
  }
}

function tiltDeg() {
  _up.set(0, 1, 0).applyQuaternion(quat);
  return THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(_up.y, -1, 1)));
}

function checkCollisions() {
  // Astéroïdes : la fusée est testée en 3 points (nez, centre, queue)
  for (const c of colliders) {
    for (const ly of [3.4, 0, -2.4]) {
      _p.set(0, ly, 0).applyQuaternion(quat).add(pos);
      const rr = c.r + 1.0;
      if (_p.distanceToSquared(c.center) < rr * rr) {
        crash(`La fusée a percuté ${OBSTACLE_LABEL[c.kind] || "un obstacle"}.`);
        return;
      }
    }
  }

  // Corps de la fusée contre le sol ou la plateforme (nez, centre, moteur).
  // Les pieds, eux, sont gérés par les contacts physiques. Une fusée qui
  // penche n'explose que couchée (quasi horizontale) au contact du sol.
  const tilt = tiltDeg();
  for (const ly of [3.55, 0, -2.75]) {
    _p.set(0, ly, 0).applyQuaternion(quat).add(pos);
    const sy = surfaceYAt(_p.x, _p.z);
    if (_p.y < sy - 0.05) {
      if (ly < 0 && tilt <= BODY_TIP) continue; // la tuyère peut frôler le sol
      crash(tilt > BODY_TIP
        ? "La fusée s'est couchée… et a explosé !"
        : "Le nez de la fusée a heurté le sol.");
      return;
    }
    // Percuté le flanc de la plateforme
    if (sy === PLATFORM_TOP && _p.y < PLATFORM_TOP - 0.8) {
      crash("La fusée a percuté le flanc de la plateforme.");
      return;
    }
  }

  // Hors zone
  const hDist = Math.hypot(pos.x, pos.z);
  if (hDist > 1200 || pos.y > 800) crash("Fusée perdue — sortie de la zone de vol.");
}

/* ============================= Caméra =================================== */

const camDir = new THREE.Vector3(0, 0, 1);
const _camTarget = new THREE.Vector3();
const _desired = new THREE.Vector3();
let camZoom = 1; // molette / pavé tactile : 0.45 (près) … 2.5 (loin)

window.addEventListener("wheel", (e) => {
  if (state === "menu") return;
  e.preventDefault();
  camZoom = THREE.MathUtils.clamp(camZoom * Math.exp(e.deltaY * 0.0012), 0.45, 2.5);
}, { passive: false });

function updateCamera(dt, snap = false) {
  _desired.set(pos.x, 0, pos.z);
  if (_desired.lengthSq() > 1) _desired.normalize();
  else _desired.copy(camDir);

  // Directions quasi opposées : l'interpolation directe s'annulerait au
  // milieu — on contourne par le côté pour que la caméra pivote toujours.
  if (!snap && camDir.dot(_desired) < -0.7) {
    _desired.set(-camDir.z, 0, camDir.x).add(camDir.clone().multiplyScalar(0.3)).normalize();
  }

  if (snap) camDir.copy(_desired);
  else camDir.lerp(_desired, 1 - Math.exp(-1.6 * dt)).normalize();

  _camTarget.copy(pos).addScaledVector(camDir, 26 * camZoom);
  _camTarget.y = pos.y + 11 * camZoom;
  const camFloor = Math.max(3, terrainH(_camTarget.x, _camTarget.z) + 4);
  if (_camTarget.y < camFloor) _camTarget.y = camFloor;

  if (snap) camera.position.copy(_camTarget);
  else camera.position.lerp(_camTarget, 1 - Math.exp(-3.5 * dt));

  camera.lookAt(pos.x, pos.y + 2, pos.z);
}

function snapCamera() { updateCamera(0, true); }

/* =============================== HUD ==================================== */

function setStat(id, txt, good) {
  const el = $(id);
  el.textContent = txt;
  el.classList.toggle("ok", good === true);
  el.classList.toggle("bad", good === false);
}

function updateHUD() {
  const fuelPct = (fuel / cfg.fuel) * 100;
  const fill = $("fuel-fill");
  fill.style.width = `${fuelPct}%`;
  fill.classList.toggle("low", fuelPct < 25);
  $("fuel-txt").textContent = String(Math.round(fuel));

  $("throttle-fill").style.width = `${throttle * 100}%`;
  $("throttle-txt").textContent = `${Math.round(throttle * 100)} %`;

  const hDist = Math.hypot(pos.x, pos.z);
  const surface = hDist < cfg.platformRadius ? PLATFORM_TOP : terrainH(pos.x, pos.z);
  const bottom = legsDeploy > 0.5 ? -FEET_LOCAL[0].y : ROCKET_BOTTOM;
  const alt = Math.max(0, pos.y - bottom - surface);
  setStat("stat-alt", `${alt.toFixed(0)} m`);

  const vs = vel.y;
  setStat("stat-vs", `${vs >= 0 ? "+" : ""}${vs.toFixed(1)} m/s`, Math.abs(vs) <= HINT_V);

  const hs = Math.hypot(vel.x, vel.z);
  setStat("stat-hs", `${hs.toFixed(1)} m/s`, hs <= HINT_H);

  const tilt = tiltDeg();
  setStat("stat-tilt", `${Math.round(tilt)}°`, tilt <= HINT_TILT);

  setStat("stat-dist", `${Math.round(hDist)} m`);

  setStat("stat-legs", legsDeploy >= 0.95 ? "Sortis" : legsDeploy > 0.02 ? "Manœuvre…" : allPieces() ? "Repliés" : "Verrouillés 🔒",
    legsDeploy >= 0.95 ? true : undefined);

  setStat("stat-piece",
    piecesNeeded > 1 ? `${piecesGot} / ${piecesNeeded} ⭐` : allPieces() ? "Ramassée ✓" : "À récupérer ⭐",
    allPieces());

  // Chrono du niveau extrême
  if (cfg.timeLimit) {
    const left = Math.max(0, cfg.timeLimit - elapsed);
    const timer = $("hud-timer");
    timer.textContent = `⏱ ${left.toFixed(1)} s`;
    timer.classList.toggle("low", left < 15 && state === "flying");
  }

  // Compteur de stabilisation / avertissement pièces manquantes
  const stab = $("stab");
  if (state === "flying" && feetOn === 4) {
    stab.classList.remove("hidden", "warn");
    stab.textContent = stableT > 0
      ? `Stabilisation… ${Math.min(stableT, STABLE_TIME).toFixed(1)} / ${STABLE_TIME.toFixed(1)} s`
      : "Stabilisez la fusée !";
  } else if (state === "flying" && !allPieces() &&
             hDist < cfg.platformRadius + 25 && pos.y - PLATFORM_TOP < 45) {
    stab.classList.remove("hidden");
    stab.classList.add("warn");
    stab.textContent = piecesNeeded > 1
      ? `🔒 Trains verrouillés — il manque ${piecesNeeded - piecesGot} pièce(s) ⭐ !`
      : "🔒 Trains verrouillés — récupérez d'abord la pièce ⭐ !";
  } else {
    stab.classList.add("hidden");
  }
}

/* ============================= Entrées ================================== */

const KEYMAP = {
  ArrowUp: "pitchUp", ArrowDown: "pitchDown",
  ArrowLeft: "rollL", ArrowRight: "rollR",
  PageUp: "yawL", PageDown: "yawR",
  Space: "thrust",
};

window.addEventListener("keydown", (e) => {
  const action = KEYMAP[e.code];

  if (action) {
    e.preventDefault();
    input[action] = true;
    if (state === "ready") beginFlight();
    return;
  }

  if (e.key === "+" || e.key === "=" || e.code === "NumpadAdd") {
    throttle = Math.min(1, Math.round((throttle + 0.1) * 10) / 10);
  } else if (e.key === "-" || e.code === "NumpadSubtract") {
    throttle = Math.max(0.1, Math.round((throttle - 0.1) * 10) / 10);
  } else if (e.code === "KeyR") {
    if (state !== "menu") startLevel(levelIndex);
  } else if (e.code === "KeyP") {
    togglePause();
  } else if (e.code === "KeyN") {
    if (state === "landed" && levelIndex < LEVELS.length - 1) startLevel(levelIndex + 1);
  } else if (e.code === "Escape") {
    if (state !== "menu") showMenu();
  }
});

window.addEventListener("keyup", (e) => {
  const action = KEYMAP[e.code];
  if (action) input[action] = false;
});

window.addEventListener("blur", () => {
  Object.keys(input).forEach((k) => (input[k] = false));
  if (state === "flying") togglePause();
});

function togglePause() {
  if (state === "flying") {
    state = "paused";
    audioThrust(0);
    showOverlay("⏸ Pause", "", [["Reprendre (P)", togglePause], ["Menu", showMenu]]);
  } else if (state === "paused") {
    state = "flying";
    overlayEl.classList.add("hidden");
  }
}

/* ========================= Boucle principale ============================ */

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 1 / 20);

  if (state === "flying") physicsStep(dt);
  updateDebris(dt);
  updateEggAnims(dt);
  if (waterTex) { // l'eau dérive doucement
    waterTex.offset.x += dt * 0.012;
    waterTex.offset.y += dt * 0.007;
  }
  coinsState.forEach((c, k) => {
    if (c.collected) return;
    c.spin.rotation.y += 2.2 * dt;
    c.spin.position.y = Math.sin(performance.now() / 400 + k * 2.1) * 0.6;
  });
  if (state !== "menu") {
    updateCamera(dt);
    updateHUD();
  }

  // Hook de debug/tests
  GAME.state = state;
  GAME.fuel = fuel;
  GAME.level = levelIndex + 1;
  GAME.legs = legsDeploy;
  GAME.feetOn = feetOn;
  GAME.stableT = stableT;
  GAME.piece = allPieces();
  GAME.piecesGot = piecesGot;
  GAME.piecesNeeded = piecesNeeded;
  GAME.zoom = camZoom;
  GAME.elapsed = elapsed;

  renderer.render(scene, camera);
}

// Exposé pour le débogage et les tests automatisés
const GAME = {
  state, fuel, level: 1, pos, vel, quat, angVel, camDir, coinPos, startLevel, beginFlight, showMenu,
  legs: 0, feetOn: 0, stableT: 0, piece: false, piecesGot: 0, piecesNeeded: 1, zoom: 1, elapsed: 0,
  eggPositions: () => EGGS.map((e) => e.obj()?.position),
  coinPositions: () => coinsState.map((c) => c.pos),
  givePiece() { for (const c of coinsState) if (!c.collected) collectPiece(c); },
  deployLegs() { this.givePiece(); legsTriggered = true; legsDeploy = 1; },
  warpTime(s) { elapsed = s; },
};
window.GAME = GAME;

buildEnvironment("forest"); // décor derrière le menu
showMenu();
animate();
