# Memory Match Design

## Purpose

Memory Match is a static family-photo matching game designed to remain understandable, responsive, and usable across a wide browser range, including Safari 10 on iOS 10.3.3.

The product favors:

- immediate play with no account or setup;
- accessible native browser controls;
- predictable behavior on old mobile hardware;
- small, cacheable static assets;
- optional PWA enhancements that never block gameplay;
- simple source code that can be maintained without a framework.

## Goals

1. Provide a complete memory matching game for 6 to 14 cards.
2. Support touch, mouse, and keyboard input.
3. Run online on iOS 10.3.3 without modern PWA APIs.
4. Provide installation and offline behavior where the browser supports them.
5. Keep family photographs local to the project and remove deployment metadata.
6. Retain useful screen-reader labels and live game status.
7. Make generated browser compatibility verifiable in automated tests.

## Non-goals

- User accounts, authentication, or cloud saves
- Multiplayer or server synchronization
- Analytics or behavioral tracking
- Persisting an interrupted game
- Guaranteed offline play on browsers without service workers
- Supporting gameplay with JavaScript disabled
- Supporting every visual effect identically on every browser

## System context

Memory Match is a static site:

```text
Source photos + HTML/CSS/JS
             |
             v
          build.mjs
             |
             v
        dist/ static site
             |
             v
       Vercel CDN/hosting
             |
             v
 Browser page <--> optional service worker cache
```

There is no application server or database. The browser downloads versioned static assets and keeps all transient game state in memory.

## Component architecture

| Component | Responsibility |
| --- | --- |
| `src/index.html` | Semantic page structure, game controls, status regions, Apple metadata, manifest and asset references |
| `src/styles.css` | Responsive layout, visual states, WebKit fallbacks, RTL rules, and reduced-motion behavior |
| `src/app.js` | Game state, shuffle, card creation, input handling, timer, matching, reset, direction toggle, and celebration |
| `src/service-worker.js` | Optional install-time cache and cache-first static asset retrieval |
| `src/manifest.webmanifest` | Modern PWA name, colors, standalone display mode, scope, and icons |
| `build.mjs` | Image processing, CSS bundling, JavaScript compilation, placeholder rendering, and versioned output |
| `tests/app.test.cjs` | Isolated DOM-level game behavior tests |
| `tests/compatibility.test.cjs` | Static assertions against generated browser assets |
| `vercel.json` | Build output and cache-control policy |

## Runtime model

The page uses one immediately invoked function expression. Its state is private and is reset for each game.

### State

| Value | Meaning |
| --- | --- |
| `openCards` | Zero, one, or two currently revealed unmatched card elements |
| `matchedPairs` | Number of completed pairs |
| `moves` | Number of two-card comparisons |
| `pairTotal` | Required pair count for the selected board size |
| `locked` | Prevents input while a mismatched pair remains visible |
| `startedAt` | Timestamp of the first valid card activation |
| `timerId` | Active elapsed-time interval |
| `mismatchTimerId` | Pending timeout that closes a mismatch |
| `confettiCanvas` | Active completion-effect canvas, if any |
| `confettiFrameId` | Animation frame or timeout used by the effect |

No game state is written to storage. Reloading starts a new game.

### Game state transitions

```text
New game
   |
   v
Waiting for first card
   |
   | activate face-down card
   v
Waiting for second card
   |
   +-- same card --> unchanged
   |
   +-- matching card --> mark both matched
   |                       |
   |                       +-- all pairs matched --> complete
   |                       |
   |                       +-- pairs remain --> wait for first card
   |
   +-- different card --> lock input --> show mismatch
                                             |
                                             v
                                      close after delay
                                             |
                                             v
                                      wait for first card
```

Reset cancels both timers, removes the celebration, clears state, creates a shuffled board, and returns to the initial state.

## Card representation

Each card is a native `<button>` created at runtime. Data attributes hold its pair identity, visible sequence number, and matched state. ARIA state communicates whether the card is face up.

The image remains in the DOM but is hidden while the card is face down. The decorative cover is ignored by assistive technology.

Native buttons were selected because they provide:

- keyboard activation;
- focus behavior;
- disabled state after matching;
- button semantics;
- reliable event targets across old browsers.

## Input design

Every card registers two activation events:

```text
touchend --> prevent default --> choose card
click -------------------------> choose card
```

The explicit `touchend` path addresses tap activation failures observed on Safari 10 in iOS 10.3.3. Preventing the default handled touch suppresses the delayed synthetic click, ensuring a tap produces one game action rather than two.

The same `chooseCard` function enforces state rules for every input method:

1. Start the timer on the first attempted card activation.
2. Ignore input while the board is locked.
3. Ignore an already open or matched card.
4. Reveal a valid card.
5. Compare after the second valid card.

## Browser compatibility design

### Progressive enhancement boundary

The core page requires only:

- classic JavaScript execution;
- DOM events and element creation;
- basic timers;
- JPEG and PNG decoding;
- conservative CSS and Flexbox.

The following features are enhancements:

- service-worker caching;
- standard web app manifest installation;
- safe-area insets;
- reduced-motion media queries;
- animation frames;
- Canvas celebration.

Every enhancement is guarded or has a fallback. Failure of an enhancement must not prevent gameplay.

### JavaScript

All page and worker JavaScript passes through esbuild with `target: "safari10"`. This prevents future source changes from accidentally shipping syntax Safari 10 cannot parse.

The source also uses conservative APIs because compilation cannot polyfill missing browser features. Optional APIs are feature-detected at their call sites.

The page uses a classic deferred script instead of an ES module. Build placeholders are replaced before compilation so generated output is valid and testable.

### CSS

The stylesheet includes:

- prefixed and unprefixed Flexbox declarations;
- plain values before optional `env()` safe-area expressions;
- a `100vh` viewport fallback;
- native control normalization with `-webkit-appearance`;
- touch feedback and disabled-state behavior;
- fixed dimensions that remain practical on older iPads;
- media queries that progressively refine, rather than enable, the layout.

Unsupported declarations may be ignored without making the board unusable.

### iOS Home Screen support

Modern browsers consume the standard manifest. iOS 10.3 ignores it, so `index.html` separately provides:

- `apple-mobile-web-app-capable`;
- `apple-mobile-web-app-status-bar-style`;
- `apple-mobile-web-app-title`;
- `apple-touch-icon`.

On iOS 10.3, Add to Home Screen does not imply service-worker-backed offline use. The application remains network-dependent on that platform.

## Build design

The build is intentionally deterministic and recreates `dist/` from scratch.

### Image processing

Sharp:

1. reads the original JPEG;
2. applies orientation metadata;
3. crops and resizes it to 720 by 720 pixels;
4. writes a non-progressive JPEG;
5. excludes original metadata from the generated deployment file.

The build also creates 192 and 512 pixel PNG icons.

Non-progressive JPEG was selected as a conservative decoding choice for old Safari and constrained devices.

### Code generation

The build:

1. generates versioned card names;
2. bundles CSS for Safari 10;
3. injects image and cache lists;
4. compiles application and worker JavaScript for Safari 10;
5. writes HTML, manifest, scripts, styles, images, and icons to `dist/`.

`dist/` is disposable and must not be edited manually.

## Asset versioning and caching

The deployment uses generation-based asset names such as `app.v7.js`.

### Cache policy

| Resource | Policy | Reason |
| --- | --- | --- |
| `index.html` | Revalidate on every visit | Allows the browser to discover a new asset generation |
| Service worker | Revalidate on every visit | Allows supported browsers to discover cache logic updates |
| Versioned JS, CSS, and images | Cache for one year, immutable | Their URL changes whenever their content changes |

Replacing an immutable file without changing its URL is invalid release behavior. A device can otherwise retain a broken file for the full cache lifetime.

### Release invariant

All references must agree on one asset generation:

- generated filenames;
- HTML links and scripts;
- manifest icons;
- service-worker registration;
- service-worker cache name and asset list;
- Vercel header routes;
- tests and documentation.

The compatibility suite catches several forms of mismatch, and the deployment workflow verifies the live script after release.

## Service-worker design

The service worker is deliberately small:

- Install: cache the application shell and generated images.
- Activate: delete older named caches.
- Navigation fetch: prefer the network and fall back to cached `index.html`.
- Asset fetch: prefer a cached response, otherwise use the network.

Registration is guarded by `"serviceWorker" in navigator` and happens after window load. Registration success changes only the informational offline message. Registration failure leaves the online application fully usable.

iOS 10.3 never loads the worker because it does not expose the service-worker API.

## Accessibility design

The application includes:

- semantic headings and form controls;
- native buttons for cards and actions;
- a labeled board group;
- `aria-pressed` for card face state;
- card labels that distinguish face-down and revealed states;
- image alternative text;
- an `aria-live` status region;
- visible keyboard focus;
- status values that retain left-to-right number formatting in RTL mode;
- a reduced-motion path that skips confetti;
- a no-JavaScript explanation.

Matched cards become disabled and remain visible, preserving the completed board.

Accessibility testing in jsdom verifies state and text. Keyboard order, screen-reader pronunciation, contrast under device settings, and real focus behavior still require browser and assistive-technology testing.

## Bidirectional layout

The direction control changes the root document direction between `ltr` and `rtl`. CSS uses targeted RTL overrides for margins that predate broad logical-property support.

Numbers and elapsed time retain `dir="ltr"` so their ordering stays readable within an RTL page.

## Performance

The application minimizes work on old hardware:

- no framework runtime;
- no backend round trips after static asset loading;
- deployment-sized images rather than original photos;
- no continuous animation during gameplay;
- one one-second timer only after play starts;
- a bounded completion animation;
- static DOM sizes of at most 14 cards;
- immutable caching for large assets.

The completion canvas uses the device pixel ratio for clarity. Its particle count and duration are bounded, and reduced-motion users skip it entirely.

## Privacy and security

The application does not collect, transmit, or persist game or user data. Original source photos are processed into resized deployment files without copied metadata.

The product still exposes its deployment images publicly because it is a public static site. Only photographs approved for public hosting should be placed in `assets/`.

There is no user-provided HTML. The only HTML string inserted by the game is a fixed decorative card-cover fragment.

## Failure behavior

| Failure | User-visible behavior |
| --- | --- |
| JavaScript disabled | Instructions and an explanatory fallback remain visible; gameplay is unavailable |
| Service workers unsupported | Game works online; offline note explains the limitation |
| Service-worker registration fails | Game works online; note reports offline setup was unavailable |
| Canvas unavailable | Game completes without confetti |
| Reduced motion requested | Game completes without confetti |
| Animation frames unavailable | Completion animation uses a 16 ms timeout |
| Safe-area CSS unsupported | Base page padding remains active |
| Manifest unsupported | Apple metadata still supports iOS Home Screen presentation |

Image load failure is not currently replaced with a custom placeholder. This is a known limitation.

## Testing strategy

The project has two complementary suites.

### DOM behavior tests

Each test creates a new jsdom window, installs controlled timers and browser fakes, evaluates the generated application, and asserts observable DOM behavior.

This suite verifies state transitions, card multiplicity, timers, matching, locking, resets, completion, touch activation, direction changes, and service-worker messages.

### Generated compatibility tests

Static checks read the files under `dist/`. They verify the actual deployment contract rather than assuming source files and build configuration produced compatible output.

Physical-device testing remains the acceptance test for old iOS touch behavior.

## Extension guidance

### Adding images

Update the build image list and the accessible image-label list together. The number of unique images must support the largest available board.

### Adding a browser feature

Before using a new API:

1. Check whether Safari 10 supports it.
2. Prefer a conservative existing API when practical.
3. Add feature detection and a non-fatal fallback.
4. Add a behavior test.
5. Add a generated compatibility assertion when the requirement can be checked statically.
6. Test the generated deployment on the oldest supported physical device.

### Changing deployable code or assets

Increment the asset generation and service-worker cache name. Update every reference listed in the release invariant, then run the complete test suite.

### Adding persistent state

Persistence would change the current privacy and state model. A design change should specify:

- supported storage API on Safari 10;
- schema and migration behavior;
- storage failure behavior;
- reset and privacy controls;
- interaction with private browsing and low-storage devices.

Do not add persistence as an implicit side effect.

## Known limitations

- iOS 10.3 requires a network connection.
- A game does not survive reload or navigation.
- Physical-device behavior is not automated in CI.
- The asset generation is repeated across several source and configuration files.
- The service worker uses a simple application-shell strategy rather than sophisticated expiration or quota management.
- Missing images do not have a custom in-game recovery state.
- The completion animation is visually tested only on real browsers.

## Design decisions

| Decision | Rationale |
| --- | --- |
| Framework-free browser code | Minimizes payload, build complexity, and old-browser runtime risk |
| Runtime-created card buttons | Keeps card state and accessible labels synchronized |
| Explicit `touchend` plus `click` | Fixes card taps on iOS 10.3 while preserving desktop and keyboard behavior |
| Service worker as enhancement | Allows iOS 10.3 gameplay despite missing PWA APIs |
| Safari 10 compilation target | Prevents unsupported syntax from entering production |
| Generated-output compatibility tests | Verifies what users download rather than only source intent |
| JPEG cards and PNG icons | Uses image formats available on the oldest target |
| Versioned immutable assets | Combines long-lived caching with reliable updates |
| No persistence | Keeps the game simple and avoids storage compatibility and privacy concerns |

