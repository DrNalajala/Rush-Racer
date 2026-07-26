const canvas = document.querySelector("#gameCanvas");
const ctx = canvas.getContext("2d");

const ui = {
  lives: document.querySelector("#lives"),
  timer: document.querySelector("#timer"),
  distance: document.querySelector("#distance"),
  score: document.querySelector("#score"),
  speed: document.querySelector("#speed"),
  nitro: document.querySelector("#nitroCount"),
  menu: document.querySelector("#menuScreen"),
  pause: document.querySelector("#pauseScreen"),
  result: document.querySelector("#resultScreen"),
  resultTitle: document.querySelector("#resultTitle"),
  resultText: document.querySelector("#resultText"),
  leaderboard: document.querySelector("#leaderboard"),
  mute: document.querySelector("#muteBtn")
};

const carColors = ["#f04538", "#1774ff", "#12aa67", "#ffd447", "#ff8d1f", "#111827", "#ffffff"];
const state = {
  status: "menu",
  timeLeft: 120,
  lives: 3,
  score: 0,
  distance: 0,
  speed: 0,
  nitro: 3,
  selectedColor: carColors[0],
  playerLane: 1,
  targetLane: 1,
  invincible: 0,
  boostTime: 0,
  roadOffset: 0,
  spawnTimer: 0,
  coinTimer: 0,
  lastTick: performance.now(),
  traffic: [],
  coins: [],
  particles: [],
  muted: false
};

const keys = new Set();
const lanes = [0, 1, 2, 3];
const road = { x: 0, w: 0, laneW: 0 };

function resizeCanvas() {
  const box = canvas.getBoundingClientRect();
  canvas.width = Math.max(520, Math.floor(box.width * devicePixelRatio));
  canvas.height = Math.max(410, Math.floor(box.height * devicePixelRatio));
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
}

function laneCenter(lane) {
  return road.x + road.laneW * lane + road.laneW / 2;
}

function buildPicker() {
  const picker = document.querySelector("#carPicker");
  picker.innerHTML = carColors.map((color, index) => (
    `<button class="swatch ${index === 0 ? "selected" : ""}" style="background:${color}" data-color="${color}" aria-label="Select car color"></button>`
  )).join("");
  picker.querySelectorAll(".swatch").forEach(button => {
    button.addEventListener("click", () => {
      picker.querySelector(".selected").classList.remove("selected");
      button.classList.add("selected");
      state.selectedColor = button.dataset.color;
    });
  });
}

function resetGame() {
  Object.assign(state, {
    status: "playing",
    timeLeft: 120,
    lives: 3,
    score: 0,
    distance: 0,
    speed: 80,
    nitro: 3,
    playerLane: 1,
    targetLane: 1,
    invincible: 0,
    boostTime: 0,
    roadOffset: 0,
    spawnTimer: 0,
    coinTimer: 0,
    lastTick: performance.now(),
    traffic: [],
    coins: [],
    particles: []
  });
  showOnly();
  updateHud();
  beep(220, 0.08, "square");
}

function showOnly(screen = null) {
  [ui.menu, ui.pause, ui.result].forEach(el => el.classList.remove("active"));
  if (screen) screen.classList.add("active");
}

function updateHud() {
  ui.lives.textContent = "♥".repeat(state.lives) || "0";
  ui.timer.textContent = Math.ceil(state.timeLeft);
  ui.distance.textContent = Math.floor(state.distance);
  ui.score.textContent = state.score;
  ui.speed.textContent = Math.floor(state.speed);
  ui.nitro.textContent = state.nitro;
}

function spawnTraffic() {
  const lane = lanes[Math.floor(Math.random() * lanes.length)];
  const colors = carColors.filter(color => color !== state.selectedColor);
  state.traffic.push({
    lane,
    y: -110,
    w: 52,
    h: 92,
    color: colors[Math.floor(Math.random() * colors.length)],
    speed: 145 + Math.random() * 80 + state.distance / 90
  });
}

function spawnCoin() {
  state.coins.push({
    lane: lanes[Math.floor(Math.random() * lanes.length)],
    y: -40,
    r: 14,
    speed: 165 + state.speed * 0.55
  });
}

function drawBackground(width, height) {
  const horizon = height * 0.28;
  const hillY = horizon + 38;
  ctx.fillStyle = "#91e1ff";
  ctx.fillRect(0, 0, width, horizon);
  ctx.fillStyle = "#77b957";
  ctx.beginPath();
  ctx.moveTo(0, hillY);
  for (let x = 0; x <= width; x += 130) ctx.lineTo(x + 70, hillY - 70 - (x % 3) * 12);
  ctx.lineTo(width, hillY);
  ctx.lineTo(width, horizon);
  ctx.lineTo(0, horizon);
  ctx.fill();
  ctx.fillStyle = "#62b95d";
  ctx.fillRect(0, horizon, width, height - horizon);

  for (let i = 0; i < 9; i++) {
    const y = (state.roadOffset * 0.45 + i * 115) % (height + 140) - 60;
    drawTree(road.x - 58, y, 0.75);
    drawTree(road.x + road.w + 58, y + 48, 0.75);
  }
}

function drawTree(x, y, scale) {
  ctx.fillStyle = "#7a4a26";
  ctx.fillRect(x - 5 * scale, y + 24 * scale, 10 * scale, 28 * scale);
  ctx.fillStyle = "#0b8b52";
  ctx.beginPath();
  ctx.arc(x, y + 18 * scale, 22 * scale, 0, Math.PI * 2);
  ctx.fill();
}

function drawRoad(width, height) {
  road.w = Math.min(width * 0.66, 620);
  road.x = (width - road.w) / 2;
  road.laneW = road.w / lanes.length;

  ctx.fillStyle = "#2f3744";
  ctx.fillRect(road.x, 0, road.w, height);
  ctx.fillStyle = "#202833";
  ctx.fillRect(road.x - 12, 0, 12, height);
  ctx.fillRect(road.x + road.w, 0, 12, height);

  ctx.strokeStyle = "#f9fbff";
  ctx.lineWidth = 5;
  ctx.setLineDash([34, 34]);
  ctx.lineDashOffset = -state.roadOffset;
  for (let i = 1; i < lanes.length; i++) {
    const x = road.x + road.laneW * i;
    ctx.beginPath();
    ctx.moveTo(x, -40);
    ctx.lineTo(x, height + 40);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function drawCar(x, y, w, h, color, flash = false) {
  ctx.save();
  ctx.translate(x, y);
  if (flash) ctx.globalAlpha = 0.45 + Math.sin(performance.now() / 70) * 0.25;
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(0, h / 2 - 2, w * 0.46, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, 10);
  ctx.fill();
  ctx.fillStyle = color === "#ffffff" ? "#b8dfff" : "#bfe8ff";
  ctx.fillRect(-w * 0.28, -h * 0.28, w * 0.56, h * 0.28);
  ctx.fillStyle = "#111827";
  ctx.fillRect(-w / 2 - 5, -h * 0.32, 8, h * 0.22);
  ctx.fillRect(w / 2 - 3, -h * 0.32, 8, h * 0.22);
  ctx.fillRect(-w / 2 - 5, h * 0.12, 8, h * 0.22);
  ctx.fillRect(w / 2 - 3, h * 0.12, 8, h * 0.22);
  ctx.fillStyle = "#fff6a8";
  ctx.fillRect(-w * 0.35, -h / 2 + 6, 12, 8);
  ctx.fillRect(w * 0.16, -h / 2 + 6, 12, 8);
  ctx.restore();
}

function drawCoin(coin) {
  const x = laneCenter(coin.lane);
  ctx.fillStyle = "#ffd447";
  ctx.beginPath();
  ctx.arc(x, coin.y, coin.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#9b6d00";
  ctx.lineWidth = 3;
  ctx.stroke();
}

function rectsOverlap(a, b) {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;
}

function addParticles(x, y, color) {
  for (let i = 0; i < 18; i++) {
    state.particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 220,
      vy: (Math.random() - 0.5) * 220,
      life: 0.55,
      color
    });
  }
}

let audioContext;
function beep(freq, duration, type = "sine", volume = 0.09) {
  if (state.muted) return;
  audioContext ||= new AudioContext();
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.value = volume;
  osc.connect(gain);
  gain.connect(audioContext.destination);
  osc.start();
  osc.stop(audioContext.currentTime + duration);
}

function dashSound(direction) {
  beep(direction < 0 ? 520 : 620, 0.055, "square", 0.12);
  setTimeout(() => beep(direction < 0 ? 390 : 460, 0.045, "triangle", 0.08), 45);
}

function endGame(won) {
  state.status = "ended";
  const score = Math.max(0, Math.floor(state.score + state.distance + state.timeLeft * 25));
  saveScore(score);
  ui.resultTitle.textContent = won ? "Target Reached!" : "Game Over";
  ui.resultText.textContent = won
    ? `You reached 5000 meters with ${Math.ceil(state.timeLeft)} seconds left. Final score: ${score}.`
    : `You covered ${Math.floor(state.distance)} meters. Final score: ${score}.`;
  renderLeaderboard();
  showOnly(ui.result);
  beep(won ? 660 : 150, 0.22, won ? "triangle" : "sawtooth");
}

function saveScore(score) {
  const scores = JSON.parse(localStorage.getItem("colorRushScores") || "[]");
  scores.push(score);
  scores.sort((a, b) => b - a);
  localStorage.setItem("colorRushScores", JSON.stringify(scores.slice(0, 5)));
}

function renderLeaderboard() {
  const scores = JSON.parse(localStorage.getItem("colorRushScores") || "[]");
  ui.leaderboard.innerHTML = scores.length ? scores.map(score => `<li>${score}</li>`).join("") : "<li>No scores yet</li>";
}

function update(dt) {
  if (state.status !== "playing") return;
  const accelerating = keys.has("ArrowUp") || keys.has("w") || keys.has("gas");
  const braking = keys.has("ArrowDown") || keys.has("s") || keys.has("brake");
  if ((keys.has("ArrowLeft") || keys.has("a") || keys.has("left")) && state.targetLane > 0) {
    state.targetLane -= 1;
    dashSound(-1);
    keys.delete("ArrowLeft"); keys.delete("a"); keys.delete("left");
  }
  if ((keys.has("ArrowRight") || keys.has("d") || keys.has("right")) && state.targetLane < lanes.length - 1) {
    state.targetLane += 1;
    dashSound(1);
    keys.delete("ArrowRight"); keys.delete("d"); keys.delete("right");
  }

  state.speed += (accelerating ? 80 : -18) * dt;
  state.speed -= braking ? 125 * dt : 0;
  state.speed = Math.max(45, Math.min(state.boostTime > 0 ? 260 : 190, state.speed));
  state.playerLane += (state.targetLane - state.playerLane) * Math.min(1, dt * 8);
  state.timeLeft -= dt;
  state.distance += state.speed * dt * 1.55;
  state.score += Math.floor(state.speed * dt * 0.6);
  state.roadOffset = (state.roadOffset + state.speed * dt * 1.2) % 68;
  state.invincible = Math.max(0, state.invincible - dt);
  state.boostTime = Math.max(0, state.boostTime - dt);

  state.spawnTimer -= dt;
  state.coinTimer -= dt;
  if (state.spawnTimer <= 0) {
    spawnTraffic();
    state.spawnTimer = Math.max(0.45, 1.35 - state.distance / 5200);
  }
  if (state.coinTimer <= 0) {
    spawnCoin();
    state.coinTimer = 1.4 + Math.random() * 1.2;
  }

  const height = canvas.getBoundingClientRect().height;
  state.traffic.forEach(car => car.y += car.speed * dt);
  state.coins.forEach(coin => coin.y += coin.speed * dt);
  state.particles.forEach(p => {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
  });
  state.traffic = state.traffic.filter(car => car.y < height + 130);
  state.coins = state.coins.filter(coin => coin.y < height + 60);
  state.particles = state.particles.filter(p => p.life > 0);

  const player = { x: laneCenter(state.playerLane), y: height - 92, w: 48, h: 88 };
  state.traffic.forEach(car => {
    const enemy = { x: laneCenter(car.lane), y: car.y, w: car.w, h: car.h };
    if (state.invincible <= 0 && rectsOverlap(player, enemy)) {
      state.lives -= 1;
      state.invincible = 2;
      state.speed = Math.max(55, state.speed - 55);
      addParticles(player.x, player.y, "#ff4e3e");
      beep(90, 0.18, "sawtooth", 0.16);
      setTimeout(() => beep(55, 0.12, "square", 0.12), 80);
      if (state.lives <= 0) endGame(false);
    }
  });
  state.coins = state.coins.filter(coin => {
    const hit = Math.abs(player.x - laneCenter(coin.lane)) < 40 && Math.abs(player.y - coin.y) < 58;
    if (hit) {
      state.score += 150;
      addParticles(laneCenter(coin.lane), coin.y, "#ffd447");
      beep(720, 0.08, "triangle", 0.11);
    }
    return !hit;
  });

  if (state.timeLeft <= 0) endGame(false);
  if (state.distance >= 5000) endGame(true);
  updateHud();
}

function draw() {
  const { width, height } = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, width, height);
  drawRoad(width, height);
  drawBackground(width, height);
  drawRoad(width, height);

  state.coins.forEach(drawCoin);
  state.traffic.forEach(car => drawCar(laneCenter(car.lane), car.y, car.w, car.h, car.color));
  state.particles.forEach(p => {
    ctx.globalAlpha = Math.max(0, p.life / 0.55);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  });

  const playerY = height - 92;
  if (state.boostTime > 0) {
    ctx.fillStyle = "#38d8ff";
    ctx.beginPath();
    ctx.moveTo(laneCenter(state.playerLane) - 17, playerY + 45);
    ctx.lineTo(laneCenter(state.playerLane), playerY + 82);
    ctx.lineTo(laneCenter(state.playerLane) + 17, playerY + 45);
    ctx.fill();
  }
  drawCar(laneCenter(state.playerLane), playerY, 54, 94, state.selectedColor, state.invincible > 0);
}

function loop(now) {
  const dt = Math.min(0.033, (now - state.lastTick) / 1000);
  state.lastTick = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

function pauseGame() {
  if (state.status !== "playing") return;
  state.status = "paused";
  showOnly(ui.pause);
}

function resumeGame() {
  if (state.status !== "paused") return;
  state.status = "playing";
  state.lastTick = performance.now();
  showOnly();
}

function useNitro() {
  if (state.status === "playing" && state.nitro > 0 && state.boostTime <= 0) {
    state.nitro -= 1;
    state.boostTime = 2.7;
    state.speed = 255;
    addParticles(laneCenter(state.playerLane), canvas.getBoundingClientRect().height - 55, "#38d8ff");
    beep(420, 0.14, "square", 0.13);
    setTimeout(() => beep(760, 0.12, "triangle", 0.1), 90);
  }
}

document.addEventListener("keydown", event => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  keys.add(key);
  if (key === " " || key === "Shift") useNitro();
  if (key === "p" || key === "Escape") state.status === "paused" ? resumeGame() : pauseGame();
});
document.addEventListener("keyup", event => keys.delete(event.key.length === 1 ? event.key.toLowerCase() : event.key));

function holdButton(id, key, onTap) {
  const button = document.querySelector(id);
  const start = event => {
    event.preventDefault();
    keys.add(key);
    if (onTap) onTap();
  };
  const end = () => keys.delete(key);
  button.addEventListener("pointerdown", start);
  button.addEventListener("pointerup", end);
  button.addEventListener("pointerleave", end);
  button.addEventListener("pointercancel", end);
}

holdButton("#leftBtn", "left");
holdButton("#rightBtn", "right");
holdButton("#gasBtn", "gas");
holdButton("#brakeBtn", "brake");
holdButton("#boostBtn", "boost", useNitro);

document.querySelector("#startBtn").addEventListener("click", resetGame);
document.querySelector("#restartBtn").addEventListener("click", resetGame);
document.querySelector("#pauseRestartBtn").addEventListener("click", resetGame);
document.querySelector("#playAgainBtn").addEventListener("click", resetGame);
document.querySelector("#pauseBtn").addEventListener("click", pauseGame);
document.querySelector("#resumeBtn").addEventListener("click", resumeGame);
ui.mute.addEventListener("click", () => {
  state.muted = !state.muted;
  ui.mute.textContent = state.muted ? "Sound Off" : "Sound On";
});

window.addEventListener("resize", resizeCanvas);
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function roundRect(x, y, w, h, r) {
    this.beginPath();
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    this.closePath();
  };
}

buildPicker();
resizeCanvas();
renderLeaderboard();
updateHud();
requestAnimationFrame(loop);
