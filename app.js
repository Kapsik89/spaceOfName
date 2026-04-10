const canvas = document.getElementById("battlefield");
const context = canvas.getContext("2d");

const namesInput = document.getElementById("names-input");
const startButton = document.getElementById("start-button");
const shuffleButton = document.getElementById("shuffle-button");
const statusText = document.getElementById("status-text");
const winnerCard = document.getElementById("winner-card");
const winnerName = document.getElementById("winner-name");
const rosterGrid = document.getElementById("roster-grid");
const bonusOptions = document.getElementById("bonus-options");
const NAMES_STORAGE_KEY = "spaceOfName:names";
const DEFAULT_NAMES_TEXT = namesInput.value.trim();

const WORLD_WIDTH = 1920;
const WORLD_HEIGHT = 1080;
const WORLD_GRID = 96;
const BORDER_PADDING = 34;
const SHIP_RADIUS = 20;
const SHIP_MAX_HEALTH = 10;
const BULLET_SPEED = 760;
const BULLET_LIFETIME = 1.6;
const PICKUP_RADIUS = 24;
const PICKUP_MAGNET_RADIUS = 120;
const PICKUP_MAGNET_SPEED = 780;
const PICKUP_COLLECT_MARGIN = 14;
const MAX_PICKUPS = 4;
const PICKUP_SPAWN_MIN = 2.1;
const PICKUP_SPAWN_MAX = 4.2;
const MAX_SPARKS = 160;
const MAX_BULLETS = 90;
const ENABLE_GLOW_EFFECTS = false;

namesInput.value = loadSavedNamesText();
const STARTING_NAMES = parseNames(namesInput.value);

canvas.width = WORLD_WIDTH;
canvas.height = WORLD_HEIGHT;
const backgroundCanvas = document.createElement("canvas");
backgroundCanvas.width = WORLD_WIDTH;
backgroundCanvas.height = WORLD_HEIGHT;
const backgroundContext = backgroundCanvas.getContext("2d");

const WEAPON_TYPES = {
  blaster: {
    label: "Blaster",
    pickupLabel: "Startowa",
    color: "#ffd480",
    charges: Infinity,
    reloadMin: 0.45,
    reloadMax: 1.15,
    shape: "triangle",
  },
  spread: {
    label: "Rozrzut",
    pickupLabel: "Rozrzut x6",
    color: "#7ef3c5",
    charges: 6,
    reloadMin: 0.62,
    reloadMax: 1.05,
    shape: "fan",
  },
  rapid: {
    label: "Szybkostrzał",
    pickupLabel: "Szybkostrzał x18",
    color: "#6dc6ff",
    charges: 18,
    reloadMin: 0.14,
    reloadMax: 0.26,
    shape: "chevrons",
  },
  plasma: {
    label: "Plazma",
    pickupLabel: "Plazma x5",
    color: "#ff7edb",
    charges: 5,
    reloadMin: 0.8,
    reloadMax: 1.3,
    shape: "orb",
  },
  rocket: {
    label: "Rakiety",
    pickupLabel: "Rakiety x4",
    color: "#ff8d6d",
    charges: 4,
    reloadMin: 0.9,
    reloadMax: 1.35,
    shape: "rocket",
  },
  laser: {
    label: "Laser",
    pickupLabel: "Laser x5",
    color: "#9dfffd",
    charges: 5,
    reloadMin: 0.52,
    reloadMax: 0.74,
    shape: "laser",
  },
  mine: {
    label: "Miny",
    pickupLabel: "Miny x4",
    color: "#c7ff6e",
    charges: 4,
    reloadMin: 0.68,
    reloadMax: 1.08,
    shape: "mine",
  },
};

const SUPPORT_TYPES = {
  repair: {
    label: "Naprawa",
    pickupLabel: "Naprawa +2",
    color: "#ffb36d",
    shape: "plus",
  },
  shield: {
    label: "Tarcza",
    pickupLabel: "Osłona +2",
    color: "#7edbff",
    shape: "shield",
  },
  speed: {
    label: "Turbo",
    pickupLabel: "Turbo 7s",
    color: "#ffe66d",
    shape: "bolt",
  },
};

const PICKUP_OPTION_ORDER = [
  "spread",
  "rapid",
  "plasma",
  "rocket",
  "laser",
  "mine",
  "repair",
  "shield",
  "speed",
];

const PICKUP_WEIGHTS = {
  spread: 1,
  rapid: 2,
  plasma: 1,
  rocket: 1,
  laser: 1,
  mine: 1,
  repair: 2,
  shield: 2,
  speed: 2,
};

let ships = [];
let bullets = [];
let sparks = [];
let beams = [];
let mines = [];
let pickups = [];
let winner = null;
let animationFrame = null;
let lastTick = 0;
let rosterTiles = new Map();
let pickupSpawnTimer = randomBetween(PICKUP_SPAWN_MIN, PICKUP_SPAWN_MAX);
let rosterDirty = false;

function parseNames(input) {
  return input
    .split("\n")
    .map((name) => name.trim())
    .filter(Boolean)
    .slice(0, 24);
}

function loadSavedNamesText() {
  try {
    const savedNames = window.localStorage.getItem(NAMES_STORAGE_KEY);
    return savedNames && savedNames.trim() ? savedNames : DEFAULT_NAMES_TEXT;
  } catch {
    return DEFAULT_NAMES_TEXT;
  }
}

function saveNamesText() {
  try {
    window.localStorage.setItem(NAMES_STORAGE_KEY, namesInput.value.trim());
  } catch {
    // Ignore storage errors and keep the app usable.
  }
}

function colorFromName(name, index) {
  let hash = 0;
  for (const character of name) {
    hash = character.charCodeAt(0) + ((hash << 5) - hash);
  }

  const hue = Math.abs(hash + index * 47) % 360;
  return {
    fill: `hsl(${hue} 85% 58%)`,
    glow: `hsla(${hue} 100% 70% / 0.38)`,
    soft: `hsla(${hue} 95% 62% / 0.24)`,
    stroke: `hsl(${hue} 88% 80%)`,
  };
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function blendAngles(primaryAngle, secondaryAngle, secondaryWeight) {
  const primaryWeight = 1 - secondaryWeight;
  const x =
    Math.cos(primaryAngle) * primaryWeight + Math.cos(secondaryAngle) * secondaryWeight;
  const y =
    Math.sin(primaryAngle) * primaryWeight + Math.sin(secondaryAngle) * secondaryWeight;
  return Math.atan2(y, x);
}

function getWeaponConfig(weaponKey) {
  return WEAPON_TYPES[weaponKey] ?? WEAPON_TYPES.blaster;
}

function getPickupConfig(pickupKey) {
  return WEAPON_TYPES[pickupKey] ?? SUPPORT_TYPES[pickupKey];
}

function createBonusOptionsUI() {
  bonusOptions.innerHTML = "";

  PICKUP_OPTION_ORDER.forEach((pickupKey) => {
    const pickupConfig = getPickupConfig(pickupKey);
    const label = document.createElement("label");
    label.className = "bonus-toggle";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "pickup-option";
    input.value = pickupKey;
    input.checked = true;

    const text = document.createElement("span");
    text.textContent = pickupConfig.label;

    label.append(input, text);
    bonusOptions.appendChild(label);
  });
}

function getEnabledPickupKeys() {
  return [...bonusOptions.querySelectorAll('input[name="pickup-option"]:checked')].map(
    (input) => input.value
  );
}

function syncPickupsWithOptions() {
  const enabled = new Set(getEnabledPickupKeys());
  pickups = pickups.filter((pickup) => enabled.has(pickup.pickupKey));
}

function buildWeightedPickupPool() {
  const enabled = getEnabledPickupKeys();
  const pool = [];

  enabled.forEach((pickupKey) => {
    const weight = PICKUP_WEIGHTS[pickupKey] ?? 1;
    for (let i = 0; i < weight; i += 1) {
      pool.push(pickupKey);
    }
  });

  return pool;
}

function getRandomReload(weaponKey) {
  const weapon = getWeaponConfig(weaponKey);
  return randomBetween(weapon.reloadMin, weapon.reloadMax);
}

function setStatus(message) {
  statusText.textContent = message;
}

function setWinner(ship) {
  winner = ship;
  winnerCard.hidden = false;
  winnerName.textContent = ship.name;
  winnerName.style.color = ship.color.fill;
}

function clearWinner() {
  winner = null;
  winnerCard.hidden = true;
  winnerName.textContent = "";
}

function markRosterDirty() {
  rosterDirty = true;
}

function createProjectile(ship, options) {
  const angle = ship.angle + options.angleOffset;
  const directionX = Math.cos(angle);
  const directionY = Math.sin(angle);
  const muzzleDistance = ship.radius + 10;

  return {
    kind: options.kind ?? "bullet",
    x: ship.x + directionX * muzzleDistance,
    y: ship.y + directionY * muzzleDistance,
    vx: directionX * options.speed + ship.vx * 0.3,
    vy: directionY * options.speed + ship.vy * 0.3,
    age: 0,
    life: options.lifetime,
    ownerId: ship.id,
    targetId: options.targetId ?? null,
    turnRate: options.turnRate ?? 0,
    color: options.color ?? ship.color.fill,
    size: options.size,
    damage: options.damage,
    explosionRadius: options.explosionRadius ?? 0,
  };
}

function buildRoster(entrants) {
  rosterGrid.innerHTML = "";
  rosterTiles = new Map();

  entrants.forEach((entrant) => {
    const tile = document.createElement("article");
    tile.className = "roster-tile";
    tile.style.background = `linear-gradient(160deg, ${entrant.color.soft}, rgba(255,255,255,0.05)), ${entrant.color.fill}`;

    const nameNode = document.createElement("p");
    nameNode.className = "roster-name";
    nameNode.textContent = entrant.name;

    const healthNode = document.createElement("p");
    healthNode.className = "roster-health";
    healthNode.textContent = `Kadłub: ${entrant.health}/${SHIP_MAX_HEALTH}`;

    const weaponNode = document.createElement("p");
    weaponNode.className = "roster-weapon";
    weaponNode.textContent = `Broń: ${getWeaponConfig(entrant.weaponKey).label}`;

    const metaNode = document.createElement("p");
    metaNode.className = "roster-meta";
    metaNode.textContent = "Osłona: 0 | Napęd: standard";

    tile.append(nameNode, healthNode, weaponNode, metaNode);
    rosterGrid.appendChild(tile);
    rosterTiles.set(entrant.id, tile);
  });
}

function updateRoster() {
  ships.forEach((ship) => {
    const tile = rosterTiles.get(ship.id);
    if (!tile) return;

    tile.classList.toggle("is-out", !ship.alive);

    const health = tile.querySelector(".roster-health");
    health.textContent = ship.alive
      ? `Kadłub: ${Math.max(ship.health, 0)}/${SHIP_MAX_HEALTH}`
      : "Wyłączony";

    const weapon = tile.querySelector(".roster-weapon");
    const weaponConfig = getWeaponConfig(ship.weaponKey);
    const charges = Number.isFinite(ship.weaponCharges) ? ` (${ship.weaponCharges})` : "";
    weapon.textContent = `Broń: ${weaponConfig.label}${charges}`;

    const meta = tile.querySelector(".roster-meta");
    const speedText = ship.speedBoostTimer > 0 ? "turbo" : "standard";
    meta.textContent = `Osłona: ${ship.shield} | Napęd: ${speedText}`;
  });
  rosterDirty = false;
}

function createShip(name, index, entrants) {
  const color = colorFromName(name, index);
  const padding = 120;
  let x = 0;
  let y = 0;
  let tries = 0;

  do {
    x = randomBetween(padding, WORLD_WIDTH - padding);
    y = randomBetween(padding, WORLD_HEIGHT - padding);
    tries += 1;
  } while (
    tries < 120 &&
    entrants.some((ship) => Math.hypot(ship.x - x, ship.y - y) < 80)
  );

  return {
    id: `${name}-${index}-${Math.round(Math.random() * 99999)}`,
    name,
    color,
    x,
    y,
    vx: randomBetween(-40, 40),
    vy: randomBetween(-40, 40),
    angle: randomBetween(0, Math.PI * 2),
    targetAngle: randomBetween(0, Math.PI * 2),
    baseSpeed: randomBetween(170, 250),
    radius: SHIP_RADIUS,
    health: SHIP_MAX_HEALTH,
    shield: 0,
    alive: true,
    weaponKey: "blaster",
    weaponCharges: Infinity,
    speedBoostTimer: 0,
    reload: getRandomReload("blaster"),
    retargetTimer: randomBetween(0.3, 1.8),
    dodgeTimer: randomBetween(0.2, 1.2),
    flash: 0,
  };
}

function resetBattle(customNames) {
  const names = customNames.length ? customNames : STARTING_NAMES;
  ships = [];
  bullets = [];
  sparks = [];
  beams = [];
  mines = [];
  pickups = [];
  pickupSpawnTimer = randomBetween(PICKUP_SPAWN_MIN, PICKUP_SPAWN_MAX);
  clearWinner();

  names.forEach((name, index) => {
    ships.push(createShip(name, index, ships));
  });

  buildRoster(ships);
  updateRoster();
  setStatus(`Walka trwa. Na planszy: ${ships.length} statków.`);
}

function getLivingShips() {
  return ships.filter((ship) => ship.alive);
}

function emitSparks(x, y, color, count) {
  const safeCount = Math.min(count, 10);
  for (let i = 0; i < safeCount; i += 1) {
    sparks.push({
      x,
      y,
      vx: randomBetween(-140, 140),
      vy: randomBetween(-140, 140),
      life: randomBetween(0.25, 0.65),
      age: 0,
      color,
    });
  }

  if (sparks.length > MAX_SPARKS) {
    sparks.splice(0, sparks.length - MAX_SPARKS);
  }
}

function restoreDefaultWeapon(ship) {
  ship.weaponKey = "blaster";
  ship.weaponCharges = Infinity;
}

function equipWeapon(ship, weaponKey) {
  const weapon = getWeaponConfig(weaponKey);
  ship.weaponKey = weaponKey;
  ship.weaponCharges = weapon.charges;
  ship.reload = Math.min(ship.reload, 0.22);
  markRosterDirty();
}

function applySupportPickup(ship, pickupKey) {
  if (pickupKey === "repair") {
    ship.health = Math.min(SHIP_MAX_HEALTH, ship.health + 2);
  } else if (pickupKey === "shield") {
    ship.shield = Math.min(4, ship.shield + 2);
  } else if (pickupKey === "speed") {
    ship.speedBoostTimer = 7;
  }

  ship.flash = 0.7;
  markRosterDirty();
}

function applyDamage(ship, amount, color) {
  let remaining = amount;

  while (remaining > 0 && ship.shield > 0) {
    ship.shield -= 1;
    remaining -= 1;
  }

  if (remaining > 0) {
    ship.health -= remaining;
  }

  ship.flash = 1;
  emitSparks(ship.x, ship.y, color ?? ship.color.stroke, 8 + amount * 2);

  if (ship.health <= 0) {
    killShip(ship);
    setStatus(`Walka trwa. Pozostało statków: ${getLivingShips().length}.`);
  }

  markRosterDirty();
}

function explodeAt(x, y, color, ownerId, radius, damage) {
  emitSparks(x, y, color, 18);

  ships.forEach((ship) => {
    if (!ship.alive || ship.id === ownerId) return;
    const hitDistance = Math.hypot(ship.x - x, ship.y - y);
    if (hitDistance > radius) return;

    const dealtDamage = hitDistance < radius * 0.5 ? damage : Math.max(1, damage - 1);
    applyDamage(ship, dealtDamage, color);
  });
}

function fireLaser(ship) {
  const originX = ship.x + Math.cos(ship.angle) * (ship.radius + 8);
  const originY = ship.y + Math.sin(ship.angle) * (ship.radius + 8);
  const directionX = Math.cos(ship.angle);
  const directionY = Math.sin(ship.angle);
  const maxRange = 540;

  let hitShip = null;
  let hitDistance = maxRange;

  ships.forEach((candidate) => {
    if (!candidate.alive || candidate.id === ship.id) return;

    const relativeX = candidate.x - originX;
    const relativeY = candidate.y - originY;
    const projection = relativeX * directionX + relativeY * directionY;
    if (projection < 0 || projection > hitDistance) return;

    const perpendicular = Math.abs(relativeX * directionY - relativeY * directionX);
    if (perpendicular > candidate.radius + 5) return;

    hitShip = candidate;
    hitDistance = projection;
  });

  const endX = originX + directionX * hitDistance;
  const endY = originY + directionY * hitDistance;
  const weapon = getWeaponConfig("laser");

  beams.push({
    x1: originX,
    y1: originY,
    x2: endX,
    y2: endY,
    color: weapon.color,
    age: 0,
    life: 0.14,
  });

  emitSparks(endX, endY, weapon.color, hitShip ? 14 : 5);
  if (hitShip) {
    applyDamage(hitShip, 2, weapon.color);
  }
}

function dropMine(ship) {
  const angle = ship.angle + Math.PI;
  const dropX = ship.x + Math.cos(angle) * (ship.radius + 5);
  const dropY = ship.y + Math.sin(angle) * (ship.radius + 5);

  mines.push({
    x: dropX,
    y: dropY,
    vx: ship.vx * 0.35 + Math.cos(angle) * 22,
    vy: ship.vy * 0.35 + Math.sin(angle) * 22,
    ownerId: ship.id,
    color: getWeaponConfig("mine").color,
    age: 0,
    life: 10,
    armDelay: 0.5,
    triggerRadius: 30,
    explosionRadius: 60,
    damage: 2,
    radius: 10,
  });

  emitSparks(dropX, dropY, getWeaponConfig("mine").color, 6);
}

function fireWeapon(ship, target) {
  const firedWeaponKey = ship.weaponKey;

  if (firedWeaponKey === "laser") {
    fireLaser(ship);
  } else if (firedWeaponKey === "mine") {
    dropMine(ship);
  } else if (firedWeaponKey === "spread") {
    bullets.push(
      ...[-0.28, 0, 0.28].map((angleOffset) =>
        createProjectile(ship, {
          angleOffset,
          speed: BULLET_SPEED - 35,
          lifetime: 1.08,
          size: 3,
          damage: 1,
        })
      )
    );
  } else if (firedWeaponKey === "rapid") {
    bullets.push(
      createProjectile(ship, {
        angleOffset: 0,
        speed: BULLET_SPEED + 80,
        lifetime: 1.08,
        size: 2.7,
        damage: 1,
      })
    );
  } else if (firedWeaponKey === "plasma") {
    bullets.push(
      createProjectile(ship, {
        angleOffset: 0,
        speed: BULLET_SPEED - 65,
        lifetime: 1.9,
        size: 5.3,
        damage: 2,
        color: getWeaponConfig("plasma").color,
      })
    );
  } else if (firedWeaponKey === "rocket") {
    bullets.push(
      createProjectile(ship, {
        kind: "rocket",
        angleOffset: 0,
        speed: BULLET_SPEED - 95,
        lifetime: 2.3,
        size: 4.8,
        damage: 2,
        color: getWeaponConfig("rocket").color,
        targetId: target?.id ?? null,
        turnRate: 2.8,
        explosionRadius: 54,
      })
    );
  } else {
    bullets.push(
      createProjectile(ship, {
        angleOffset: 0,
        speed: BULLET_SPEED,
        lifetime: BULLET_LIFETIME,
        size: 3,
        damage: 1,
      })
    );
  }

  if (Number.isFinite(ship.weaponCharges)) {
    ship.weaponCharges -= 1;
    if (ship.weaponCharges <= 0) {
      restoreDefaultWeapon(ship);
    }
  }

  if (bullets.length > MAX_BULLETS) {
    bullets.splice(0, bullets.length - MAX_BULLETS);
  }

  ship.reload = getRandomReload(firedWeaponKey);
  markRosterDirty();
  emitSparks(
    ship.x + Math.cos(ship.angle) * (ship.radius + 10),
    ship.y + Math.sin(ship.angle) * (ship.radius + 10),
    ship.color.stroke,
    4
  );
}

function weightedPickupChoice() {
  const pool = buildWeightedPickupPool();
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

function spawnPickup() {
  const pickupKey = weightedPickupChoice();
  if (!pickupKey) return false;
  const padding = 120;

  let x = randomBetween(padding, WORLD_WIDTH - padding);
  let y = randomBetween(padding, WORLD_HEIGHT - padding);
  let attempts = 0;

  while (
    attempts < 60 &&
    [...ships, ...pickups].some((entity) => Math.hypot(entity.x - x, entity.y - y) < 90)
  ) {
    x = randomBetween(padding, WORLD_WIDTH - padding);
    y = randomBetween(padding, WORLD_HEIGHT - padding);
    attempts += 1;
  }

  pickups.push({
    id: `pickup-${pickupKey}-${Math.round(Math.random() * 99999)}`,
    pickupKey,
    x,
    y,
    radius: PICKUP_RADIUS,
    pulse: randomBetween(0, Math.PI * 2),
    spin: randomBetween(-1.4, 1.4),
  });

  return true;
}

function killShip(ship) {
  ship.alive = false;
  ship.vx = 0;
  ship.vy = 0;
  emitSparks(ship.x, ship.y, ship.color.fill, 24);
}

function getPickupPriority(ship, pickup, nearestEnemyDistance) {
  const pickupDistance = distance(ship, pickup);
  let score = 220 - pickupDistance * 0.72;

  if (pickup.pickupKey === "repair") {
    score += (SHIP_MAX_HEALTH - ship.health) * 150;
    if (ship.health >= SHIP_MAX_HEALTH) score -= 120;
  } else if (pickup.pickupKey === "shield") {
    score += (3 - ship.shield) * 120;
    if (ship.shield >= 3) score -= 90;
  } else if (pickup.pickupKey === "speed") {
    score += ship.speedBoostTimer > 1 ? 25 : 170;
  } else {
    score += ship.weaponKey === "blaster" ? 180 : 110;
    if (ship.weaponKey === pickup.pickupKey) score -= 30;
    if (Number.isFinite(ship.weaponCharges) && ship.weaponCharges <= 2) score += 70;
  }

  if (nearestEnemyDistance < 260) {
    score += 45;
  }

  return score;
}

function buildPickupClaims(livingShips) {
  const claims = new Map();

  pickups.forEach((pickup) => {
    const nearestShips = [...livingShips]
      .sort((left, right) => distance(left, pickup) - distance(right, pickup))
      .slice(0, 2);

    claims.set(
      pickup.id,
      new Set(nearestShips.map((ship) => ship.id))
    );
  });

  return claims;
}

function updateShips(dt) {
  const livingShips = getLivingShips();
  const pickupClaims = buildPickupClaims(livingShips);
  let rosterDirty = false;

  livingShips.forEach((ship) => {
    const enemies = livingShips.filter((candidate) => candidate.id !== ship.id);
    if (!enemies.length) return;

    ship.flash = Math.max(0, ship.flash - dt * 4);
    ship.reload -= dt;
    ship.retargetTimer -= dt;
    ship.dodgeTimer -= dt;

    if (ship.speedBoostTimer > 0) {
      ship.speedBoostTimer = Math.max(0, ship.speedBoostTimer - dt);
      if (ship.speedBoostTimer === 0) {
        rosterDirty = true;
      }
    }

    let target = enemies[0];
    let nearestDistance = distance(ship, target);

    enemies.forEach((enemy) => {
      const currentDistance = distance(ship, enemy);
      if (currentDistance < nearestDistance) {
        nearestDistance = currentDistance;
        target = enemy;
      }
    });

    if (ship.retargetTimer <= 0) {
      const aimOffset = randomBetween(-0.45, 0.45);
      ship.targetAngle = Math.atan2(target.y - ship.y, target.x - ship.x) + aimOffset;
      ship.retargetTimer = randomBetween(0.18, 0.72);
    }

    let bestPickup = null;
    pickups.forEach((pickup) => {
      if (!pickupClaims.get(pickup.id)?.has(ship.id)) return;
      const score = getPickupPriority(ship, pickup, nearestDistance);
      if (!bestPickup || score > bestPickup.score) {
        bestPickup = { pickup, score, distance: distance(ship, pickup) };
      }
    });

    const isChasingPickup =
      !!bestPickup &&
      bestPickup.score > 90 &&
      bestPickup.distance < Math.min(380, nearestDistance + 160);
    if (isChasingPickup) {
      const pickupAngle = Math.atan2(
        bestPickup.pickup.y - ship.y,
        bestPickup.pickup.x - ship.x
      );
      const enemyAngle = Math.atan2(target.y - ship.y, target.x - ship.x);
      const pickupWeight =
        bestPickup.distance < PICKUP_MAGNET_RADIUS
          ? 0.18
          : nearestDistance < 520
            ? 0.55
            : 0.82;

      ship.targetAngle =
        blendAngles(enemyAngle, pickupAngle, pickupWeight) + randomBetween(-0.08, 0.08);
      ship.retargetTimer = Math.min(ship.retargetTimer, 0.14);
    }

    if (ship.dodgeTimer <= 0 && nearestDistance < 220 && !isChasingPickup) {
      ship.targetAngle += randomBetween(-1.3, 1.3);
      ship.dodgeTimer = randomBetween(0.25, 0.7);
    }

    const angleDelta = normalizeAngle(ship.targetAngle - ship.angle);
    const enemyAngleDelta = normalizeAngle(
      Math.atan2(target.y - ship.y, target.x - ship.x) - ship.angle
    );
    ship.angle += angleDelta * clamp(dt * 2.6, 0, 1);

    const effectiveSpeed = ship.baseSpeed * (ship.speedBoostTimer > 0 ? 1.55 : 1);
    const thrust = nearestDistance < 170 && !isChasingPickup ? -0.75 : isChasingPickup ? 1.2 : 1;
    ship.vx += Math.cos(ship.angle) * effectiveSpeed * thrust * dt;
    ship.vy += Math.sin(ship.angle) * effectiveSpeed * thrust * dt;

    const drift = nearestDistance < 220 && !isChasingPickup ? 0.985 : 0.992;
    ship.vx *= drift;
    ship.vy *= drift;

    ship.x += ship.vx * dt;
    ship.y += ship.vy * dt;

    if (ship.x < BORDER_PADDING || ship.x > WORLD_WIDTH - BORDER_PADDING) {
      ship.vx *= -0.92;
      ship.targetAngle = Math.PI - ship.targetAngle;
    }
    if (ship.y < BORDER_PADDING || ship.y > WORLD_HEIGHT - BORDER_PADDING) {
      ship.vy *= -0.92;
      ship.targetAngle *= -1;
    }

    ship.x = clamp(ship.x, BORDER_PADDING, WORLD_WIDTH - BORDER_PADDING);
    ship.y = clamp(ship.y, BORDER_PADDING, WORLD_HEIGHT - BORDER_PADDING);

    const fireTolerance = isChasingPickup ? 0.46 : 0.24;
    if (ship.reload <= 0 && nearestDistance < 560 && Math.abs(enemyAngleDelta) < fireTolerance) {
      fireWeapon(ship, target);
    }
  });

}

function updateBullets(dt) {
  bullets = bullets.filter((bullet) => bullet.age < bullet.life);

  bullets.forEach((bullet) => {
    if (bullet.kind === "rocket" && bullet.targetId) {
      const target = ships.find((candidate) => candidate.id === bullet.targetId && candidate.alive);
      if (target) {
        const targetAngle = Math.atan2(target.y - bullet.y, target.x - bullet.x);
        const currentAngle = Math.atan2(bullet.vy, bullet.vx);
        const turnStep = clamp(
          normalizeAngle(targetAngle - currentAngle),
          -bullet.turnRate * dt,
          bullet.turnRate * dt
        );
        const nextAngle = currentAngle + turnStep;
        const speed = Math.hypot(bullet.vx, bullet.vy);
        bullet.vx = Math.cos(nextAngle) * speed;
        bullet.vy = Math.sin(nextAngle) * speed;
      }
    }

    bullet.age += dt;
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;

    if (
      bullet.x < 0 ||
      bullet.x > WORLD_WIDTH ||
      bullet.y < 0 ||
      bullet.y > WORLD_HEIGHT
    ) {
      bullet.age = bullet.life;
      return;
    }

    for (const ship of ships) {
      if (!ship.alive || ship.id === bullet.ownerId) continue;
      if (Math.hypot(ship.x - bullet.x, ship.y - bullet.y) > ship.radius + bullet.size) {
        continue;
      }

      bullet.age = bullet.life;

      if (bullet.kind === "rocket") {
        explodeAt(
          bullet.x,
          bullet.y,
          bullet.color,
          bullet.ownerId,
          bullet.explosionRadius,
          bullet.damage
        );
      } else {
        applyDamage(ship, bullet.damage, bullet.color);
      }
      break;
    }
  });
}

function updateMines(dt) {
  mines = mines.filter((mine) => mine.age < mine.life);

  mines.forEach((mine) => {
    mine.age += dt;
    mine.x += mine.vx * dt;
    mine.y += mine.vy * dt;
    mine.vx *= 0.98;
    mine.vy *= 0.98;

    const armed = mine.age >= mine.armDelay;
    if (!armed) return;

    const triggerShip = ships.find((ship) => {
      if (!ship.alive || ship.id === mine.ownerId) return false;
      return Math.hypot(ship.x - mine.x, ship.y - mine.y) < mine.triggerRadius;
    });

    if (!triggerShip) return;

    mine.age = mine.life;
    explodeAt(mine.x, mine.y, mine.color, mine.ownerId, mine.explosionRadius, mine.damage);
  });
}

function updatePickups(dt) {
  const livingShips = getLivingShips();
  if (livingShips.length <= 1 || winner) return;
  const pickupClaims = buildPickupClaims(livingShips);

  pickupSpawnTimer -= dt;
  if (pickupSpawnTimer <= 0 && pickups.length < MAX_PICKUPS) {
    spawnPickup();
    pickupSpawnTimer = randomBetween(PICKUP_SPAWN_MIN, PICKUP_SPAWN_MAX);
  }

  pickups.forEach((pickup) => {
    pickup.pulse += dt * 2.2;
    pickup.spin += dt * 0.8;

    const eligibleShips = livingShips.filter((ship) => pickupClaims.get(pickup.id)?.has(ship.id));
    const magnetTarget = eligibleShips.find(
      (ship) => distance(ship, pickup) < PICKUP_MAGNET_RADIUS
    );

    if (!magnetTarget) return;

    const distanceToShip = distance(magnetTarget, pickup);
    if (distanceToShip < 1) return;

    const step = Math.min(PICKUP_MAGNET_SPEED * dt, distanceToShip);
    pickup.x += ((magnetTarget.x - pickup.x) / distanceToShip) * step;
    pickup.y += ((magnetTarget.y - pickup.y) / distanceToShip) * step;
  });

  pickups = pickups.filter((pickup) => {
    const collector = livingShips.find(
      (ship) => distance(ship, pickup) < ship.radius + pickup.radius + PICKUP_COLLECT_MARGIN
    );

    if (!collector) return true;

    if (WEAPON_TYPES[pickup.pickupKey]) {
      equipWeapon(collector, pickup.pickupKey);
    } else {
      applySupportPickup(collector, pickup.pickupKey);
    }

    const pickupConfig = getPickupConfig(pickup.pickupKey);
    setStatus(`${collector.name} podnosi: ${pickupConfig.pickupLabel}.`);
    emitSparks(pickup.x, pickup.y, pickupConfig.color, 14);
    return false;
  });
}

function updateSparks(dt) {
  sparks = sparks.filter((spark) => spark.age < spark.life);
  sparks.forEach((spark) => {
    spark.age += dt;
    spark.x += spark.vx * dt;
    spark.y += spark.vy * dt;
    spark.vx *= 0.97;
    spark.vy *= 0.97;
  });
}

function updateBeams(dt) {
  beams = beams.filter((beam) => beam.age < beam.life);
  beams.forEach((beam) => {
    beam.age += dt;
  });
}

function maybeResolveWinner() {
  const livingShips = getLivingShips();
  if (livingShips.length !== 1 || winner) return;

  setWinner(livingShips[0]);
  setStatus(`Losowanie zakończone. Wygrywa: ${livingShips[0].name}.`);
}

function drawBackground() {
  context.drawImage(backgroundCanvas, 0, 0);
}

function drawPickupSymbol(shape, color) {
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = 2;

  if (shape === "plus") {
    context.beginPath();
    context.moveTo(-7, 0);
    context.lineTo(7, 0);
    context.moveTo(0, -7);
    context.lineTo(0, 7);
    context.stroke();
    return;
  }

  if (shape === "bolt") {
    context.beginPath();
    context.moveTo(-4, -8);
    context.lineTo(2, -2);
    context.lineTo(-1, -2);
    context.lineTo(5, 8);
    context.lineTo(-2, 2);
    context.lineTo(1, 2);
    context.closePath();
    context.fill();
    return;
  }

  if (shape === "shield") {
    context.beginPath();
    context.moveTo(0, -9);
    context.lineTo(8, -4);
    context.lineTo(6, 6);
    context.lineTo(0, 10);
    context.lineTo(-6, 6);
    context.lineTo(-8, -4);
    context.closePath();
    context.stroke();
    return;
  }

  if (shape === "rocket") {
    context.beginPath();
    context.moveTo(0, -9);
    context.lineTo(6, 4);
    context.lineTo(0, 1);
    context.lineTo(-6, 4);
    context.closePath();
    context.stroke();
    context.beginPath();
    context.moveTo(-3, 5);
    context.lineTo(0, 9);
    context.lineTo(3, 5);
    context.stroke();
    return;
  }

  if (shape === "laser") {
    context.beginPath();
    context.moveTo(-8, -5);
    context.lineTo(8, -5);
    context.moveTo(-8, 5);
    context.lineTo(8, 5);
    context.stroke();
    context.beginPath();
    context.arc(0, 0, 2, 0, Math.PI * 2);
    context.fill();
    return;
  }

  if (shape === "mine") {
    context.beginPath();
    context.moveTo(0, -8);
    context.lineTo(8, 0);
    context.lineTo(0, 8);
    context.lineTo(-8, 0);
    context.closePath();
    context.stroke();
    context.beginPath();
    context.arc(0, 0, 2.5, 0, Math.PI * 2);
    context.fill();
    return;
  }

  if (shape === "fan") {
    context.beginPath();
    context.moveTo(-8, 6);
    context.lineTo(-2, -6);
    context.lineTo(0, 1);
    context.closePath();
    context.stroke();
    context.beginPath();
    context.moveTo(0, 6);
    context.lineTo(0, -8);
    context.lineTo(2, 1);
    context.closePath();
    context.stroke();
    context.beginPath();
    context.moveTo(8, 6);
    context.lineTo(2, -6);
    context.lineTo(0, 1);
    context.closePath();
    context.stroke();
    return;
  }

  if (shape === "chevrons") {
    context.beginPath();
    context.moveTo(-8, -5);
    context.lineTo(-1, 0);
    context.lineTo(-8, 5);
    context.moveTo(1, -5);
    context.lineTo(8, 0);
    context.lineTo(1, 5);
    context.stroke();
    return;
  }

  if (shape === "orb") {
    context.beginPath();
    context.arc(0, 0, 6, 0, Math.PI * 2);
    context.fill();
    return;
  }

  context.beginPath();
  context.moveTo(0, -8);
  context.lineTo(8, 7);
  context.lineTo(-8, 7);
  context.closePath();
  context.stroke();
}

function renderStaticBackground() {
  backgroundContext.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  const gradient = backgroundContext.createRadialGradient(
    WORLD_WIDTH / 2,
    WORLD_HEIGHT / 2,
    140,
    WORLD_WIDTH / 2,
    WORLD_HEIGHT / 2,
    WORLD_WIDTH * 0.75
  );
  gradient.addColorStop(0, "rgba(13, 34, 49, 0.75)");
  gradient.addColorStop(1, "rgba(2, 7, 11, 0.98)");

  backgroundContext.fillStyle = gradient;
  backgroundContext.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  backgroundContext.save();
  backgroundContext.strokeStyle = "rgba(126, 243, 197, 0.07)";
  backgroundContext.lineWidth = 1;

  for (let x = WORLD_GRID; x < WORLD_WIDTH; x += WORLD_GRID) {
    backgroundContext.beginPath();
    backgroundContext.moveTo(x, 0);
    backgroundContext.lineTo(x, WORLD_HEIGHT);
    backgroundContext.stroke();
  }

  for (let y = WORLD_GRID; y < WORLD_HEIGHT; y += WORLD_GRID) {
    backgroundContext.beginPath();
    backgroundContext.moveTo(0, y);
    backgroundContext.lineTo(WORLD_WIDTH, y);
    backgroundContext.stroke();
  }

  backgroundContext.restore();
}

function drawShipHealthBar(ship) {
  const barWidth = 52;
  const barHeight = 7;
  const x = ship.x - barWidth / 2;
  const y = ship.y - 38;
  const healthRatio = clamp(ship.health / SHIP_MAX_HEALTH, 0, 1);
  const shieldRatio = clamp(ship.shield / 4, 0, 1);

  context.save();
  context.fillStyle = "rgba(1, 7, 12, 0.75)";
  context.strokeStyle = "rgba(255, 255, 255, 0.16)";
  context.lineWidth = 1;
  context.beginPath();
  context.roundRect(x, y, barWidth, barHeight, 999);
  context.fill();
  context.stroke();

  if (healthRatio > 0) {
    context.fillStyle = ship.color.fill;
    context.beginPath();
    context.roundRect(x + 1, y + 1, (barWidth - 2) * healthRatio, barHeight - 2, 999);
    context.fill();
  }

  if (shieldRatio > 0) {
    context.fillStyle = "rgba(126, 219, 255, 0.95)";
    context.beginPath();
    context.roundRect(x, y - 6, barWidth * shieldRatio, 4, 999);
    context.fill();
  }

  context.restore();
}

function drawShip(ship) {
  context.save();
  context.translate(ship.x, ship.y);
  context.rotate(ship.angle);

  context.shadowColor = ship.color.glow;
  context.shadowBlur = ENABLE_GLOW_EFFECTS ? (ship.flash ? 18 : 10) : 0;

  if (ship.speedBoostTimer > 0) {
    context.strokeStyle = "rgba(255, 230, 109, 0.7)";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(-18, -6);
    context.lineTo(-34, -12);
    context.moveTo(-18, 6);
    context.lineTo(-34, 12);
    context.stroke();
  }

  const weapon = getWeaponConfig(ship.weaponKey);
  const hullFill = ship.flash ? "#ffffff" : ship.color.fill;
  context.strokeStyle = ship.color.stroke;
  context.lineWidth = 2;

  // Main fuselage
  context.fillStyle = hullFill;
  context.beginPath();
  context.moveTo(28, 0);
  context.lineTo(10, -6);
  context.lineTo(-6, -6);
  context.lineTo(-18, -3);
  context.lineTo(-18, 3);
  context.lineTo(-6, 6);
  context.lineTo(10, 6);
  context.closePath();
  context.fill();
  context.stroke();

  // Nose tip / cockpit line
  context.beginPath();
  context.moveTo(28, 0);
  context.lineTo(34, 0);
  context.lineTo(28, -3);
  context.closePath();
  context.fill();
  context.stroke();

  // S-foils / wings
  context.fillStyle = "rgba(229, 240, 255, 0.92)";

  context.beginPath();
  context.moveTo(8, -5);
  context.lineTo(-4, -11);
  context.lineTo(-24, -17);
  context.lineTo(-14, -7);
  context.closePath();
  context.fill();
  context.stroke();

  context.beginPath();
  context.moveTo(8, 5);
  context.lineTo(-4, 11);
  context.lineTo(-24, 17);
  context.lineTo(-14, 7);
  context.closePath();
  context.fill();
  context.stroke();

  context.beginPath();
  context.moveTo(3, -2);
  context.lineTo(-7, -6);
  context.lineTo(-24, -8);
  context.lineTo(-14, -1);
  context.closePath();
  context.fill();
  context.stroke();

  context.beginPath();
  context.moveTo(3, 2);
  context.lineTo(-7, 6);
  context.lineTo(-24, 8);
  context.lineTo(-14, 1);
  context.closePath();
  context.fill();
  context.stroke();

  // Engines
  context.fillStyle = ship.flash ? "#ffffff" : "rgba(14, 25, 39, 0.95)";
  [-14, -7, 7, 14].forEach((engineY) => {
    context.beginPath();
    context.roundRect(-31, engineY - 3, 12, 6, 999);
    context.fill();
    context.stroke();
  });

  // Engine glow
  context.fillStyle = ship.speedBoostTimer > 0 ? "#ffe66d" : weapon.color;
  context.shadowColor = ship.speedBoostTimer > 0 ? "#ffe66d" : weapon.color;
  context.shadowBlur = ENABLE_GLOW_EFFECTS ? (ship.speedBoostTimer > 0 ? 12 : 6) : 0;
  [-14, -7, 7, 14].forEach((engineY) => {
    context.beginPath();
    context.roundRect(-33, engineY - 2, 5, 4, 999);
    context.fill();
  });

  // Cockpit
  context.shadowBlur = ENABLE_GLOW_EFFECTS ? (ship.flash ? 18 : 10) : 0;
  context.fillStyle = "rgba(255, 255, 255, 0.9)";
  context.beginPath();
  context.ellipse(9, 0, 5, 3.2, 0, 0, Math.PI * 2);
  context.fill();

  // Weapon accent
  context.fillStyle = weapon.color;
  context.beginPath();
  context.arc(18, 0, 2.8, 0, Math.PI * 2);
  context.fill();

  context.restore();

  drawShipHealthBar(ship);

  if (ship.shield > 0) {
    context.save();
    context.strokeStyle = "rgba(126, 219, 255, 0.7)";
    context.lineWidth = 2;
    context.shadowColor = "rgba(126, 219, 255, 0.6)";
    context.shadowBlur = ENABLE_GLOW_EFFECTS ? 8 : 0;
    context.beginPath();
    context.arc(ship.x, ship.y, 20 + ship.shield * 1.5, 0, Math.PI * 2);
    context.stroke();
    context.restore();
  }

  context.save();
  context.font = "700 14px 'Trebuchet MS', sans-serif";
  context.textAlign = "center";
  context.fillStyle = "rgba(237, 248, 255, 0.82)";
  context.fillText(ship.name, ship.x, ship.y - 56);
  context.restore();
}

function drawPickups() {
  pickups.forEach((pickup) => {
    const pickupConfig = getPickupConfig(pickup.pickupKey);
    const pulseScale = 1 + Math.sin(pickup.pulse) * 0.08;

    context.save();
    context.translate(pickup.x, pickup.y);
    context.rotate(pickup.spin);
    context.shadowColor = pickupConfig.color;
    context.shadowBlur = ENABLE_GLOW_EFFECTS ? 10 : 0;

    context.fillStyle = "rgba(3, 12, 18, 0.82)";
    context.strokeStyle = pickupConfig.color;
    context.lineWidth = 2;
    context.beginPath();
    context.rect(-14 * pulseScale, -14 * pulseScale, 28 * pulseScale, 28 * pulseScale);
    context.fill();
    context.stroke();

    drawPickupSymbol(pickupConfig.shape, pickupConfig.color);
    context.restore();
  });
}

function drawMines() {
  mines.forEach((mine) => {
    const armed = mine.age >= mine.armDelay;
    context.save();
    context.translate(mine.x, mine.y);
    context.shadowColor = mine.color;
    context.shadowBlur = ENABLE_GLOW_EFFECTS ? (armed ? 10 : 4) : 0;
    context.strokeStyle = mine.color;
    context.fillStyle = armed ? "rgba(199, 255, 110, 0.18)" : "rgba(199, 255, 110, 0.08)";
    context.lineWidth = 2;
    context.beginPath();
    context.arc(0, 0, mine.radius, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.beginPath();
    context.moveTo(-6, 0);
    context.lineTo(6, 0);
    context.moveTo(0, -6);
    context.lineTo(0, 6);
    context.stroke();
    context.restore();
  });
}

function drawBullets() {
  bullets.forEach((bullet) => {
    const lifeRatio = 1 - bullet.age / bullet.life;
    context.save();
    context.fillStyle = bullet.color;
    context.shadowColor = bullet.color;
    context.shadowBlur = ENABLE_GLOW_EFFECTS ? (bullet.kind === "rocket" ? 10 : 4) : 0;
    context.globalAlpha = lifeRatio;
    context.beginPath();
    context.arc(bullet.x, bullet.y, bullet.size, 0, Math.PI * 2);
    context.fill();

    if (bullet.kind === "rocket") {
      context.strokeStyle = bullet.color;
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(bullet.x - bullet.vx * 0.015, bullet.y - bullet.vy * 0.015);
      context.lineTo(bullet.x - bullet.vx * 0.03, bullet.y - bullet.vy * 0.03);
      context.stroke();
    }
    context.restore();
  });
}

function drawBeams() {
  beams.forEach((beam) => {
    const alpha = 1 - beam.age / beam.life;
    context.save();
    context.globalAlpha = alpha;
    context.strokeStyle = beam.color;
    context.shadowColor = beam.color;
    context.shadowBlur = ENABLE_GLOW_EFFECTS ? 8 : 0;
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(beam.x1, beam.y1);
    context.lineTo(beam.x2, beam.y2);
    context.stroke();
    context.restore();
  });
}

function drawSparks() {
  sparks.forEach((spark) => {
    const alpha = 1 - spark.age / spark.life;
    context.save();
    context.globalAlpha = alpha;
    context.fillStyle = spark.color;
    context.beginPath();
    context.arc(spark.x, spark.y, 2, 0, Math.PI * 2);
    context.fill();
    context.restore();
  });
}

function drawWinnerHalo() {
  if (!winner) return;

  context.save();
  context.strokeStyle = winner.color.stroke;
  context.lineWidth = 3;
  context.shadowColor = winner.color.fill;
  context.shadowBlur = ENABLE_GLOW_EFFECTS ? 12 : 0;
  context.beginPath();
  context.arc(winner.x, winner.y, 28, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}

function render() {
  drawBackground();
  drawSparks();
  drawPickups();
  drawMines();
  drawBullets();
  ships.filter((ship) => ship.alive).forEach(drawShip);
  drawBeams();
  drawWinnerHalo();
}

function animate(now) {
  if (!lastTick) lastTick = now;
  const dt = Math.min((now - lastTick) / 1000, 0.033);
  lastTick = now;

  updateShips(dt);
  updateBullets(dt);
  updateMines(dt);
  updatePickups(dt);
  updateSparks(dt);
  updateBeams(dt);
  maybeResolveWinner();
  if (rosterDirty) {
    updateRoster();
  }
  render();

  animationFrame = window.requestAnimationFrame(animate);
}

function ensureAnimation() {
  if (animationFrame) {
    window.cancelAnimationFrame(animationFrame);
  }
  lastTick = 0;
  animationFrame = window.requestAnimationFrame(animate);
}

function startBattle() {
  const names = parseNames(namesInput.value);
  saveNamesText();

  if (names.length < 2) {
    setStatus("Podaj przynajmniej 2 imiona, żeby rozpocząć walkę.");
    clearWinner();
    return;
  }

  resetBattle(names);
  ensureAnimation();
}

startButton.addEventListener("click", startBattle);
shuffleButton.addEventListener("click", () => {
  saveNamesText();
  if (ships.length < 2) {
    startBattle();
    return;
  }

  resetBattle(parseNames(namesInput.value));
  ensureAnimation();
});

bonusOptions.addEventListener("change", () => {
  syncPickupsWithOptions();
  const enabledCount = getEnabledPickupKeys().length;
  if (enabledCount === 0) {
    setStatus("Wszystkie bonusy na mapie są wyłączone.");
  } else {
    setStatus(`Aktywne bonusy na mapie: ${enabledCount}.`);
  }
  render();
});

namesInput.addEventListener("input", () => {
  saveNamesText();
});

window.addEventListener("resize", render);

renderStaticBackground();
createBonusOptionsUI();
resetBattle(STARTING_NAMES);
setStatus('Lista załogi gotowa. Kliknij "Uruchom losowanie".');
render();
