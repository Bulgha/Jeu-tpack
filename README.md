# 🚀 Fusée T-Pack — jeu d'atterrissage 3D

Un jeu 3D dans le navigateur : pilotez une fusée à travers des champs
de rochers flottants et posez-la **en douceur** sur la plateforme
d'atterrissage, au cœur d'un paysage chaleureux de fin de journée
(prairie, forêts, lacs, collines). Le carburant est limité, et les
10 niveaux sont de difficulté croissante.

Les commandes sont **relatives à l'écran** : « ↑ » incline toujours la
fusée vers le fond de l'écran, même quand la caméra tourne autour de la
plateforme — pas d'inversion des commandes.

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
| **Molette / pavé tactile** | Zoomer / dézoomer la caméra |
| **R** | Recommencer le niveau |
| **P** | Pause |
| **Échap** | Retour au menu |

## 🏁 Règles

- Chaque niveau commence par la **pièce ⭐** (balise dorée) : tant qu'elle
  n'est pas ramassée, les trains d'atterrissage restent **verrouillés** —
  impossible de se poser.
- Les **trains d'atterrissage** (4 pieds) sont cachés dans le fuselage et
  sortent automatiquement à l'approche de la cible : ils coulissent hors
  du bas de la fusée puis s'écartent. Si l'on s'éloigne de la plateforme,
  ils **rentrent** — pas question de se poser dans l'herbe.
- Les obstacles entourent la plateforme sur **360°**, avec 5 familles :
  rochers, blocs, cristaux lumineux, anneaux de pierre (on peut passer
  par le trou !) et piliers rocheux ancrés au sol.
- Le niveau est réussi quand les **4 pieds reposent sur la plateforme**
  et que la fusée reste **immobile pendant 2 secondes** — n'importe où
  sur le plateau.
- Les trains **amortissent et stabilisent** l'atterrissage : la fusée se
  redresse toute seule si elle arrive un peu penchée ou un peu vite. Mais
  au-delà d'un certain angle, elle bascule… et n'explose que **couchée au
  sol** — il reste donc un instant pour la rattraper au moteur !
- Toucher un obstacle, piquer du nez dans le sol, ou taper la
  plateforme à plus de **12 m/s** = 💥 crash.
- 🥚 On raconte que **3 secrets** se cachent quelque part dans la
  carte… ouvrez l'œil en explorant, ils valent le détour.
- Le réservoir est plein au départ de chaque niveau, mais de plus en plus
  juste au fil des niveaux — gérez la poussée !
- Un niveau réussi débloque le suivant (progression sauvegardée dans le
  navigateur via `localStorage`).

## 🌌 Les 10 niveaux — un monde différent à chaque fois

| # | Nom | Environnement |
|---|---|---|
| 1 | La Forêt d'Émeraude | Prairie dorée, sapins, lacs |
| 2 | Le Monde de Glace | Neige, sapins givrés, lacs gelés, flocons |
| 3 | Les Terres Mystiques | Ciel violet, champignons luminescents, étoiles |
| 4 | Le Grand Désert | Dunes, cactus, mesas, oasis |
| 5 | La Fournaise | Basalte, lacs de lave, pics incandescents, braises |
| 6 | L'Archipel | Pleine mer, îlots de sable, palmiers |
| 7 | Le Marais Toxique | Brume verte, mares d'acide, arbres morts — ⚠️ gravité 12 m/s² |
| 8 | La Nuit des Lucioles | Nuit étoilée, pleine lune, lucioles |
| 9 | Le Royaume Sucré | Tout rose, sucettes géantes, lagons menthe |
| 10 | La Planète X | Ciel noir, planète annelée, flèches aliens — ⚠️ gravité 12 m/s² |
| 11 | **L'Épreuve Extrême** | Monde d'orage — ⏱ **90 s chrono**, **3 pièces** à collecter, 120 obstacles |
| 12 | **L'Éclipse Finale** | Soleil noir, cendres et mares écarlates — ⏱ **150 s**, **5 pièces**, 150 obstacles, plateforme de 4,5 m |

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
