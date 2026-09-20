(function () {
  "use strict";

  var imageSources = __CARD_IMAGES__;
  var imageLabels = [
    "Walking by the stairs",
    "Portrait in a white shirt",
    "Smiling with a straw",
    "Curly-haired side profile",
    "Playing at the table",
    "Wearing a bicycle helmet",
    "Playing in the farm tent"
  ];
  var board = document.getElementById("board");
  var controls = document.getElementById("game-controls");
  var countSelect = document.getElementById("card-count");
  var movesOutput = document.getElementById("moves");
  var matchesOutput = document.getElementById("matches");
  var timeOutput = document.getElementById("time");
  var statusOutput = document.getElementById("status");
  var directionToggle = document.getElementById("direction-toggle");
  var openCards = [];
  var matchedPairs = 0;
  var moves = 0;
  var pairTotal = 4;
  var locked = false;
  var startedAt = 0;
  var timerId = 0;
  var mismatchTimerId = 0;

  function shuffle(items) {
    var index;
    var randomIndex;
    var temporary;
    for (index = items.length - 1; index > 0; index -= 1) {
      randomIndex = Math.floor(Math.random() * (index + 1));
      temporary = items[index];
      items[index] = items[randomIndex];
      items[randomIndex] = temporary;
    }
    return items;
  }

  function formatTime(totalSeconds) {
    var minutes = Math.floor(totalSeconds / 60);
    var seconds = totalSeconds % 60;
    return minutes + ":" + (seconds < 10 ? "0" : "") + seconds;
  }

  function updateTimer() {
    timeOutput.textContent = formatTime(Math.floor((new Date().getTime() - startedAt) / 1000));
  }

  function startTimer() {
    if (!startedAt) {
      startedAt = new Date().getTime();
      timerId = window.setInterval(updateTimer, 1000);
    }
  }

  function setCardState(card, isOpen) {
    var image = card.getElementsByTagName("img")[0];
    var cover = card.getElementsByClassName("card-cover")[0];
    card.setAttribute("aria-pressed", isOpen ? "true" : "false");
    card.setAttribute("aria-label", isOpen ? "Card " + card.getAttribute("data-number") + ": " + image.alt : "Card " + card.getAttribute("data-number") + ", face down");
    image.style.display = isOpen ? "block" : "none";
    cover.style.display = isOpen ? "none" : "block";
  }

  function closeMismatch() {
    setCardState(openCards[0], false);
    setCardState(openCards[1], false);
    openCards = [];
    locked = false;
    statusOutput.textContent = "Not a match. Try again.";
    mismatchTimerId = 0;
  }

  function finishGame() {
    window.clearInterval(timerId);
    updateTimer();
    statusOutput.textContent = "You found every pair in " + moves + " moves!";
    board.className += " is-complete";
  }

  function chooseCard(event) {
    var card = event.currentTarget;
    var first;
    startTimer();
    if (locked || card.getAttribute("aria-pressed") === "true" || card.getAttribute("data-matched") === "true") {
      return;
    }
    setCardState(card, true);
    openCards.push(card);
    if (openCards.length === 1) {
      statusOutput.textContent = "One card open. Choose its match.";
      return;
    }
    moves += 1;
    movesOutput.textContent = String(moves);
    first = openCards[0];
    if (first.getAttribute("data-pair") === card.getAttribute("data-pair")) {
      first.setAttribute("data-matched", "true");
      card.setAttribute("data-matched", "true");
      first.disabled = true;
      card.disabled = true;
      matchedPairs += 1;
      matchesOutput.textContent = matchedPairs + " / " + pairTotal;
      openCards = [];
      statusOutput.textContent = "A match! Keep going.";
      if (matchedPairs === pairTotal) {
        finishGame();
      }
    } else {
      locked = true;
      statusOutput.textContent = "Take a good look...";
      mismatchTimerId = window.setTimeout(closeMismatch, 900);
    }
  }

  function makeCard(pairIndex, cardIndex) {
    var card = document.createElement("button");
    var image = document.createElement("img");
    var cover = document.createElement("span");
    var accessibleNumber = cardIndex + 1;
    card.type = "button";
    card.className = "memory-card";
    card.setAttribute("data-pair", String(pairIndex));
    card.setAttribute("data-number", String(accessibleNumber));
    card.setAttribute("data-matched", "false");
    card.setAttribute("aria-pressed", "false");
    card.setAttribute("aria-label", "Card " + accessibleNumber + ", face down");
    image.src = imageSources[pairIndex];
    image.alt = imageLabels[pairIndex];
    image.width = 720;
    image.height = 720;
    image.style.display = "none";
    cover.className = "card-cover";
    cover.setAttribute("aria-hidden", "true");
    cover.innerHTML = "<span class=\"cover-mark\"></span>";
    card.appendChild(image);
    card.appendChild(cover);
    card.addEventListener("click", chooseCard, false);
    return card;
  }

  function resetGame(event) {
    var cards = [];
    var pairIndex;
    var cardIndex;
    if (event) {
      event.preventDefault();
    }
    window.clearInterval(timerId);
    window.clearTimeout(mismatchTimerId);
    pairTotal = parseInt(countSelect.value, 10) / 2;
    openCards = [];
    matchedPairs = 0;
    moves = 0;
    locked = false;
    startedAt = 0;
    timerId = 0;
    mismatchTimerId = 0;
    movesOutput.textContent = "0";
    matchesOutput.textContent = "0 / " + pairTotal;
    timeOutput.textContent = "0:00";
    statusOutput.textContent = "Choose two cards to begin.";
    board.className = "board cards-" + (pairTotal * 2);
    while (board.firstChild) {
      board.removeChild(board.firstChild);
    }
    for (pairIndex = 0; pairIndex < pairTotal; pairIndex += 1) {
      cards.push(pairIndex, pairIndex);
    }
    shuffle(cards);
    for (cardIndex = 0; cardIndex < cards.length; cardIndex += 1) {
      board.appendChild(makeCard(cards[cardIndex], cardIndex));
    }
  }

  function toggleDirection() {
    var documentElement = document.documentElement;
    var isRtl = documentElement.getAttribute("dir") === "rtl";
    documentElement.setAttribute("dir", isRtl ? "ltr" : "rtl");
    directionToggle.textContent = isRtl ? "RTL" : "LTR";
  }

  controls.addEventListener("submit", resetGame, false);
  directionToggle.addEventListener("click", toggleDirection, false);
  resetGame();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("service-worker.v4.js").then(function () {
        document.getElementById("offline-note").textContent = "Ready for offline play after this visit.";
      }, function () {
        document.getElementById("offline-note").textContent = "Offline setup was unavailable. The game still works while online.";
      });
    }, false);
  }
}());