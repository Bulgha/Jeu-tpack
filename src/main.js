// Fusée T-Pack — jeu d'atterrissage 3D
// Pilotez une fusée à travers un champ d'astéroïdes et posez-la en douceur
// sur la plateforme. 10 niveaux, carburant limité.

import * as THREE from "three";
import { LEVELS, buildAsteroids, mulberry32 } from "./levels.js";

/* ============================== Constantes ============================== */

const MAX_THRUST = 22;      // accélération moteur à pleine puissance (m/s²)
const BURN_RATE = 2.0;      // carburant brûlé par seconde à pleine puissance
const ANG_ACCEL = 2.4;      // accélération angulaire tangage/roulis (rad/s²)
const YAW_ACCEL = 1.9;      // accélération angulaire lacet (rad/s²)
const ANG_DAMP = 1.8;       // amortissement angulaire (exponentiel, 1/s)
const ROCKET_BOTTOM = 2.8;  // distance centre → bas de la fusée
const PLATFORM_TOP = 2;     // hauteur du dessus de la plateforme

// Seuils d'un atterrissage réussi
const SAFE_VSPEED = 7.0;    // m/s vitesse verticale max au contact
const SAFE_HSPEED = 5.0;    // m/s vitesse horizontale max
const SAFE_TILT = 25;       // ° d'inclinaison max

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

// Lumières — fin de journée chaleureuse
scene.add(new THREE.HemisphereLight(0xffd9a8, 0x3e5e3f, 0.6));
const sun = new THREE.DirectionalLight(0xffdcb0, 1.3);
sun.position.set(180, 140, 80);
scene.add(sun);
scene.add(new THREE.AmbientLight(0xfff1de, 0.18));

// Décor naturel : ciel dégradé, prairie, lacs, arbres, collines
{
  // Dôme de ciel en dégradé (crépuscule doré)
  const cv = document.createElement("canvas");
  cv.width = 4; cv.height = 256;
  const c2 = cv.getContext("2d");
  const grad = c2.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, "#5d8fc9");
  grad.addColorStop(0.5, "#a9c6e0");
  grad.addColorStop(0.78, "#f2c491");
  grad.addColorStop(1.0, "#f7d9ac");
  c2.fillStyle = grad;
  c2.fillRect(0, 0, 4, 256);
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1900, 32, 16),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), side: THREE.BackSide, fog: false, depthWrite: false })
  );
  sky.renderOrder = -1;
  scene.add(sky);

  // Prairie
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(1700, 64),
    new THREE.MeshStandardMaterial({ color: 0x4d8a52, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const rng = mulberry32(777);

  // Lacs — ellipses d'eau, à l'écart de la plateforme
  const lakes = [];
  const lakeMat = new THREE.MeshStandardMaterial({ color: 0x4d90c9, roughness: 0.15, metalness: 0.35 });
  const lakeGeo = new THREE.CircleGeometry(1, 36);
  while (lakes.length < 9) {
    const a = rng() * Math.PI * 2, d = 90 + rng() * 650;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const rx = 18 + rng() * 45, rz = 14 + rng() * 40;
    if (Math.hypot(x, z) < Math.max(rx, rz) + 45) continue;
    lakes.push({ x, z, rx, rz });
    const lake = new THREE.Mesh(lakeGeo, lakeMat);
    lake.rotation.x = -Math.PI / 2;
    lake.position.set(x, 0.04, z);
    lake.scale.set(rx, rz, 1);
    scene.add(lake);
  }

  // Arbres (instanciés, décoratifs — pas de collision)
  const spots = [];
  let tries = 0;
  while (spots.length < 400 && tries < 6000) {
    tries++;
    const a = rng() * Math.PI * 2, d = 35 + Math.pow(rng(), 0.75) * 800;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (lakes.some((l) => ((x - l.x) / (l.rx + 4)) ** 2 + ((z - l.z) / (l.rz + 4)) ** 2 < 1)) continue;
    spots.push({ x, z, s: 0.8 + rng() * 1.2, h: rng() });
  }
  const trunks = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.22, 0.34, 2.4, 6),
    new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 0.95 }),
    spots.length
  );
  const crowns = new THREE.InstancedMesh(
    new THREE.ConeGeometry(1.8, 4.6, 8),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }),
    spots.length
  );
  const m4 = new THREE.Matrix4(), q0 = new THREE.Quaternion(),
        v3 = new THREE.Vector3(), s3 = new THREE.Vector3(), col = new THREE.Color();
  spots.forEach((p, i) => {
    s3.setScalar(p.s);
    m4.compose(v3.set(p.x, 1.2 * p.s, p.z), q0, s3);
    trunks.setMatrixAt(i, m4);
    m4.compose(v3.set(p.x, 4.0 * p.s, p.z), q0, s3);
    crowns.setMatrixAt(i, m4);
    col.setHSL(0.29 + p.h * 0.07, 0.5, 0.26 + p.h * 0.14);
    crowns.setColorAt(i, col);
  });
  scene.add(trunks, crowns);

  // Collines à l'horizon
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + rng() * 0.4;
    const d = 850 + rng() * 500;
    const r = 140 + rng() * 220, h = 70 + rng() * 130;
    const hill = new THREE.Mesh(
      new THREE.ConeGeometry(r, h, 7),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(0.35 + rng() * 0.06, 0.25, 0.32 + rng() * 0.1),
        roughness: 1, flatShading: true,
      })
    );
    hill.position.set(Math.cos(a) * d, h / 2 - 2, Math.sin(a) * d);
    scene.add(hill);
  }
}

/* --------------------------- Plateforme -------------------------------- */

let platformGroup = null;

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
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 0.6, 90, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x6fe08a, transparent: true, opacity: 0.13, depthWrite: false })
  );
  beam.position.y = 45 + PLATFORM_TOP;
  g.add(beam);

  const light = new THREE.PointLight(0x6fe08a, 30, 60);
  light.position.y = PLATFORM_TOP + 4;
  g.add(light);

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
let colliders = []; // { center: Vector3, r: number }

function buildAsteroidField(cfg) {
  disposeGroup(asteroidGroup);
  asteroidGroup.clear();
  colliders = [];

  const list = buildAsteroids(cfg);
  list.forEach((a, i) => {
    let mesh, collR;
    if (a.kind === "box") {
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(a.size * 1.6, a.size * 1.1, a.size * 1.3),
        rockMaterial(a.hue, true)
      );
      collR = a.size * 0.95;
    } else {
      const geo = new THREE.IcosahedronGeometry(a.size, 1);
      // Déformation aléatoire des sommets pour un aspect rocheux
      const rng = mulberry32(cfg.seed * 977 + i);
      const p = geo.getAttribute("position");
      for (let v = 0; v < p.count; v++) {
        const k = 1 + (rng() - 0.5) * 0.45;
        p.setXYZ(v, p.getX(v) * k, p.getY(v) * k, p.getZ(v) * k);
      }
      geo.computeVertexNormals();
      mesh = new THREE.Mesh(geo, rockMaterial(a.hue, false));
      collR = a.size * 1.15;
    }
    mesh.position.set(...a.pos);
    mesh.rotation.set(...a.rot);
    asteroidGroup.add(mesh);
    colliders.push({ center: new THREE.Vector3(...a.pos), r: collR });
  });
}

function rockMaterial(hue, isBox) {
  const c = new THREE.Color().setHSL(0.06 + hue * 0.06, 0.18 + hue * 0.15, 0.3 + hue * 0.18);
  return new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, flatShading: true, metalness: isBox ? 0.25 : 0 });
}

function disposeGroup(g) {
  g.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
  });
}

/* ----------------------------- Débris ---------------------------------- */

const debris = [];
const debrisGeo = new THREE.TetrahedronGeometry(0.45);
const debrisMats = [0xe9ecf2, 0xd6452e, 0x2c2f38, 0xff9a3d].map(
  (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, flatShading: true })
);
let flashLight = null;

function spawnDebris(at) {
  for (let i = 0; i < 30; i++) {
    const m = new THREE.Mesh(debrisGeo, debrisMats[i % debrisMats.length]);
    m.position.copy(at);
    const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5)
      .normalize().multiplyScalar(6 + Math.random() * 14);
    debris.push({ mesh: m, vel: v, spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8), life: 2.5 });
    scene.add(m);
  }
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
    if (d.mesh.position.y < 0.3) { d.mesh.position.y = 0.3; d.vel.y *= -0.35; d.vel.multiplyScalar(0.8); }
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

let unlocked = parseInt(localStorage.getItem(STORAGE_KEY) || "1", 10);
if (!(unlocked >= 1 && unlocked <= 10)) unlocked = 1;

const input = { pitchUp: false, pitchDown: false, rollL: false, rollR: false, yawL: false, yawR: false, thrust: false };

/* --------------------------- Navigation -------------------------------- */

function showMenu() {
  state = "menu";
  menuEl.classList.remove("hidden");
  hudEl.classList.add("hidden");
  overlayEl.classList.add("hidden");
  rebuildLevelGrid();
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

  buildPlatform(cfg.platformRadius);
  buildAsteroidField(cfg);
  clearDebris();

  pos.set(...cfg.spawn);
  vel.set(0, 0, 0);
  quat.identity();
  angVel.set(0, 0, 0);
  fuel = cfg.fuel;
  throttle = 1;
  elapsed = 0;
  rocketMesh.visible = true;
  rocketMesh.position.copy(pos);
  rocketMesh.quaternion.copy(quat);

  snapCamera();

  menuEl.classList.add("hidden");
  hudEl.classList.remove("hidden");
  $("hud-level").textContent = `Niveau ${i + 1}/10`;
  $("hud-name").textContent = cfg.name;

  state = "ready";
  const dist = Math.round(Math.hypot(cfg.spawn[0], cfg.spawn[2]));
  showOverlay(
    `Niveau ${i + 1} — ${cfg.name}`,
    `Plateforme à ${dist} m (rayon ${cfg.platformRadius} m). Carburant : ${cfg.fuel} unités.` +
      (cfg.gravity > 10 ? " ⚠️ Gravité renforcée !" : "") +
      `\nPosez-vous à moins de ${SAFE_VSPEED} m/s, incliné de moins de ${SAFE_TILT}°.`,
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
  pos.y = PLATFORM_TOP + ROCKET_BOTTOM;
  audioThrust(0);
  audioSuccess();

  if (levelIndex + 2 > unlocked) {
    unlocked = Math.min(levelIndex + 2, 10);
    localStorage.setItem(STORAGE_KEY, String(unlocked));
  }

  const stats = `Carburant restant : ${Math.round(fuel)} u · Temps : ${elapsed.toFixed(1)} s`;
  if (levelIndex === 9) {
    showOverlay("🏆 Jeu terminé !", `Vous avez maîtrisé les 10 niveaux. Bravo, pilote !\n${stats}`,
      [["Rejouer ce niveau", () => startLevel(levelIndex)], ["Menu", showMenu]]);
  } else {
    showOverlay("🎉 Atterrissage réussi !", stats, [
      ["Niveau suivant ▶", () => startLevel(levelIndex + 1)],
      ["Rejouer", () => startLevel(levelIndex)],
      ["Menu", showMenu],
    ]);
  }
}

function crash(reason) {
  state = "crashed";
  audioThrust(0);
  audioCrash();
  rocketMesh.visible = false;
  flame.visible = flameCore.visible = false;
  spawnDebris(pos.clone());

  const id = runId;
  setTimeout(() => {
    if (id !== runId || state !== "crashed") return;
    showOverlay("💥 Crash !", reason, [
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

function physicsStep(dt) {
  elapsed += dt;

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

  angVel.multiplyScalar(Math.exp(-ANG_DAMP * dt));

  const w = angVel.length();
  if (w > 1e-6) {
    _dq.setFromAxisAngle(_axis.copy(angVel).divideScalar(w), w * dt);
    quat.premultiply(_dq).normalize();
  }

  // --- Poussée & gravité ---
  const thrusting = input.thrust && fuel > 0;
  if (thrusting) {
    _up.set(0, 1, 0).applyQuaternion(quat);
    vel.addScaledVector(_up, MAX_THRUST * throttle * dt);
    fuel = Math.max(0, fuel - BURN_RATE * throttle * dt);
  }
  vel.y -= cfg.gravity * dt;
  pos.addScaledVector(vel, dt);

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

  checkCollisions();
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
        crash("La fusée a percuté un astéroïde.");
        return;
      }
    }
  }

  const bottomY = pos.y - ROCKET_BOTTOM;
  const hDist = Math.hypot(pos.x, pos.z);

  // Contact avec la plateforme — l'atterrissage est valide n'importe où sur
  // le plateau, du moment que le pied de la fusée (rayon ~0,9 m) le touche.
  if (bottomY <= PLATFORM_TOP + 0.05 && hDist < cfg.platformRadius + 2.0) {
    const vs = -vel.y;
    const hs = Math.hypot(vel.x, vel.z);
    const tilt = tiltDeg();
    if (vs > SAFE_VSPEED) crash(`Impact trop violent : ${vs.toFixed(1)} m/s à la verticale (max ${SAFE_VSPEED}).`);
    else if (tilt > SAFE_TILT) crash(`Fusée trop inclinée au contact : ${Math.round(tilt)}° (max ${SAFE_TILT}°).`);
    else if (hs > SAFE_HSPEED) crash(`La fusée glissait trop vite : ${hs.toFixed(1)} m/s à l'horizontale (max ${SAFE_HSPEED}).`);
    else if (hDist > cfg.platformRadius + 0.9) crash("La fusée s'est posée à cheval sur le bord de la plateforme.");
    else landSuccess();
    return;
  }

  // Sol
  if (bottomY <= 0) { crash("La fusée s'est écrasée sur le terrain."); return; }

  // Hors zone
  if (hDist > 1200 || pos.y > 800) crash("Fusée perdue — sortie de la zone de vol.");
}

/* ============================= Caméra =================================== */

const camDir = new THREE.Vector3(0, 0, 1);
const _camTarget = new THREE.Vector3();
const _desired = new THREE.Vector3();

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

  _camTarget.copy(pos).addScaledVector(camDir, 26);
  _camTarget.y = pos.y + 11;
  if (_camTarget.y < 3) _camTarget.y = 3;

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
  const surface = hDist < cfg.platformRadius ? PLATFORM_TOP : 0;
  const alt = Math.max(0, pos.y - ROCKET_BOTTOM - surface);
  setStat("stat-alt", `${alt.toFixed(0)} m`);

  const vs = vel.y;
  setStat("stat-vs", `${vs >= 0 ? "+" : ""}${vs.toFixed(1)} m/s`, Math.abs(vs) <= SAFE_VSPEED);

  const hs = Math.hypot(vel.x, vel.z);
  setStat("stat-hs", `${hs.toFixed(1)} m/s`, hs <= SAFE_HSPEED);

  const tilt = tiltDeg();
  setStat("stat-tilt", `${Math.round(tilt)}°`, tilt <= SAFE_TILT);

  setStat("stat-dist", `${Math.round(hDist)} m`);
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
    if (state === "landed" && levelIndex < 9) startLevel(levelIndex + 1);
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
  if (state !== "menu") {
    updateCamera(dt);
    updateHUD();
  }

  // Hook de debug/tests
  GAME.state = state;
  GAME.fuel = fuel;
  GAME.level = levelIndex + 1;

  renderer.render(scene, camera);
}

// Exposé pour le débogage et les tests automatisés
const GAME = { state, fuel, level: 1, pos, vel, quat, camDir, startLevel, beginFlight, showMenu };
window.GAME = GAME;

showMenu();
animate();
