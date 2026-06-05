import "./styles.css";

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const levelLabel = document.getElementById("levelLabel");
const timerLabel = document.getElementById("timerLabel");
const starLabel = document.getElementById("starLabel");
const statusText = document.getElementById("statusText");
const restartButton = document.getElementById("restartButton");
const levelsButton = document.getElementById("levelsButton");
const levelsDialog = document.getElementById("levelsDialog");
const closeLevelsButton = document.getElementById("closeLevelsButton");
const levelsGrid = document.getElementById("levelsGrid");
const resultDialog = document.getElementById("resultDialog");
const resultEyebrow = document.getElementById("resultEyebrow");
const resultTitle = document.getElementById("resultTitle");
const resultStars = document.getElementById("resultStars");
const resultScore = document.getElementById("resultScore");
const resultTime = document.getElementById("resultTime");
const resultNextText = document.getElementById("resultNextText");
const nextLevelButton = document.getElementById("nextLevelButton");
const replayLevelButton = document.getElementById("replayLevelButton");

const TILE_SIZE = 31;
const ROWS = 21;
const COLS = 21;
const STORAGE_KEY = "survive-progress-v1";
const KILLER_DETECTION_RANGE = 8;
const PLAYER_MOVE_DURATION = 90;
const KILLER_MOVE_DURATION = 80;
const SURVIVOR_WALL_RATIO = 0.25;

const images = {
  player: loadImage("/pic_ob/DBgirl.png"),
  killer: loadImage("/pic_ob/DBknife.png"),
  exit: loadImage("/pic_ob/DBhole.png"),
  trap: loadImage("/pic_ob/DBtrap.png"),
  floor: loadImage("/pic_ob/dirt.png"),
};

const LEVELS = [
  { seed: 1101, tier: "ง่าย", walls: 0.08, traps: 5, minKillerDistance: 18, stars: [24, 36] },
  { seed: 1203, tier: "ง่าย", walls: 0.09, traps: 6, minKillerDistance: 18, stars: [25, 38] },
  { seed: 1307, tier: "ง่าย-กลาง", walls: 0.1, traps: 7, minKillerDistance: 18, stars: [27, 40] },
  { seed: 1409, tier: "กลาง", walls: 0.11, traps: 8, minKillerDistance: 18, stars: [29, 43] },
  { seed: 1511, tier: "กลาง", walls: 0.12, traps: 9, minKillerDistance: 18, stars: [30, 46] },
  { seed: 2101, tier: "กลาง", walls: 0.13, traps: 10, minKillerDistance: 18, stars: [32, 48] },
  { seed: 2203, tier: "กลาง-ยาก", walls: 0.14, traps: 11, minKillerDistance: 15, stars: [34, 51] },
  { seed: 2307, tier: "กลาง-ยาก", walls: 0.15, traps: 12, minKillerDistance: 15, stars: [36, 54] },
  { seed: 2409, tier: "ยาก", walls: 0.16, traps: 13, minKillerDistance: 15, stars: [39, 58] },
  { seed: 2511, tier: "ยาก", walls: 0.17, traps: 14, minKillerDistance: 15, stars: [42, 62] },
  { seed: 3101, tier: "ยาก", walls: 0.18, traps: 15, minKillerDistance: 15, stars: [45, 66] },
  { seed: 3203, tier: "ยาก", walls: 0.19, traps: 16, minKillerDistance: 15, stars: [48, 70] },
  { seed: 3307, tier: "ยากมาก", walls: 0.2, traps: 17, minKillerDistance: 11, stars: [52, 76] },
  { seed: 3409, tier: "ยากมาก", walls: 0.21, traps: 18, minKillerDistance: 11, stars: [56, 82] },
  { seed: 3511, tier: "ยากมาก", walls: 0.22, traps: 19, minKillerDistance: 11, stars: [60, 88] },
  { seed: 3607, tier: "ยากมาก", walls: 0.23, traps: 20, minKillerDistance: 11, stars: [65, 95] },
  { seed: 3713, tier: "ยากมาก", walls: 0.24, traps: 21, minKillerDistance: 11, stars: [70, 102] },
  { seed: 4101, tier: "ยากมากๆ", walls: 0.25, traps: 22, minKillerDistance: 11, stars: [76, 112] },
  { seed: 4203, tier: "ยากมากๆ", walls: 0.26, traps: 23, minKillerDistance: 11, stars: [84, 124] },
  { seed: 4307, tier: "ยากมากๆ", walls: 0.27, traps: 24, minKillerDistance: 11, stars: [92, 138] },
];

let progress = loadProgress();
let currentLevel = 0;
let map = [];
let player;
let killer;
let previousKillerTile = null;
let exitTile;
let killerTrail = [];
let turnCount = 0;
let playerFreeMoves = 0;
let inputLocked = false;
let gameState = "playing";
let levelStartTime = performance.now();
let finishedTime = 0;
let timerId = null;
let autoNextTimeout = null;

function loadImage(src) {
  const image = new Image();
  image.src = src;
  return image;
}

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function buildLevel(index) {
  const config = LEVELS[index];
  const rand = seededRandom(config.seed);

  for (let attempt = 0; attempt < 80; attempt++) {
    const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    const start = pickCornerTile(rand, true);
    const exit = pickCornerTile(rand, false);
    const safePath = carvePath(grid, start, exit, rand);
    const safeKeys = new Set(safePath.map(tileKey));

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const key = tileKey({ x, y });
        if (safeKeys.has(key) || key === tileKey(start) || key === tileKey(exit)) continue;
        if (rand() < config.walls) grid[y][x] = 1;
      }
    }

    placeTraps(grid, config.traps, rand, new Set([...safeKeys, tileKey(start), tileKey(exit)]));
    placeSurvivorWalls(grid, Math.round(countWalls(grid) * SURVIVOR_WALL_RATIO), rand, new Set([...safeKeys, tileKey(start), tileKey(exit)]));
    const killerStart = pickKillerStart(grid, start, exit, rand, config);

    if (
      killerStart &&
      findPath(grid, start, exit, isPlayerWalkable).length > 0 &&
      findPath(grid, killerStart, start, isKillerWalkable).length > 0
    ) {
      return { grid, start, killerStart, exit };
    }
  }

  const fallback = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  return {
    grid: fallback,
    start: { x: 2, y: 18 },
    killerStart: { x: 18, y: 2 },
    exit: { x: 18, y: 18 },
  };
}

function pickCornerTile(rand, isStart) {
  const choices = isStart
    ? [{ x: 2, y: 18 }, { x: 3, y: 17 }, { x: 2, y: 15 }]
    : [{ x: 18, y: 2 }, { x: 17, y: 3 }, { x: 18, y: 5 }];
  return choices[Math.floor(rand() * choices.length)];
}

function carvePath(grid, start, goal, rand) {
  const path = [{ ...start }];
  let current = { ...start };

  while (current.x !== goal.x || current.y !== goal.y) {
    const moves = [];
    if (current.x < goal.x) moves.push({ x: current.x + 1, y: current.y });
    if (current.x > goal.x) moves.push({ x: current.x - 1, y: current.y });
    if (current.y < goal.y) moves.push({ x: current.x, y: current.y + 1 });
    if (current.y > goal.y) moves.push({ x: current.x, y: current.y - 1 });

    current = moves[Math.floor(rand() * moves.length)];
    grid[current.y][current.x] = 0;
    path.push({ ...current });

    if (rand() < 0.28) {
      const side = getNeighbors(grid, current).filter((tile) => tile.x !== goal.x || tile.y !== goal.y);
      if (side.length) path.push(side[Math.floor(rand() * side.length)]);
    }
  }

  return path;
}

function placeTraps(grid, amount, rand, blocked) {
  let placed = 0;
  let guard = 0;

  while (placed < amount && guard < 3000) {
    guard++;
    const x = Math.floor(rand() * COLS);
    const y = Math.floor(rand() * ROWS);
    const key = tileKey({ x, y });

    if (grid[y][x] === 0 && !blocked.has(key)) {
      grid[y][x] = 2;
      placed++;
    }
  }
}

function placeSurvivorWalls(grid, amount, rand, blocked) {
  let placed = 0;
  let guard = 0;

  while (placed < amount && guard < 4000) {
    guard++;
    const x = Math.floor(rand() * COLS);
    const y = Math.floor(rand() * ROWS);
    const key = tileKey({ x, y });

    if (grid[y][x] === 0 && !blocked.has(key) && touchesWall(grid, x, y)) {
      grid[y][x] = 3;
      placed++;
    }
  }
}

function touchesWall(grid, x, y) {
  return [
    { x, y: y - 1 },
    { x, y: y + 1 },
    { x: x - 1, y },
    { x: x + 1, y },
  ].some((tile) => tile.x >= 0 && tile.x < COLS && tile.y >= 0 && tile.y < ROWS && grid[tile.y][tile.x] === 1);
}

function countWalls(grid) {
  return grid.reduce((total, row) => total + row.filter((cell) => cell === 1).length, 0);
}

function pickKillerStart(grid, playerStart, exit, rand, config) {
  const minDistance = config.minKillerDistance;
  const candidates = [];

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const tile = { x, y };
      const distance = distanceBetween(tile, playerStart);
      if (grid[y][x] === 0 && distance >= minDistance && distanceBetween(tile, exit) > 5) {
        candidates.push(tile);
      }
    }
  }

  if (!candidates.length) return null;
  return candidates[Math.floor(rand() * candidates.length)];
}

function startLevel(index) {
  clearAutoNext();
  closeResult();
  const level = buildLevel(index);
  currentLevel = index;
  map = level.grid;
  player = makeActor(level.start);
  killer = makeActor(level.killerStart);
  previousKillerTile = null;
  exitTile = level.exit;
  killerTrail = [];
  turnCount = 0;
  playerFreeMoves = 0;
  inputLocked = false;
  gameState = "playing";
  finishedTime = 0;
  levelStartTime = performance.now();
  updateHud();
  updateTimer();
  startTimer();
  renderLevels();
  setStatus("หนีไปที่ทางออก ก่อน killer ไล่ทัน");
}

function makeActor(tile) {
  return { x: tile.x, y: tile.y, renderX: tile.x, renderY: tile.y };
}

function updateHud() {
  levelLabel.textContent = `${currentLevel + 1} / ${LEVELS.length}`;
  starLabel.textContent = starsText(progress[currentLevel]?.stars || 0);
}

function setStatus(text) {
  statusText.textContent = text;
}

function getElapsedSeconds() {
  if (gameState !== "playing") return finishedTime;
  return (performance.now() - levelStartTime) / 1000;
}

function startTimer() {
  if (timerId) clearInterval(timerId);
  timerId = setInterval(updateTimer, 100);
}

function updateTimer() {
  timerLabel.textContent = formatTime(getElapsedSeconds());
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const rest = (seconds % 60).toFixed(1).padStart(4, "0");
  return `${minutes}:${rest}`;
}

function starsForTime(levelIndex, seconds) {
  const [threeStar, twoStar] = LEVELS[levelIndex].stars;
  if (seconds <= threeStar) return 3;
  if (seconds <= twoStar) return 2;
  return 1;
}

function starsText(count) {
  return "★".repeat(count) + "☆".repeat(3 - count);
}

function scoreForTime(levelIndex, seconds, stars) {
  const [, twoStar] = LEVELS[levelIndex].stars;
  const speedBonus = Math.max(0, Math.round((twoStar - seconds) * 25));
  return stars * 1000 + speedBonus;
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBoard();
  drawTrail();
  drawExit();
  drawActor(images.player, player, 39, 62);
  drawActor(images.killer, killer, 40, 64);
  requestAnimationFrame(draw);
}

function drawBoard() {
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const px = x * TILE_SIZE;
      const py = y * TILE_SIZE;
      const cell = map[y][x];

      if (cell === 1) {
        ctx.fillStyle = "#0b0b0e";
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        ctx.fillStyle = "rgba(165, 31, 45, 0.12)";
        ctx.fillRect(px + 3, py + 3, TILE_SIZE - 6, TILE_SIZE - 6);
      } else {
        if (images.floor.complete && images.floor.naturalWidth) {
          ctx.drawImage(images.floor, px, py, TILE_SIZE, TILE_SIZE);
        } else {
          ctx.fillStyle = "#20201c";
          ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        }
        ctx.fillStyle = (x + y) % 2 === 0 ? "rgba(51, 61, 54, 0.36)" : "rgba(22, 25, 24, 0.36)";
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      }

      if (cell === 2) {
        ctx.fillStyle = "rgba(80, 0, 0, 0.18)";
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        if (images.trap.complete && images.trap.naturalWidth) {
          ctx.drawImage(images.trap, px + 3, py + 3, TILE_SIZE - 6, TILE_SIZE - 6);
        }
      }

      if (cell === 3) {
        ctx.fillStyle = "rgba(180, 186, 164, 0.28)";
        ctx.fillRect(px + 4, py + 8, TILE_SIZE - 8, TILE_SIZE - 16);
        ctx.strokeStyle = "rgba(247, 242, 236, 0.32)";
        ctx.strokeRect(px + 4.5, py + 8.5, TILE_SIZE - 8, TILE_SIZE - 16);
      }

      ctx.strokeStyle = "rgba(255, 255, 255, 0.035)";
      ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE, TILE_SIZE);
    }
  }
}

function drawTrail() {
  killerTrail.forEach((tile, index) => {
    const alpha = (index + 1) / killerTrail.length;
    ctx.fillStyle = `rgba(165, 31, 45, ${0.08 + alpha * 0.18})`;
    ctx.fillRect(tile.x * TILE_SIZE + 5, tile.y * TILE_SIZE + 5, TILE_SIZE - 10, TILE_SIZE - 10);
  });
}

function drawExit() {
  const pulse = 1 + Math.sin(performance.now() / 180) * 0.05;
  const width = 54 * pulse;
  const height = 44 * pulse;
  const x = exitTile.x * TILE_SIZE + TILE_SIZE / 2 - width / 2;
  const y = exitTile.y * TILE_SIZE + TILE_SIZE / 2 - height / 2;
  if (images.exit.complete && images.exit.naturalWidth) {
    ctx.drawImage(images.exit, x, y, width, height);
  }
}

function drawActor(image, actor, width, height) {
  const x = actor.renderX * TILE_SIZE + TILE_SIZE / 2 - width / 2;
  const y = actor.renderY * TILE_SIZE + TILE_SIZE - height;
  if (image.complete && image.naturalWidth) {
    ctx.drawImage(image, x, y, width, height);
  }
}

async function handleMove(dx, dy) {
  if (inputLocked || gameState !== "playing") return;

  const next = { x: player.x + dx, y: player.y + dy };
  if (!isPlayerWalkable(map, next.x, next.y)) return;

  inputLocked = true;
  await animateActor(player, next, PLAYER_MOVE_DURATION);
  player.x = next.x;
  player.y = next.y;

  if (checkEndState()) {
    inputLocked = false;
    return;
  }

  turnCount++;
  const freeMovesAtTurnStart = playerFreeMoves;
  const steppedOnTrap = isTrap(player.x, player.y);

  if (steppedOnTrap) {
    setStatus("เหยียบกับดัก killer ได้เดินฟรี 2 ก้าว");
    await moveKiller(2);
    if (checkEndState()) {
      inputLocked = false;
      return;
    }
  }

  if (playerFreeMoves > 0 && freeMovesAtTurnStart > 0) {
    playerFreeMoves--;
    setStatus(`killer ติดกับดัก คุณเดินฟรีได้อีก ${playerFreeMoves} ก้าว`);
  } else if (playerFreeMoves > 0) {
    setStatus(`killer ติดกับดัก คุณเดินฟรีได้ ${playerFreeMoves} ก้าว`);
  } else {
    await moveKiller(2);
  }

  checkEndState();
  inputLocked = false;
}

async function moveKiller(steps) {
  if (gameState !== "playing") return;

  for (let step = 0; step < steps; step++) {
    const next = getNextKillerTile();
    if (!next) return;
    const current = { x: killer.x, y: killer.y };
    await animateActor(killer, next, KILLER_MOVE_DURATION);
    killer.x = next.x;
    killer.y = next.y;
    previousKillerTile = current;
    killerTrail.push({ x: killer.x, y: killer.y });
    if (killerTrail.length > 24) killerTrail.shift();

    if (isTrap(killer.x, killer.y)) {
      playerFreeMoves += 2;
      setStatus(`killer เหยียบกับดัก คุณเดินฟรีได้ ${playerFreeMoves} ก้าว`);
      break;
    }

    if (checkEndState()) break;
  }
}

function getNextKillerTile() {
  if (canKillerSeePlayer()) {
    const path = findPath(map, killer, player, isKillerWalkable);
    return path.length > 1 ? path[1] : null;
  }

  const options = getNeighbors(map, killer, isKillerWalkable);
  const forwardOptions =
    options.length > 1 && previousKillerTile
      ? options.filter((tile) => !sameTile(tile, previousKillerTile))
      : options;

  return forwardOptions.length
    ? forwardOptions[Math.floor(Math.random() * forwardOptions.length)]
    : null;
}

function canKillerSeePlayer() {
  return (
    Math.abs(killer.x - player.x) <= KILLER_DETECTION_RANGE &&
    Math.abs(killer.y - player.y) <= KILLER_DETECTION_RANGE
  );
}

function animateActor(actor, next, duration) {
  const fromX = actor.renderX;
  const fromY = actor.renderY;
  const started = performance.now();

  return new Promise((resolve) => {
    function tick(now) {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      actor.renderX = fromX + (next.x - fromX) * eased;
      actor.renderY = fromY + (next.y - fromY) * eased;

      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        actor.renderX = next.x;
        actor.renderY = next.y;
        resolve();
      }
    }

    requestAnimationFrame(tick);
  });
}

function checkEndState() {
  if (player.x === exitTile.x && player.y === exitTile.y) {
    finishLevel();
    return true;
  }

  if (player.x === killer.x && player.y === killer.y) {
    finishedTime = getElapsedSeconds();
    gameState = "lost";
    updateTimer();
    setStatus("โดน killer จับได้ กดเริ่มใหม่เพื่อลองอีกครั้ง");
    showDeathResult();
    return true;
  }

  return false;
}

function finishLevel() {
  finishedTime = getElapsedSeconds();
  gameState = "won";
  updateTimer();
  const stars = starsForTime(currentLevel, finishedTime);
  const score = scoreForTime(currentLevel, finishedTime, stars);
  const previous = progress[currentLevel];

  if (!previous || finishedTime < previous.best) {
    progress[currentLevel] = { best: finishedTime, stars, score };
  } else if (stars > previous.stars) {
    progress[currentLevel] = { ...previous, stars, score: Math.max(previous.score || 0, score) };
  } else if (score > (previous.score || 0)) {
    progress[currentLevel] = { ...previous, score };
  }

  saveProgress();
  updateHud();
  renderLevels();
  setStatus(`รอดแล้ว ได้ ${starsText(stars)} คะแนน ${score}`);
  showResult(stars, score);
}

function findPath(grid, start, goal, canWalk = isKillerWalkable) {
  const openSet = [{ x: start.x, y: start.y }];
  const cameFrom = new Map();
  const gScore = new Map([[tileKey(start), 0]]);
  const fScore = new Map([[tileKey(start), distanceBetween(start, goal)]]);

  while (openSet.length) {
    openSet.sort((a, b) => (fScore.get(tileKey(a)) ?? Infinity) - (fScore.get(tileKey(b)) ?? Infinity));
    const current = openSet.shift();

    if (current.x === goal.x && current.y === goal.y) {
      return reconstructPath(cameFrom, current);
    }

    for (const neighbor of getNeighbors(grid, current, canWalk)) {
      const currentKey = tileKey(current);
      const neighborKey = tileKey(neighbor);
      const tentative = (gScore.get(currentKey) ?? Infinity) + 1;

      if (tentative < (gScore.get(neighborKey) ?? Infinity)) {
        cameFrom.set(neighborKey, current);
        gScore.set(neighborKey, tentative);
        fScore.set(neighborKey, tentative + distanceBetween(neighbor, goal));

        if (!openSet.some((tile) => tile.x === neighbor.x && tile.y === neighbor.y)) {
          openSet.push(neighbor);
        }
      }
    }
  }

  return [];
}

function reconstructPath(cameFrom, current) {
  const path = [{ ...current }];

  while (cameFrom.has(tileKey(current))) {
    current = cameFrom.get(tileKey(current));
    path.unshift({ ...current });
  }

  return path;
}

function getNeighbors(grid, tile, canWalk = isPlayerWalkable) {
  return [
    { x: tile.x, y: tile.y - 1 },
    { x: tile.x, y: tile.y + 1 },
    { x: tile.x - 1, y: tile.y },
    { x: tile.x + 1, y: tile.y },
  ].filter((next) => canWalk(grid, next.x, next.y));
}

function isPlayerWalkable(grid, x, y) {
  return x >= 0 && x < COLS && y >= 0 && y < ROWS && grid[y][x] !== 1;
}

function isKillerWalkable(grid, x, y) {
  return x >= 0 && x < COLS && y >= 0 && y < ROWS && grid[y][x] !== 1 && grid[y][x] !== 3;
}

function isTrap(x, y) {
  return map[y][x] === 2;
}

function tileKey(tile) {
  return `${tile.x},${tile.y}`;
}

function sameTile(a, b) {
  return a.x === b.x && a.y === b.y;
}

function distanceBetween(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function renderLevels() {
  levelsGrid.innerHTML = "";

  LEVELS.forEach((level, index) => {
    const record = progress[index];
    const button = document.createElement("button");
    button.type = "button";
    button.className = `level-card${index === currentLevel ? " is-active" : ""}`;
    button.innerHTML = `
      <strong>ด่าน ${index + 1}</strong>
      <span>${level.tier}</span>
      <span class="stars">${starsText(record?.stars || 0)}</span>
      <span class="best">${record ? `ดีที่สุด ${formatTime(record.best)}` : "ยังไม่ผ่าน"}</span>
    `;
    button.addEventListener("click", () => {
      closeLevels();
      startLevel(index);
    });
    levelsGrid.appendChild(button);
  });
}

document.addEventListener("keydown", (event) => {
  const keys = {
    w: [0, -1],
    ArrowUp: [0, -1],
    s: [0, 1],
    ArrowDown: [0, 1],
    a: [-1, 0],
    ArrowLeft: [-1, 0],
    d: [1, 0],
    ArrowRight: [1, 0],
  };

  if (!keys[event.key]) return;
  event.preventDefault();
  handleMove(keys[event.key][0], keys[event.key][1]);
});

restartButton.addEventListener("click", () => startLevel(currentLevel));
levelsButton.addEventListener("click", () => {
  renderLevels();
  openLevels();
});
closeLevelsButton.addEventListener("click", closeLevels);
levelsDialog.addEventListener("click", (event) => {
  if (event.target === levelsDialog) closeLevels();
});

function openLevels() {
  levelsDialog.classList.add("is-open");
  levelsDialog.setAttribute("aria-hidden", "false");
}

function closeLevels() {
  levelsDialog.classList.remove("is-open");
  levelsDialog.setAttribute("aria-hidden", "true");
}

function showResult(stars, score) {
  resultEyebrow.textContent = "Level Clear";
  resultTitle.textContent = "รอดแล้ว";
  resultStars.textContent = starsText(stars);
  resultScore.textContent = score.toLocaleString("th-TH");
  resultTime.textContent = formatTime(finishedTime);
  nextLevelButton.classList.remove("is-hidden");

  if (currentLevel < LEVELS.length - 1) {
    resultNextText.textContent = "กำลังไปด่านถัดไป...";
    nextLevelButton.disabled = false;
    autoNextTimeout = setTimeout(() => {
      startLevel(currentLevel + 1);
    }, 2500);
  } else {
    resultNextText.textContent = "ผ่านครบทุกด่านแล้ว";
    nextLevelButton.disabled = true;
  }

  resultDialog.classList.add("is-open");
  resultDialog.setAttribute("aria-hidden", "false");
}

function showDeathResult() {
  clearAutoNext();
  resultEyebrow.textContent = "Game Over";
  resultTitle.textContent = "ตาย";
  resultStars.textContent = "☆☆☆";
  resultScore.textContent = "0";
  resultTime.textContent = formatTime(finishedTime);
  resultNextText.textContent = "กดเริ่มใหม่เพื่อลองด่านนี้อีกครั้ง";
  nextLevelButton.disabled = true;
  nextLevelButton.classList.add("is-hidden");
  resultDialog.classList.add("is-open");
  resultDialog.setAttribute("aria-hidden", "false");
}

function closeResult() {
  resultDialog.classList.remove("is-open");
  resultDialog.setAttribute("aria-hidden", "true");
}

function clearAutoNext() {
  if (autoNextTimeout) {
    clearTimeout(autoNextTimeout);
    autoNextTimeout = null;
  }
}

nextLevelButton.addEventListener("click", () => {
  if (currentLevel >= LEVELS.length - 1) return;
  startLevel(currentLevel + 1);
});
replayLevelButton.addEventListener("click", () => startLevel(currentLevel));

startLevel(0);
draw();
document.body.classList.remove("app-loading");
document.body.classList.add("app-ready");
