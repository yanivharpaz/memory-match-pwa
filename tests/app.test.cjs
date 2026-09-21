const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const { JSDOM } = require("jsdom");

const html = fs.readFileSync("dist/index.html", "utf8");
const script = fs.readFileSync("dist/app.v6.js", "utf8");

function createGame(options) {
  const settings = options || {};
  const dom = new JSDOM(html, {
    runScripts: "outside-only",
    url: "https://memory-match.test/"
  });
  const window = dom.window;
  const timeouts = new Map();
  const intervals = new Map();
  let nextTimerId = 1;
  let now = 1000;

  class FakeDate extends Date {
    constructor() {
      super(now);
    }

    static now() {
      return now;
    }
  }

  window.Date = FakeDate;
  window.Math.random = settings.random || function () { return 0.999999; };
  window.matchMedia = function () {
    return { matches: settings.reducedMotion !== false };
  };
  window.setTimeout = function (callback, delay) {
    const id = nextTimerId;
    nextTimerId += 1;
    timeouts.set(id, { callback, delay });
    return id;
  };
  window.clearTimeout = function (id) {
    timeouts.delete(id);
  };
  window.setInterval = function (callback, delay) {
    const id = nextTimerId;
    nextTimerId += 1;
    intervals.set(id, { callback, delay });
    return id;
  };
  window.clearInterval = function (id) {
    intervals.delete(id);
  };

  if (settings.canvas) {
    const createElement = window.document.createElement.bind(window.document);
    window.document.createElement = function (tagName) {
      const element = createElement(tagName);
      if (String(tagName).toLowerCase() === "canvas") {
        element.getContext = function () { return settings.canvas; };
      }
      return element;
    };
  }

  if (settings.serviceWorker) {
    Object.defineProperty(window.navigator, "serviceWorker", {
      configurable: true,
      value: settings.serviceWorker
    });
  }

  window.eval(script);

  return {
    dom,
    window,
    document: window.document,
    intervals,
    timeouts,
    advanceTo(value) {
      now = value;
    },
    runInterval() {
      assert.equal(intervals.size, 1);
      Array.from(intervals.values())[0].callback();
    },
    runTimeout(delay) {
      const timer = Array.from(timeouts.entries()).find(function (entry) {
        return entry[1].delay === delay;
      });
      assert(timer, "Expected a " + delay + "ms timeout");
      timeouts.delete(timer[0]);
      timer[1].callback();
    }
  };
}

function cards(game) {
  return Array.from(game.document.querySelectorAll(".memory-card"));
}

function selectCardCount(game, count) {
  game.document.getElementById("card-count").value = String(count);
  game.document.getElementById("game-controls").dispatchEvent(new game.window.Event("submit", {
    bubbles: true,
    cancelable: true
  }));
}

test("initializes an accessible eight-card board with four pairs", function () {
  const game = createGame();
  const gameCards = cards(game);
  const pairCounts = {};

  assert.equal(gameCards.length, 8);
  assert.equal(game.document.getElementById("board").className, "board cards-8");
  assert.equal(game.document.getElementById("moves").textContent, "0");
  assert.equal(game.document.getElementById("matches").textContent, "0 / 4");
  assert.equal(game.document.getElementById("time").textContent, "0:00");

  gameCards.forEach(function (card, index) {
    const pair = card.getAttribute("data-pair");
    pairCounts[pair] = (pairCounts[pair] || 0) + 1;
    assert.equal(card.getAttribute("data-number"), String(index + 1));
    assert.equal(card.getAttribute("aria-pressed"), "false");
    assert.equal(card.getAttribute("aria-label"), "Card " + (index + 1) + ", face down");
    assert.equal(card.querySelector("img").style.display, "none");
    assert.notEqual(card.querySelector(".card-cover").style.display, "none");
  });
  assert.deepEqual(Object.values(pairCounts), [2, 2, 2, 2]);
  game.dom.window.close();
});

test("opens one card, starts the timer once, and ignores a repeated click", function () {
  const game = createGame();
  const first = cards(game)[0];

  first.click();
  first.click();

  assert.equal(first.getAttribute("aria-pressed"), "true");
  assert.match(first.getAttribute("aria-label"), /^Card 1: /);
  assert.equal(first.querySelector("img").style.display, "block");
  assert.equal(game.document.getElementById("status").textContent, "One card open. Choose its match.");
  assert.equal(game.document.getElementById("moves").textContent, "0");
  assert.equal(game.intervals.size, 1);
  game.dom.window.close();
});

test("formats elapsed time after the first card is chosen", function () {
  const game = createGame();

  cards(game)[0].click();
  game.advanceTo(66000);
  game.runInterval();

  assert.equal(game.document.getElementById("time").textContent, "1:05");
  game.dom.window.close();
});

test("keeps a matching pair open and updates progress", function () {
  const game = createGame();
  const gameCards = cards(game);

  gameCards[0].click();
  gameCards[1].click();

  assert.equal(game.document.getElementById("moves").textContent, "1");
  assert.equal(game.document.getElementById("matches").textContent, "1 / 4");
  assert.equal(game.document.getElementById("status").textContent, "A match! Keep going.");
  assert.equal(gameCards[0].getAttribute("data-matched"), "true");
  assert.equal(gameCards[1].getAttribute("data-matched"), "true");
  assert.equal(gameCards[0].disabled, true);
  assert.equal(gameCards[1].disabled, true);
  assert.equal(gameCards[0].getAttribute("aria-pressed"), "true");
  game.dom.window.close();
});

test("locks mismatched cards until they close", function () {
  const game = createGame();
  const gameCards = cards(game);

  gameCards[0].click();
  gameCards[2].click();
  gameCards[3].click();

  assert.equal(game.document.getElementById("moves").textContent, "1");
  assert.equal(gameCards[3].getAttribute("aria-pressed"), "false");
  assert.equal(game.document.getElementById("status").textContent, "Take a good look...");
  game.runTimeout(900);
  assert.equal(gameCards[0].getAttribute("aria-pressed"), "false");
  assert.equal(gameCards[2].getAttribute("aria-pressed"), "false");
  assert.equal(game.document.getElementById("status").textContent, "Not a match. Try again.");

  gameCards[3].click();
  assert.equal(gameCards[3].getAttribute("aria-pressed"), "true");
  game.dom.window.close();
});

test("reset cancels pending work and creates the selected board size", function () {
  const game = createGame();
  const initialCards = cards(game);

  initialCards[0].click();
  initialCards[2].click();
  selectCardCount(game, 6);

  assert.equal(cards(game).length, 6);
  assert.equal(game.document.getElementById("board").className, "board cards-6");
  assert.equal(game.document.getElementById("moves").textContent, "0");
  assert.equal(game.document.getElementById("matches").textContent, "0 / 3");
  assert.equal(game.document.getElementById("time").textContent, "0:00");
  assert.equal(game.document.getElementById("status").textContent, "Choose two cards to begin.");
  assert.equal(game.intervals.size, 0);
  assert.equal(game.timeouts.size, 0);
  game.dom.window.close();
});

test("finishes a game, stops the timer, and honors reduced motion", function () {
  const game = createGame();
  selectCardCount(game, 6);
  const gameCards = cards(game);

  for (let index = 0; index < gameCards.length; index += 2) {
    gameCards[index].click();
    gameCards[index + 1].click();
  }

  assert.equal(game.document.getElementById("moves").textContent, "3");
  assert.equal(game.document.getElementById("matches").textContent, "3 / 3");
  assert.equal(game.document.getElementById("status").textContent, "You found every pair in 3 moves!");
  assert.match(game.document.getElementById("board").className, /\bis-complete\b/);
  assert.equal(game.intervals.size, 0);
  assert.equal(game.document.querySelector(".confetti-layer"), null);
  game.dom.window.close();
});

test("adds and removes the confetti canvas when motion is allowed", function () {
  const context = {
    clearRect() {},
    fillRect() {},
    restore() {},
    rotate() {},
    save() {},
    scale() {},
    translate() {}
  };
  const game = createGame({ canvas: context, reducedMotion: false });
  selectCardCount(game, 6);
  const gameCards = cards(game);

  for (let index = 0; index < gameCards.length; index += 2) {
    gameCards[index].click();
    gameCards[index + 1].click();
  }

  const canvas = game.document.querySelector(".confetti-layer");
  assert(canvas);
  assert.equal(canvas.getAttribute("aria-hidden"), "true");
  assert.equal(canvas.style.pointerEvents, "none");
  assert.equal(canvas.style.backgroundColor, "transparent");

  game.advanceTo(4000);
  game.runTimeout(16);
  assert.equal(game.document.querySelector(".confetti-layer"), null);
  game.dom.window.close();
});

test("toggles document direction and the control label", function () {
  const game = createGame();
  const toggle = game.document.getElementById("direction-toggle");

  toggle.click();
  assert.equal(game.document.documentElement.getAttribute("dir"), "rtl");
  assert.equal(toggle.textContent, "LTR");
  toggle.click();
  assert.equal(game.document.documentElement.getAttribute("dir"), "ltr");
  assert.equal(toggle.textContent, "RTL");
  game.dom.window.close();
});

test("reports successful and failed offline setup", async function (t) {
  await t.test("success", async function () {
    const registrations = [];
    const game = createGame({
      serviceWorker: {
        register(url) {
          registrations.push(url);
          return Promise.resolve();
        }
      }
    });

    game.window.dispatchEvent(new game.window.Event("load"));
    await Promise.resolve();
    assert.deepEqual(registrations, ["service-worker.v6.js"]);
    assert.equal(game.document.getElementById("offline-note").textContent, "Ready for offline play after this visit.");
    game.dom.window.close();
  });

  await t.test("failure", async function () {
    const game = createGame({
      serviceWorker: {
        register() {
          return Promise.reject(new Error("offline"));
        }
      }
    });

    game.window.dispatchEvent(new game.window.Event("load"));
    await Promise.resolve();
    assert.equal(game.document.getElementById("offline-note").textContent, "Offline setup was unavailable. The game still works while online.");
    game.dom.window.close();
  });
});