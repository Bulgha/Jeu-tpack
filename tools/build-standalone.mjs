// Génère « Fusee-T-Pack.html » : le jeu complet dans un seul fichier,
// ouvrable par double-clic (aucun serveur nécessaire).
//
// Utilisation :  npm i esbuild  puis  node tools/build-standalone.mjs
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

execFileSync("npx", [
  "esbuild", join(root, "src/main.js"),
  "--bundle", "--minify", "--format=iife",
  `--alias:three=${join(root, "lib/three.module.min.js")}`,
  `--outfile=${join(root, "tools/bundle.tmp.js")}`,
], { stdio: "inherit" });

const html = readFileSync(join(root, "index.html"), "utf8");
const css = readFileSync(join(root, "style.css"), "utf8");
const js = readFileSync(join(root, "tools/bundle.tmp.js"), "utf8").replaceAll("</script", "<\\/script");

// Remplacements via fonctions : les « $ » du code minifié ne doivent pas
// être interprétés comme motifs spéciaux de String.replace.
const out = html
  .replace(/<link rel="stylesheet"[^>]*\/>/, () => `<style>\n${css}\n</style>`)
  .replace(/<script type="importmap">[\s\S]*?<\/script>/, "")
  .replace(/<script type="module" src="\.\/src\/main\.js"><\/script>/, () => `<script>\n${js}\n</script>`);

writeFileSync(join(root, "Fusee-T-Pack.html"), out);
console.log("→ Fusee-T-Pack.html généré");
