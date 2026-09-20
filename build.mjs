import { build as bundle } from "esbuild";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const version = "v5";
const sourceImages = ["IMG_0380.JPG", "IMG_0457.JPG", "IMG_0535.JPG", "IMG_0621.JPG", "IMG_0648.JPG", "IMG_3027.JPG", "IMG_3460.JPG"];
const outputImages = sourceImages.map(function (_, index) { return "assets/card-" + (index + 1) + "." + version + ".jpg"; });

await rm("dist", { recursive: true, force: true });
await mkdir("dist/assets", { recursive: true });

await Promise.all(sourceImages.map(function (filename, index) {
  return sharp(path.join("assets", filename))
    .rotate()
    .resize(720, 720, { fit: "cover", position: "attention" })
    .jpeg({ quality: 82, progressive: false, chromaSubsampling: "4:2:0" })
    .toFile(path.join("dist", outputImages[index]));
}));

await Promise.all([
  sharp("assets/IMG_3460.JPG").rotate().resize(192, 192, { fit: "cover" }).png().toFile("dist/assets/icon-192.v5.png"),
  sharp("assets/IMG_3460.JPG").rotate().resize(512, 512, { fit: "cover" }).png().toFile("dist/assets/icon-512.v5.png")
]);

await bundle({
  entryPoints: ["src/styles.css"],
  outfile: "dist/styles.v5.css",
  bundle: true,
  minify: true,
  target: ["safari10"]
});

const replacements = {
  "__CARD_IMAGES__": JSON.stringify(outputImages),
  "__CACHE_ASSETS__": JSON.stringify(["./", "./index.html", "./styles.v5.css", "./app.v5.js", "./manifest.v5.webmanifest", "./assets/icon-192.v5.png", "./assets/icon-512.v5.png"].concat(outputImages))
};

async function render(source, destination) {
  let contents = await readFile(source, "utf8");
  Object.keys(replacements).forEach(function (key) { contents = contents.replace(key, replacements[key]); });
  await writeFile(destination, contents);
}

await Promise.all([
  render("src/index.html", "dist/index.html"),
  render("src/app.js", "dist/app.v5.js"),
  render("src/manifest.webmanifest", "dist/manifest.v5.webmanifest"),
  render("src/service-worker.js", "dist/service-worker.v5.js")
]);