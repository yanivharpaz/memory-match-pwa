const assert = require("node:assert");
const fs = require("node:fs");

const html = fs.readFileSync("dist/index.html", "utf8");
const js = fs.readFileSync("dist/app.v5.js", "utf8");
const css = fs.readFileSync("dist/styles.v5.css", "utf8");
const worker = fs.readFileSync("dist/service-worker.v5.js", "utf8");

assert(!/<script[^>]+type=["']module["']/i.test(html), "The app must not rely on module scripts");
assert(/<script src="app\.v5\.js" defer><\/script>/.test(html), "The classic entry point is missing");
assert(!/\b(const|let|class)\s/.test(js), "Modern declarations leaked into the browser bundle");
assert(!/=>|`|\?\.|\?\?/.test(js), "Unsupported modern syntax leaked into the browser bundle");
assert(!/\b(const|let|class)\s|=>|`|\?\.|\?\?/.test(worker), "Unsupported syntax leaked into the service worker");
assert(js.indexOf('document.createElement("canvas")') !== -1, "The completion canvas is missing");
assert(js.indexOf('window.setTimeout(callback, 16)') !== -1, "The animation-frame fallback is missing");
assert(js.indexOf('canvas.getContext("2d")') !== -1, "The Safari-compatible Canvas 2D path is missing");
assert(!/\bPath2D\b|\.animate\(/.test(js), "The celebration uses an unsupported modern animation API");
assert(css.indexOf("display:-webkit-flex") !== -1, "The flexbox prefix fallback is missing");
assert(css.indexOf("min-height:100vh") !== -1, "The viewport height fallback is missing");
assert(html.indexOf("JavaScript is turned off") !== -1, "The no-JavaScript fallback is missing");
console.log("Safari 10 compatibility checks passed.");