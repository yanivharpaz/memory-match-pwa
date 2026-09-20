const assert = require("node:assert");
const fs = require("node:fs");

const html = fs.readFileSync("dist/index.html", "utf8");
const js = fs.readFileSync("dist/app.v4.js", "utf8");
const css = fs.readFileSync("dist/styles.v4.css", "utf8");
const worker = fs.readFileSync("dist/service-worker.v4.js", "utf8");

assert(!/<script[^>]+type=["']module["']/i.test(html), "The app must not rely on module scripts");
assert(/<script src="app\.v4\.js" defer><\/script>/.test(html), "The classic entry point is missing");
assert(!/\b(const|let|class)\s/.test(js), "Modern declarations leaked into the browser bundle");
assert(!/=>|`|\?\.|\?\?/.test(js), "Unsupported modern syntax leaked into the browser bundle");
assert(!/\b(const|let|class)\s|=>|`|\?\.|\?\?/.test(worker), "Unsupported syntax leaked into the service worker");
assert(css.indexOf("display:-webkit-flex") !== -1, "The flexbox prefix fallback is missing");
assert(css.indexOf("min-height:100vh") !== -1, "The viewport height fallback is missing");
assert(html.indexOf("JavaScript is turned off") !== -1, "The no-JavaScript fallback is missing");
console.log("Safari 10 compatibility checks passed.");