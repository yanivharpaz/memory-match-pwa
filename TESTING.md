# Unit Testing Guide

This document explains how the Memory Match automated tests work, what they verify, how to run and debug them, and how to extend the suite without making it flaky.

## Contents

- [Testing goals](#testing-goals)
- [Test stack](#test-stack)
- [Suite layout](#suite-layout)
- [How the test command works](#how-the-test-command-works)
- [DOM test harness](#dom-test-harness)
- [Detailed unit test inventory](#detailed-unit-test-inventory)
- [Safari compatibility checks](#safari-compatibility-checks)
- [Determinism and isolation](#determinism-and-isolation)
- [Writing new tests](#writing-new-tests)
- [Debugging failures](#debugging-failures)
- [Coverage boundaries](#coverage-boundaries)
- [Continuous integration](#continuous-integration)

## Testing goals

The suite protects the behavior a player can observe rather than private implementation details. This is important because the browser application in `src/app.js` is an immediately invoked function expression (IIFE): its internal functions and state are intentionally not exported.

The tests therefore exercise the built application through the same surfaces available to a browser user:

- DOM elements and attributes
- Button clicks and form submissions
- Visible score, timer, match, and status text
- Card image and cover visibility
- Accessibility labels and pressed states
- Disabled matched cards
- Scheduled timeout and interval callbacks
- Reading-direction controls
- Completion effects and reduced-motion preferences
- Service-worker registration results

The suite has two complementary responsibilities:

1. `tests/app.test.cjs` verifies gameplay and browser-facing behavior in jsdom.
2. `tests/compatibility.test.cjs` verifies that generated assets retain the Safari 10 and iOS 10.3 compatibility contract.

Together, these checks catch behavioral regressions and accidental changes to the supported browser baseline.

## Test stack

The project intentionally uses a small test stack:

| Tool | Purpose |
| --- | --- |
| Node.js test runner | Discovers tests, reports subtests, and sets the process exit code. |
| `node:assert/strict` | Performs strict assertions in the gameplay unit tests. |
| jsdom | Provides a DOM, events, elements, and browser-like globals without launching a browser. |
| Existing build script | Produces the exact HTML, JavaScript, CSS, service worker, and image paths tested by the suite. |

There is no separate test framework configuration file. The relevant command is declared directly in `package.json`:

```json
{
  "scripts": {
    "test": "npm run build && node --test tests/*.test.cjs"
  }
}
```

The `.cjs` extension is deliberate. It allows the tests to use CommonJS `require()` calls while `build.mjs` remains an ES module.

## Suite layout

```text
tests/
├── app.test.cjs            # DOM-level unit tests for game behavior
└── compatibility.test.cjs  # Static checks for generated browser assets
```

The gameplay suite reads:

```text
dist/index.html
dist/app.v6.js
```

The compatibility suite additionally reads:

```text
dist/styles.v6.css
dist/service-worker.v6.js
```

Because both suites consume `dist`, a build must exist before either test file is run directly. The standard `npm test` command handles this automatically.

## How the test command works

Run the complete suite with:

```sh
npm test
```

The command performs these steps in order:

1. Deletes and recreates `dist` through `build.mjs`.
2. Processes the source photos into deployment-sized images.
3. Bundles and minifies the stylesheet for Safari 10.
4. Replaces build placeholders such as `__CARD_IMAGES__`.
5. Writes the versioned application and service-worker assets.
6. Runs every `tests/*.test.cjs` file with Node's test runner.

To run only the gameplay unit tests while iterating:

```sh
npm run build
node --test tests/app.test.cjs
```

To run only the compatibility checks:

```sh
npm run build
node --test tests/compatibility.test.cjs
```

Rebuild before a direct test run whenever files under `src/` or the build process have changed. Otherwise, the tests will execute stale files from `dist`.

## DOM test harness

The `createGame(options)` helper creates an isolated game for each test. It is the central test fixture and is responsible for making browser behavior deterministic.

### Fresh document per test

Each call creates a new jsdom instance from the generated page:

```js
const dom = new JSDOM(html, {
  runScripts: "outside-only",
  url: "https://memory-match.test/"
});
```

`runScripts: "outside-only"` prevents scripts referenced by the HTML from loading automatically. The test explicitly evaluates `dist/app.v6.js` once after installing all fakes. This guarantees that application startup observes the controlled environment.

The fixed HTTPS URL gives the document a stable origin and represents the secure context normally required by PWA functionality.

### Controlled clock

The harness replaces `window.Date` with `FakeDate`. The initial timestamp is `1000`, and `advanceTo(value)` moves it to an exact millisecond value.

This makes elapsed-time assertions immediate and reliable. For example, advancing from `1000` to `66000` represents 65 elapsed seconds and must render as `1:05`.

The clock does not advance by itself. A test must explicitly call `advanceTo()` and then invoke the relevant timer callback.

### Captured timeouts and intervals

The harness replaces:

- `window.setTimeout`
- `window.clearTimeout`
- `window.setInterval`
- `window.clearInterval`

Scheduled callbacks are stored in `Map` objects instead of running in real time. The returned timer IDs behave like normal browser timer IDs for the application.

The returned game fixture exposes:

- `intervals`: active repeating timers
- `timeouts`: active one-shot timers
- `runInterval()`: invokes the single expected interval callback
- `runTimeout(delay)`: finds and invokes a timeout with the requested delay

This design allows the 900 ms mismatch delay, one-second timer interval, and 16 ms animation fallback to be tested without sleeping. It also allows reset and completion tests to prove that pending work was canceled.

### Deterministic shuffle

By default, `window.Math.random` always returns `0.999999`. The Fisher-Yates shuffle therefore swaps each item with itself, preserving the generated pair sequence:

```text
0, 0, 1, 1, 2, 2, ...
```

As a result:

- cards 0 and 1 form a match;
- cards 0 and 2 form a mismatch;
- adjacent card pairs can finish a board predictably.

`createGame({ random })` can inject another random function when a test specifically needs a different arrangement.

### Reduced motion

The harness supplies `window.matchMedia()`. Reduced motion is enabled by default because most tests do not need to execute animation work:

```js
createGame(); // reduced motion is enabled
```

The confetti test opts into motion:

```js
createGame({ reducedMotion: false, canvas: context });
```

This default improves isolation and mirrors the expectation that completion must remain functional when animation is disabled for accessibility.

### Canvas support

jsdom does not provide a complete Canvas 2D implementation. When a `canvas` context is supplied, the harness wraps `document.createElement()` and gives newly created canvas elements a controlled `getContext()` result.

The fake context implements only the methods the application calls:

- `clearRect`
- `fillRect`
- `restore`
- `rotate`
- `save`
- `scale`
- `translate`

The test is interested in animation lifecycle and overlay properties, not rendered pixels. Pixel-level visual correctness belongs in a real-browser visual test.

### Service-worker injection

When `createGame({ serviceWorker })` is used, the helper defines `navigator.serviceWorker` before evaluating the application. Tests can then supply a `register()` method that returns either a resolved or rejected promise.

After dispatching the window `load` event, the tests await a promise turn so the application's success or failure handler can update the offline status message.

### Cleanup

Every gameplay test ends with:

```js
game.dom.window.close();
```

Closing the window releases the jsdom document and associated resources. New tests should preserve this cleanup pattern, even when all timers are faked.

## Detailed unit test inventory

### 1. Initial board and accessibility

Test: `initializes an accessible eight-card board with four pairs`

This test verifies the default state created during application startup:

- Eight card buttons exist.
- The board receives the `board cards-8` layout classes.
- Moves begin at `0`.
- Match progress begins at `0 / 4`.
- Time begins at `0:00`.
- Every card receives a sequential, one-based `data-number`.
- Every card is initially unpressed.
- Every card announces itself as face down.
- Card images are hidden.
- Card covers are not hidden.
- Each pair identifier appears exactly twice.

This test protects board construction, score initialization, pair generation, and the initial screen-reader contract in one startup scenario.

### 2. First card selection and repeated clicks

Test: `opens one card, starts the timer once, and ignores a repeated click`

The test clicks the same card twice and verifies:

- The card remains open.
- `aria-pressed` changes to `true`.
- The accessible label includes the card number and image description.
- The image becomes visible.
- The status asks the player to choose a match.
- No move is counted until a second distinct card is chosen.
- Exactly one timer interval exists.

This catches duplicate selection bugs and accidental timer restarts.

### 3. Elapsed-time formatting

Test: `formats elapsed time after the first card is chosen`

The test starts the timer, advances the controlled clock by 65 seconds, invokes the interval callback, and expects `1:05`.

It covers:

- Timer start on the first selection
- Millisecond-to-second conversion
- Minute calculation
- Leading zero formatting for seconds below 10

### 4. Successful match

Test: `keeps a matching pair open and updates progress`

The deterministic board guarantees that the first two cards match. After both are clicked, the test verifies:

- One move is counted.
- Match progress becomes `1 / 4`.
- The success status is displayed.
- Both cards have `data-matched="true"`.
- Both card buttons are disabled.
- Both cards remain visibly open through `aria-pressed="true"`.

Disabling matched buttons prevents keyboard, touch, and pointer users from selecting completed cards again.

### 5. Mismatch locking and recovery

Test: `locks mismatched cards until they close`

The test selects cards from two different pairs, then attempts to select a third card while the mismatch is visible.

Before the timeout runs, it verifies:

- One move was counted.
- The third card stayed closed.
- The player is told to take a look at the mismatch.

After manually running the 900 ms timeout, it verifies:

- Both mismatched cards close.
- The status encourages another attempt.
- A new card can be opened, proving that the board lock was released.

This protects the critical `locked` state and prevents players from opening more than two cards during mismatch resolution.

### 6. Reset and board-size changes

Test: `reset cancels pending work and creates the selected board size`

The test deliberately starts both the elapsed timer and a pending mismatch timeout before submitting a new game with six cards.

It then verifies:

- The old board is replaced by six cards.
- The board receives `board cards-6`.
- Moves return to `0`.
- Match progress changes to `0 / 3`.
- Time returns to `0:00`.
- The initial instruction is restored.
- No interval remains active.
- No timeout remains active.

The timer assertions are especially important. Without cancellation, callbacks from a previous game could mutate the new game's UI.

### 7. Completion with reduced motion

Test: `finishes a game, stops the timer, and honors reduced motion`

The test uses a six-card board and matches all three adjacent pairs. It verifies:

- The game ends in exactly three moves.
- Progress reaches `3 / 3`.
- The final message includes the move count.
- The board receives `is-complete`.
- The elapsed-time interval is canceled.
- No confetti canvas is created when reduced motion is preferred.

This covers the complete-game transition and ensures that accessibility preferences do not interfere with successful completion.

### 8. Confetti lifecycle

Test: `adds and removes the confetti canvas when motion is allowed`

This scenario enables motion and provides a fake Canvas 2D context. After completing the board, it verifies that the overlay:

- Exists with the `confetti-layer` class.
- Is hidden from assistive technology with `aria-hidden="true"`.
- Does not intercept input because `pointer-events` is `none`.
- Has a transparent background.

The test then advances beyond the animation duration and runs the queued 16 ms frame fallback. It expects the canvas to be removed from the document.

This confirms both setup and cleanup. A completion effect that is never removed would leave unnecessary DOM and animation state behind.

### 9. Reading direction

Test: `toggles document direction and the control label`

The test clicks the direction control twice:

1. The first click changes the document to `dir="rtl"` and changes the control label to `LTR`.
2. The second click restores `dir="ltr"` and changes the control label to `RTL`.

The control label describes the direction available on the next click, not the currently active direction.

### 10. Service-worker success and failure

Test: `reports successful and failed offline setup`

This parent test contains two subtests.

#### Successful registration

The fake registration promise resolves. The test verifies:

- The application requests `service-worker.v6.js`.
- The offline note reports that the app is ready for offline play after the visit.

#### Failed registration

The fake registration promise rejects. The test verifies that the note explains offline setup was unavailable while confirming that online play still works.

The rejection is intentionally handled by application code. It must not become an unhandled promise rejection or prevent gameplay.

## Safari compatibility checks

`tests/compatibility.test.cjs` performs static assertions against the generated assets. These are contract tests for the project's stated Safari 10 and iOS 10.3 support.

### HTML checks

The generated page must:

- Use a classic deferred script rather than `type="module"`.
- Reference the versioned `app.v6.js` entry point.
- Include the no-JavaScript fallback message.

### JavaScript syntax checks

The generated application and service worker must not contain unsupported modern syntax such as:

- `const`
- `let`
- `class`
- Arrow functions
- Template literals
- Optional chaining
- Nullish coalescing

These checks are intentionally conservative. They guard against source or build changes that bypass transpilation expectations.

### Completion-effect checks

The generated application must retain:

- Canvas creation
- A 16 ms `setTimeout` animation-frame fallback
- The Canvas 2D context path
- A transparent overlay
- Non-blocking pointer behavior

It must not depend on `Path2D` or the Web Animations API's `.animate()` method.

### CSS checks

The generated stylesheet must retain:

- The `-webkit-flex` fallback
- A `100vh` minimum-height fallback

These assertions protect layout behavior on the oldest supported WebKit versions.

## Determinism and isolation

Reliable tests must produce the same result regardless of machine speed or random values. The suite achieves this through several rules:

- Never wait for real time to pass.
- Never depend on the real output of `Math.random()`.
- Never depend on a real service worker or network connection.
- Never depend on native Canvas rendering.
- Create a new jsdom window for every test.
- Close every jsdom window after the test.
- Assert through DOM behavior rather than reaching into private closure state.

The suite currently runs quickly because all long waits are simulated. Avoid introducing `setTimeout`-based sleeps into tests.

## Writing new tests

### Choose the right suite

Add a case to `tests/app.test.cjs` when it concerns interactive behavior, state transitions, accessibility state, or user-visible text.

Add a case to `tests/compatibility.test.cjs` when it concerns the generated syntax, required fallbacks, versioned asset references, or another static deployment contract.

### Basic gameplay test pattern

```js
test("describes the expected behavior", function () {
  const game = createGame();
  const gameCards = cards(game);

  gameCards[0].click();

  assert.equal(game.document.getElementById("status").textContent, "Expected text");
  game.dom.window.close();
});
```

Use player actions such as `.click()` and `dispatchEvent()` instead of calling application internals. This keeps tests resilient to internal refactoring.

### Testing a board size

Use the shared form helper:

```js
selectCardCount(game, 10);
assert.equal(cards(game).length, 10);
```

This submits the same form a player uses and therefore covers the event wiring as well as reset behavior.

### Testing time

Start the timer through a card click, move the fake clock, and invoke the captured interval:

```js
cards(game)[0].click();
game.advanceTo(121000);
game.runInterval();
```

Do not call the real Node timer APIs or sleep.

### Testing delayed mismatch behavior

Use the known application delay:

```js
cards(game)[0].click();
cards(game)[2].click();
game.runTimeout(900);
```

If the product delay intentionally changes, update both the application and the expectation. A failure here is useful because it highlights a user-experience timing change.

### Testing asynchronous browser APIs

Return or await promises from the test. After dispatching the event that begins promise work, await the required microtask turn before asserting:

```js
game.window.dispatchEvent(new game.window.Event("load"));
await Promise.resolve();
```

### Assertion quality

Prefer assertions that describe observable outcomes and invariants:

- Exact counts for cards, moves, matches, and active timers
- Exact status text when wording is part of the UI contract
- Exact ARIA state for accessibility behavior
- Presence or absence of state classes
- Pair multiplicity rather than assumptions about image filenames

Avoid assertions tied to incidental DOM serialization, internal variable names, or the order of object properties unless that order is itself required.

## Debugging failures

### A test cannot find `dist` files

Run the build first:

```sh
npm run build
node --test tests/app.test.cjs
```

The standard `npm test` command is usually preferable because it always creates fresh artifacts.

### Card order is unexpected

Confirm that the test uses `createGame()` and has not replaced the default random function. The default deterministic random value preserves adjacent pairs.

If a scenario injects a custom random function, assert the resulting pair IDs before relying on specific card indexes.

### A timeout cannot be found

`runTimeout(delay)` requires an active timeout with that exact delay. Check that the action scheduling the timeout occurred and that another action, such as reset, did not cancel it.

The common application delays are:

- `900` ms for closing a mismatch
- `16` ms for the animation-frame fallback

### The interval helper fails

`runInterval()` intentionally asserts that exactly one interval is active. A failure means either the timer was never started or multiple intervals were created. Both are meaningful behavior problems worth investigating.

### Canvas methods are missing

Extend the fake context only when production code starts using another Canvas 2D method. Keep the fake minimal and avoid testing browser rendering algorithms through jsdom.

### Service-worker status did not update

Verify that:

- `navigator.serviceWorker` was injected before the application script was evaluated;
- a `load` event was dispatched;
- the test awaited the registration promise handler.

### Compatibility syntax check fails

Inspect the generated file in `dist`, then determine whether:

- unsupported source syntax was copied directly by `build.mjs`;
- a new dependency introduced unsupported output;
- the compatibility expression needs refinement because it matched content inside a string.

Do not remove a compatibility assertion merely to make the suite pass. Confirm the generated code still executes on the supported browser baseline.

## Coverage boundaries

The suite is comprehensive for core game state and generated compatibility contracts, but it is not a substitute for every type of testing.

### Covered well

- Initial board creation
- Pair multiplicity
- Card open and closed states
- Match and mismatch transitions
- Input locking
- Move and match counters
- Timer start, formatting, and cancellation
- Reset behavior
- Board-size changes
- Completion state
- Reduced-motion handling
- Confetti DOM lifecycle
- Direction switching
- Service-worker status messaging
- Safari 10 syntax and fallback contracts

### Not covered by jsdom

- Actual layout at mobile and desktop viewport sizes
- CSS rendering and image cropping
- Touch behavior on physical iOS devices
- Keyboard tab order in a real browser
- Screen-reader pronunciation
- Canvas pixel output and animation smoothness
- Real service-worker installation, caching, updates, and offline fetches
- Image decoding failures
- Browser storage limits
- Performance on older devices

Those areas require real-browser end-to-end tests, visual regression tests, accessibility tooling, or manual device checks.

### No numeric coverage threshold

The project does not currently instrument statement, branch, or function coverage. The suite favors explicit behavior scenarios because application functions are enclosed in an IIFE and the tests intentionally execute the generated browser asset.

If numeric coverage is introduced later, it should supplement these behavior tests rather than replace them. Instrumentation must also avoid changing the Safari-compatible production output.

## Continuous integration

A CI job needs only a supported Node.js installation and the standard npm workflow:

```sh
npm ci
npm test
```

`npm ci` installs the exact versions recorded in `package-lock.json`. `npm test` then rebuilds all generated assets and runs both suites. A nonzero exit code from the build, any assertion, or the Node test runner should fail the job.

Because image processing is part of the build, CI must retain the source files under `assets/` and allow the native `sharp` dependency to install for the runner platform.

Generated `dist` files do not need to be trusted from a previous job or local checkout. The test command recreates them, ensuring that assertions always describe artifacts produced from the current source.