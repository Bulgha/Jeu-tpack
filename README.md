# 🚀 Fusée T-Pack — jeu d'atterrissage 3D

Un jeu 3D dans le navigateur : pilotez une fusée à travers des champs
d'astéroïdes et posez-la **en douceur** sur la plateforme d'atterrissage.
Le carburant est limité, et les 10 niveaux sont de difficulté croissante.

Construit avec [Three.js](https://threejs.org/) (embarqué dans `lib/`,
aucune connexion internet nécessaire pour jouer).

## ▶️ Lancer le jeu

### Le plus simple : double-clic, sans rien installer

Le fichier **`Fusee-T-Pack.html`** contient le jeu complet en un seul
fichier : téléchargez-le et **double-cliquez dessus**, il s'ouvre
directement dans le navigateur. Aucun serveur, aucune installation,
aucune connexion nécessaires.

(Après une modification du code source, régénérez-le avec
`npm i esbuild` puis `node tools/build-standalone.mjs`.)

### Version développement (fichiers séparés)

`index.html` utilise des modules JavaScript : il faut le servir en HTTP
(l'ouvrir directement ne fonctionne pas).

```bash
# Au choix :
python3 -m http.server 8000
# ou
npx serve .
```

Puis ouvrez <http://localhost:8000> dans votre navigateur.

Le jeu est aussi directement hébergeable sur GitHub Pages (aucun build).

## 🎮 Commandes

| Touche | Action |
|---|---|
| **↑ / ↓** | Tangage (incliner avant / arrière) |
| **← / →** | Roulis (incliner gauche / droite) |
| **Page ↑ / Page ↓** | Lacet (rotation sur l'axe vertical) |
| **Espace** (maintenu) | Propulsion |
| **+ / −** | Régler la puissance de poussée (10 % – 100 %) |
| **R** | Recommencer le niveau |
| **P** | Pause |
| **Échap** | Retour au menu |

## 🏁 Règles

- L'atterrissage est réussi si, au contact de la plateforme :
  - vitesse verticale ≤ **4,5 m/s** ;
  - vitesse horizontale ≤ **3 m/s** ;
  - inclinaison ≤ **18°** ;
  - la fusée est **entièrement sur la plateforme**.
- Toucher un astéroïde, le sol, ou arriver trop vite = 💥 crash.
- Le réservoir est plein au départ de chaque niveau, mais de plus en plus
  juste au fil des niveaux — gérez la poussée !
- Un niveau réussi débloque le suivant (progression sauvegardée dans le
  navigateur via `localStorage`).

## 🌌 Les 10 niveaux

| # | Nom | Particularité |
|---|---|---|
| 1 | Premier envol | Aucun obstacle, grande plateforme |
| 2 | Dérive douce | Premiers astéroïdes |
| 3 | Champ clairsemé | Plus de distance |
| 4 | Slalom rocheux | Le champ se densifie |
| 5 | La ceinture | Ceinture d'astéroïdes |
| 6 | Passage étroit | Couloir resserré |
| 7 | Gravité lourde | ⚠️ Gravité renforcée (12 m/s²) |
| 8 | Mer de pierres | Champ dense, petite plateforme |
| 9 | Le gant | Couloir étroit et dense |
| 10 | L'aiguille | Gravité renforcée + plateforme minuscule |

## 🗂 Structure du projet

```
Fusee-T-Pack.html   Jeu complet en un seul fichier (ouvrable par double-clic)
index.html          Page, menus et HUD (interface en français)
style.css           Styles de l'interface
src/main.js         Jeu : physique, rendu 3D, caméra, collisions, audio
src/levels.js       Définition des 10 niveaux + génération des astéroïdes
lib/                Three.js r166 embarqué (licence MIT, voir THREE-LICENSE.txt)
tools/              Script de génération du fichier autonome
```

## ⚙️ Réglages (pour ajuster la difficulté)

- Les niveaux (carburant, gravité, distance, taille de plateforme, densité
  d'astéroïdes) se règlent dans `src/levels.js`.
- Les constantes physiques (poussée max, consommation, seuils
  d'atterrissage…) sont en tête de `src/main.js`.
