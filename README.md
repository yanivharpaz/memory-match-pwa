# Memory Match

Memory Match is a responsive family-photo matching game built as a small, dependency-light Progressive Web App (PWA). It supports current browsers while retaining an online-play compatibility path for Safari 10 on iOS 10.3.3.

The application has no backend, stores no personal data, and requires no JavaScript framework. A production build compiles browser code, generates optimized images, and writes a static site to `dist/`.

## Browser support

| Platform | Gameplay | Add to Home Screen | Offline play |
| --- | --- | --- | --- |
| Current evergreen browsers | Yes | Yes | Yes, after the first successful visit |
| Safari 10 on iOS 10.3.3 | Yes | Yes, using Apple metadata | No |
| Browsers without JavaScript | No | No | No; an explanatory fallback remains visible |

iOS 10.3.3 does not support service workers or the standard web app manifest. On that platform, Memory Match behaves as a reliable online web application and can be added to the Home Screen using Apple-specific metadata. Offline behavior is an optional enhancement for newer browsers, never a requirement for application startup.

## Features

- 6 to 14 cards per game
- Responsive layouts for phones, tablets, and desktop browsers
- Mouse, keyboard, and legacy iOS touch activation
- Accessible card labels, status updates, and native controls
- Left-to-right and right-to-left layout switching
- Reduced-motion support for the completion effect
- Offline caching in browsers with service-worker support
- Versioned, immutable production assets
- Resized, rotated, metadata-free deployment images

## Quick start

Requirements:

- A current Node.js release supported by the installed dependencies
- npm

Install dependencies and run the complete build and test suite:

```sh
npm install
npm test
```

Start the generated site locally:

```sh
npm start
```

Then open `http://localhost:4173`.

`npm start` serves `dist/`, so run `npm run build` first after changing source files when you do not run `npm test`.

## Project structure

```text
assets/                    Original family photos
src/
  app.js                   Game state, input handling, timer, and celebration
  index.html               Page structure and Apple/PWA metadata
  manifest.webmanifest     Manifest for browsers that support it
  service-worker.js        Optional offline caching
  styles.css               Responsive and legacy WebKit styling
tests/
  app.test.cjs             DOM behavior tests
  compatibility.test.cjs   Generated-asset compatibility contract
build.mjs                  JavaScript, CSS, image, and HTML build pipeline
vercel.json                Hosting, build, and cache configuration
DESIGN.md                  Architecture and design decisions
TESTING.md                 Detailed test inventory and authoring guide
dist/                      Generated deployment output; do not edit directly
```

## Development commands

| Command | Purpose |
| --- | --- |
| `npm run build` | Recreate `dist/`, optimize images, compile CSS and JavaScript, and render build placeholders |
| `npm test` | Build and run all behavior and compatibility tests |
| `npm start` | Serve the current `dist/` directory on port 4173 with caching disabled |

Source files live under `src/`. Always make changes there rather than editing generated files under `dist/`.

## What every iOS 10.3-compatible PWA needs

The following rules are the reusable compatibility contract for future applications that must run immediately on Safari 10 and iOS 10.3.3.

### 1. Compile JavaScript for Safari 10

Do not ship source JavaScript directly, even if it currently happens to use older syntax. Configure the production compiler with a Safari 10 target:

```js
const result = await transform(source, {
  charset: "ascii",
  legalComments: "none",
  loader: "js",
  target: "safari10"
});
```

Also set the package browser targets so other compatible tooling uses the same baseline:

```json
{
  "browserslist": [
    "Safari >= 10",
    "iOS >= 10.3"
  ]
}
```

Compilation handles syntax compatibility, not missing browser APIs. Avoid or provide fallbacks for APIs unavailable in Safari 10. The generated compatibility test in this project rejects common unsupported syntax such as arrow functions, `const`, `let`, classes, template literals, optional chaining, and nullish coalescing.

Use a classic deferred script:

```html
<script src="app.v7.js" defer></script>
```

Do not make the only entry point a JavaScript module. Safari 10.3 does not provide the modern module behavior expected by current applications.

### 2. Handle touch explicitly

Do not assume that every old iOS device will reliably convert a tap into the expected `click`. Register both `touchend` and `click` on essential controls:

```js
function activate(event) {
  if (event.type === "touchend") {
    event.preventDefault();
  }

  // Perform one activation.
}

element.addEventListener("touchend", activate, false);
element.addEventListener("click", activate, false);
```

Calling `preventDefault()` on the handled `touchend` prevents the delayed synthetic click from activating the same control a second time. Keep the listener non-passive when it must call `preventDefault()`.

Prefer native interactive elements such as `<button>` over clickable `<div>` elements. They provide keyboard behavior, disabled state, and accessibility semantics without additional code.

### 3. Treat service workers as optional

iOS 10.3 has no service-worker support. Never wait for service-worker registration before rendering or enabling the application:

```js
if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("service-worker.v7.js");
  }, false);
}
```

The HTML, CSS, JavaScript, and online application flow must work when this block never runs. Communicate that offline play is unavailable without presenting it as a fatal error.

Avoid executing service-worker-only globals or APIs from the page context. The worker may use `Promise`, Cache Storage, and `fetch` because unsupported iOS versions never load it.

### 4. Include Apple Home Screen metadata

The standard web app manifest is ignored by iOS 10.3. Add Apple-specific metadata and an Apple touch icon:

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Application name">
<link rel="apple-touch-icon" href="assets/icon-192.v7.png">
```

Keep a standard manifest for modern browsers, but do not depend on it to supply the iOS 10.3 title, icon, colors, display mode, or startup behavior.

Use PNG or JPEG assets. Do not make newer formats such as WebP or AVIF the only image source.

### 5. Provide legacy WebKit CSS paths

Safari 10 supports much of modern CSS but still needs conservative layout choices:

- Include `display: -webkit-flex` before `display: flex`.
- Include `-webkit-` flex alignment properties where the layout depends on them.
- Keep a non-custom-property fallback before values that use CSS custom properties.
- Keep a plain padding value before safe-area calculations.
- Include `min-height: 100vh` as a viewport fallback.
- Include `-webkit-appearance` and `-webkit-user-select` where relevant.
- Use `-webkit-tap-highlight-color` to provide clear touch feedback.
- Do not make unsupported media queries or visual effects necessary for using the interface.

Example safe-area pattern:

```css
body {
  padding: 20px;
  padding-top: calc(20px + env(safe-area-inset-top));
}
```

Safari versions that do not understand `env()` ignore the second declaration and retain the first.

### 6. Use conservative runtime APIs

For the oldest supported page context:

- Use `addEventListener`, not framework assumptions about pointer events.
- Provide a `setTimeout` fallback for `requestAnimationFrame`.
- Use Canvas 2D directly instead of depending on `Path2D` or Web Animations.
- Guard optional APIs such as `matchMedia`.
- Do not depend on `PointerEvent`, service workers, Cache Storage, IndexedDB features added after Safari 10, or modern collection methods without verifying support.
- Keep the initial application path independent of network APIs beyond ordinary document and asset loading.

Feature detection is more reliable than user-agent detection.

### 7. Make asset updates cache-safe

Do not replace the contents of a URL that is served with `Cache-Control: immutable`. Old iPads may retain that file for a year and continue running a fixed bug.

This project uses an asset generation such as `v7` in every production filename:

```text
app.v7.js
styles.v7.css
service-worker.v7.js
manifest.v7.webmanifest
assets/card-1.v7.jpg
```

When deployable content changes:

1. Increment the asset generation in `build.mjs`.
2. Update references in `src/`, tests, documentation, and `vercel.json`.
3. Change the service-worker cache name.
4. Run `npm test`.
5. Confirm the generated HTML references only the new generation.
6. Deploy and inspect the live HTML and JavaScript, not only the deployment status.

HTML and the service-worker file must be revalidated. Fingerprinted application assets can be immutable:

```text
index.html: max-age=0, must-revalidate
service-worker: max-age=0, must-revalidate
versioned assets: max-age=31536000, immutable
```

### 8. Test the generated output

Source inspection alone is insufficient. Compatibility tests must read the production files after the build and verify:

- a classic entry point is present;
- unsupported syntax did not leak into generated JavaScript;
- build placeholders were replaced;
- Apple metadata and the touch icon are present;
- the legacy touch handler is present;
- required WebKit CSS fallbacks remain;
- service-worker use is feature-detected;
- versioned URLs agree across HTML, worker, manifest, hosting configuration, and tests.

Run a final manual test on physical hardware whenever possible. Emulation and jsdom do not reproduce old Mobile Safari's complete touch, image decoding, layout, memory, or Home Screen behavior.

## iOS 10.3 release checklist

Use this checklist before shipping any future PWA intended for an iOS 10.3 device:

- [ ] The production JavaScript target is Safari 10.
- [ ] The page uses a classic deferred script.
- [ ] Important controls have tested `touchend` and `click` paths.
- [ ] Touch handling prevents a duplicate synthetic click.
- [ ] Native buttons and form controls are used where possible.
- [ ] Gameplay starts without a service worker.
- [ ] The manifest is optional rather than required.
- [ ] Apple mobile-web-app metadata and a PNG touch icon are present.
- [ ] CSS includes legacy WebKit and safe fallback declarations.
- [ ] Images are available as JPEG or PNG.
- [ ] Optional browser APIs are guarded by feature detection.
- [ ] Changed immutable assets have new URLs.
- [ ] HTML and the worker use revalidation cache headers.
- [ ] Tests inspect generated production assets.
- [ ] The deployed JavaScript is checked at the live URL.
- [ ] The primary interaction is tested on a physical iOS 10.3 device.

## Build pipeline

`build.mjs` performs the following work:

1. Deletes and recreates `dist/`.
2. Auto-rotates and resizes source photos with Sharp.
3. writes progressive-disabled JPEG cards and PNG icons.
4. Bundles and minifies CSS for Safari 10.
5. Replaces image and cache-list placeholders.
6. Compiles application and service-worker JavaScript for Safari 10.
7. Writes versioned deployment files.

Original images remain in `assets/`; generated deployment images do not retain the original dimensions or metadata.

## Customizing the game

To replace or add photographs:

1. Add source files under `assets/`.
2. Update `sourceImages` in `build.mjs`.
3. Update the corresponding accessible descriptions in `src/app.js`.
4. Ensure the maximum card count does not exceed twice the number of available images.
5. Increment the asset generation.
6. Run `npm test`.

Descriptions should identify each image without exposing sensitive information. Keep every description meaningful when announced by a screen reader.

## Testing

The test suite covers game state, matching, timing, reset behavior, accessibility state, direction switching, completion effects, service-worker messaging, iOS touch activation, and generated Safari 10 compatibility.

```sh
npm test
```

See [TESTING.md](TESTING.md) for the complete test inventory, harness design, debugging guidance, and extension patterns.

Physical-device testing remains necessary for touch behavior, real layout, Home Screen launch behavior, image decoding, and performance on older hardware.

## Deployment

The repository is configured for Vercel:

- Build command: `npm run build`
- Output directory: `dist`
- Production configuration: `vercel.json`

Pushing `main` triggers the connected production deployment. After deployment:

1. Confirm the live page returns HTTP 200.
2. Inspect the live HTML for the current versioned script.
3. Fetch that script and confirm it contains the expected compatibility fix.
4. Open a new Safari tab on the target iPad and test the complete primary interaction.

## Additional documentation

- [DESIGN.md](DESIGN.md) describes the architecture, state transitions, compatibility model, caching strategy, accessibility decisions, and extension points.
- [TESTING.md](TESTING.md) documents the test harness and every current test scenario.
