const assert = require("node:assert");
const fs = require("node:fs");

const html = fs.readFileSync("dist/index.html", "utf8");
const js = fs.readFileSync("dist/app.v6.js", "utf8");
const css = fs.readFileSync("dist/styles.v6.css", "utf8");
const worker = fs.readFileSync("dist/service-worker.v6.js", "utf8");

assert(!/<script[^>]+type=["']module["']/i.test(html), "The app must not rely on module scripts");
assert(/<script src="app\.v6\.js" defer><\/script>/.test(html), "The classic entry point is missing");
assert(/<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">/.test(html), "The iOS viewport configuration is missing");
assert(/<link rel="apple-touch-icon" href="assets\/icon-192\.v6\.png">/.test(html), "The iOS home-screen icon is missing");
assert(!/\b(const|let|class)\s/.test(js), "Modern declarations leaked into the browser bundle");
assert(!/=>|`|\?\.|\?\?/.test(js), "Unsupported modern syntax leaked into the browser bundle");
assert(!/\b(const|let|class)\s|=>|`|\?\.|\?\?/.test(worker), "Unsupported syntax leaked into the service worker");
assert(js.indexOf("__CARD_IMAGES__") === -1, "The card-image build placeholder leaked into the browser bundle");
assert(worker.indexOf("__CACHE_ASSETS__") === -1, "The cache-assets build placeholder leaked into the service worker");
assert(js.indexOf('document.createElement("canvas")') !== -1, "The completion canvas is missing");
assert(js.indexOf('window.setTimeout(callback, 16)') !== -1, "The animation-frame fallback is missing");
assert(js.indexOf('canvas.getContext("2d")') !== -1, "The Safari-compatible Canvas 2D path is missing");
assert(js.indexOf('canvas.style.backgroundColor = "transparent"') !== -1, "The confetti overlay must remain transparent");
assert(js.indexOf('canvas.style.pointerEvents = "none"') !== -1, "The confetti overlay must not block the game");
assert(js.indexOf('card.addEventListener("touchend", chooseCard, false)') !== -1, "The legacy iOS touch fallback is missing");
assert(!/\bPath2D\b|\.animate\(/.test(js), "The celebration uses an unsupported modern animation API");
assert(css.indexOf("display:-webkit-flex") !== -1, "The flexbox prefix fallback is missing");
assert(css.indexOf("min-height:100vh") !== -1, "The viewport height fallback is missing");
assert(css.indexOf("-webkit-tap-highlight-color") !== -1, "The iOS touch feedback styling is missing");
assert(html.indexOf("JavaScript is turned off") !== -1, "The no-JavaScript fallback is missing");
console.log("iOS 10.3.3 compatibility checks passed.");