// ============================================================================
// SQUARE ARENA — 2D Top-Down Shooting Game (Plain JavaScript + HTML5 Canvas)
// ============================================================================
// Self-contained, zero-asset game engine using only simple coloured shapes.
// Organized into modular sections (Walls & LOS, Health, Player, Bot, Bullets,
// Input, Game Loop) for clean readability and easy extension.
// ============================================================================

// ----------------------------------------------------------------------------
// 1. CONFIGURATION & CONSTANTS
// ----------------------------------------------------------------------------
const GAME_CONFIG = {
  width: 960,
  height: 640,
  wallThickness: 24,

  // Player settings
  playerSize: 28,
  playerSpeed: 240, // pixels per second
  playerMaxHealth: 100,
  playerColor: '#38bdf8', // sky-400
  playerBorderColor: '#bae6fd', // sky-200
  playerBarrelColor: '#f8fafc', // slate-50

  // Bot settings (slightly slower than player)
  botSize: 28,
  botSpeed: 190, // pixels per second (< playerSpeed 240)
  botMaxHealth: 100,
  botFireCooldown: 0.6, // seconds between bot shots when in line of sight
  botWaypointArrivalRadius: 16,
  botStuckCheckInterval: 1.0, // seconds before checking if bot barely moved
  botStuckMinDistance: 18, // minimum movement expected in 1 second
  botColor: '#f43f5e', // rose-500 (distinct from player sky-blue)
  botBorderColor: '#fecdd3', // rose-200
  botBarrelColor: '#fff1f2', // rose-50

  // Bullet settings
  bulletRadius: 5,
  bulletSpeed: 640, // pixels per second
  bulletDamage: 20,
  playerBulletColor: '#fbbf24', // amber-400
  playerBulletBorderColor: '#fef3c7', // amber-100
  botBulletColor: '#fb7185', // rose-400
  botBulletBorderColor: '#ffe4e6', // rose-100
  fireCooldown: 0.3, // player fire rate limit (one bullet every 0.3s)

  // Health bar settings
  healthBarWidth: 36,
  healthBarHeight: 5,
  healthBarOffset: 12, // pixels above character square

  // Arena visual palette (simple coloured shapes only)
  floorColor: '#1e293b', // slate-800
  gridColor: '#273549', // subtle grid lines for spatial awareness
  wallFillColor: '#475569', // slate-600
  wallHighlightColor: '#64748b', // slate-500
  wallBorderColor: '#0f172a', // slate-900
  crosshairColor: 'rgba(248, 250, 252, 0.85)',
  botSightlineColor: 'rgba(244, 63, 94, 0.22)',
};

// ----------------------------------------------------------------------------
// 2. GAME STATE FACTORY
// ----------------------------------------------------------------------------

/**
 * Creates a fresh game state object with player in bottom-left and bot in top-right.
 */
function createInitialGameState() {
  const walls = createMazeWalls(GAME_CONFIG.width, GAME_CONFIG.height, GAME_CONFIG.wallThickness);
  const waypoints = createBotWaypoints();
  const player = createPlayer(GAME_CONFIG);
  const bot = createBot(GAME_CONFIG, waypoints);

  return {
    width: GAME_CONFIG.width,
    height: GAME_CONFIG.height,
    walls: walls,
    waypoints: waypoints,
    player: player,
    bot: bot,
    bullets: [],
    outcome: null, // null | 'win' | 'lose'
    stats: {
      shotsFired: 0,
    },
    input: {
      keys: {
        w: false,
        a: false,
        s: false,
        d: false,
      },
      mouse: {
        x: player.x + 120,
        y: player.y - 60,
        isDown: false,
        hasMoved: false,
      },
      // Mobile virtual joystick states (normalized vectors in [-1, 1])
      virtualMove: {
        x: 0,
        y: 0,
      },
      virtualAim: {
        x: 0,
        y: 0,
        active: false,
        firing: false,
      },
    },
    isPaused: false,
  };
}

// ----------------------------------------------------------------------------
// 3. WALLS, COLLISION & LINE-OF-SIGHT MODULE
// ----------------------------------------------------------------------------

/**
 * Builds the fixed maze-like room made of axis-aligned rectangular walls.
 * Each wall is `{ x, y, w, h }`.
 * All corridors are at least 70px wide so 28px characters move smoothly.
 *
 * @param {number} width - Canvas logical width
 * @param {number} height - Canvas logical height
 * @param {number} t - Outer perimeter wall thickness
 * @returns {Array<{x: number, y: number, w: number, h: number}>}
 */
function createMazeWalls(width, height, t) {
  return [
    // Outer room boundary walls
    { x: 0, y: 0, w: width, h: t }, // Top
    { x: 0, y: height - t, w: width, h: t }, // Bottom
    { x: 0, y: t, w: t, h: height - t * 2 }, // Left
    { x: width - t, y: t, w: t, h: height - t * 2 }, // Right

    // Bottom-left spawn pocket walls (keeps bottom-left corner clear)
    { x: 24, y: 380, w: 120, h: 24 },
    { x: 160, y: 460, w: 24, h: 76 },

    // Left & top-left maze sections
    { x: 24, y: 120, w: 144, h: 24 },
    { x: 144, y: 190, w: 24, h: 110 },

    // Center-left dividers
    { x: 260, y: 120, w: 24, h: 170 },
    { x: 260, y: 390, w: 130, h: 24 },
    { x: 260, y: 500, w: 24, h: 116 },

    // Central T-shaped bunker and lower cover
    { x: 390, y: 200, w: 180, h: 24 },
    { x: 468, y: 224, w: 24, h: 96 },
    { x: 390, y: 500, w: 180, h: 24 },

    // Right-side maze corridors (keeps top-right bot spawn clear)
    { x: 570, y: 24, w: 24, h: 100 },
    { x: 660, y: 120, w: 160, h: 24 },
    { x: 660, y: 240, w: 24, h: 170 },
    { x: 570, y: 390, w: 114, h: 24 },

    // Far-right & bottom-right cover
    { x: 770, y: 250, w: 24, h: 160 },
    { x: 660, y: 500, w: 180, h: 24 },
  ];
}

/**
 * Checks whether an axis-aligned rectangle overlaps any wall in the maze.
 *
 * @param {number} rx - Top-left X of rectangle
 * @param {number} ry - Top-left Y of rectangle
 * @param {number} rw - Rectangle width
 * @param {number} rh - Rectangle height
 * @param {Array<{x: number, y: number, w: number, h: number}>} walls
 * @returns {boolean}
 */
function isRectCollidingWithWalls(rx, ry, rw, rh, walls) {
  for (let i = 0; i < walls.length; i++) {
    const wall = walls[i];
    const overlaps =
      rx < wall.x + wall.w &&
      rx + rw > wall.x &&
      ry < wall.y + wall.h &&
      ry + rh > wall.y;

    if (overlaps) {
      return true;
    }
  }
  return false;
}

/**
 * Checks whether a circle intersects a single axis-aligned rectangle.
 * Used for both bullet-vs-wall and bullet-vs-character collisions.
 *
 * @param {number} cx
 * @param {number} cy
 * @param {number} radius
 * @param {{x: number, y: number, w: number, h: number}} rect
 * @returns {boolean}
 */
function isCircleCollidingWithRect(cx, cy, radius, rect) {
  const closestX = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const closestY = Math.max(rect.y, Math.min(cy, rect.y + rect.h));

  const dx = cx - closestX;
  const dy = cy - closestY;

  return dx * dx + dy * dy <= radius * radius;
}

/**
 * Checks whether a circle (such as a bullet) intersects any wall rectangle.
 *
 * @param {number} cx
 * @param {number} cy
 * @param {number} radius
 * @param {Array<{x: number, y: number, w: number, h: number}>} walls
 * @returns {boolean}
 */
function isCircleCollidingWithWalls(cx, cy, radius, walls) {
  for (let i = 0; i < walls.length; i++) {
    if (isCircleCollidingWithRect(cx, cy, radius, walls[i])) {
      return true;
    }
  }
  return false;
}

/**
 * Checks whether a line segment from (x1, y1) to (x2, y2) intersects a wall
 * rectangle using the Liang-Barsky slab intersection algorithm.
 *
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 * @param {{x: number, y: number, w: number, h: number}} rect
 * @returns {boolean}
 */
function segmentIntersectsRect(x1, y1, x2, y2, rect) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let tMin = 0;
  let tMax = 1;

  // Test intersection against vertical slab [rect.x, rect.x + rect.w]
  if (Math.abs(dx) < 1e-8) {
    if (x1 < rect.x || x1 > rect.x + rect.w) return false;
  } else {
    const invDx = 1 / dx;
    let t1 = (rect.x - x1) * invDx;
    let t2 = (rect.x + rect.w - x1) * invDx;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }

  // Test intersection against horizontal slab [rect.y, rect.y + rect.h]
  if (Math.abs(dy) < 1e-8) {
    if (y1 < rect.y || y1 > rect.y + rect.h) return false;
  } else {
    const invDy = 1 / dy;
    let t1 = (rect.y - y1) * invDy;
    let t2 = (rect.y + rect.h - y1) * invDy;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }

  return true;
}

/**
 * Returns true if a straight line between (x1, y1) and (x2, y2) is unobstructed
 * by any wall in the maze.
 *
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 * @param {Array<{x: number, y: number, w: number, h: number}>} walls
 * @returns {boolean}
 */
function hasLineOfSight(x1, y1, x2, y2, walls) {
  for (let i = 0; i < walls.length; i++) {
    if (segmentIntersectsRect(x1, y1, x2, y2, walls[i])) {
      return false;
    }
  }
  return true;
}

/**
 * Moves a square entity along X and Y independently so it slides smoothly along
 * walls and never gets stuck or passes through them.
 *
 * @param {{x: number, y: number, size: number}} entity
 * @param {number} dx
 * @param {number} dy
 * @param {Array<{x: number, y: number, w: number, h: number}>} walls
 * @returns {{ hitX: boolean, hitY: boolean }}
 */
function moveSquareWithWallCollision(entity, dx, dy, walls) {
  const half = entity.size / 2;
  let hitX = false;
  let hitY = false;

  if (dx !== 0) {
    const nextX = entity.x + dx;
    if (!isRectCollidingWithWalls(nextX - half, entity.y - half, entity.size, entity.size, walls)) {
      entity.x = nextX;
    } else {
      hitX = true;
    }
  }

  if (dy !== 0) {
    const nextY = entity.y + dy;
    if (!isRectCollidingWithWalls(entity.x - half, nextY - half, entity.size, entity.size, walls)) {
      entity.y = nextY;
    } else {
      hitY = true;
    }
  }

  return { hitX, hitY };
}

/**
 * Draws all rectangular maze walls onto the canvas.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<{x: number, y: number, w: number, h: number}>} walls
 */
function drawWalls(ctx, walls) {
  for (let i = 0; i < walls.length; i++) {
    const wall = walls[i];

    // Base wall fill
    ctx.fillStyle = GAME_CONFIG.wallFillColor;
    ctx.fillRect(wall.x, wall.y, wall.w, wall.h);

    // Subtle top/left bevel highlight for depth using simple rectangles
    ctx.fillStyle = GAME_CONFIG.wallHighlightColor;
    ctx.fillRect(wall.x, wall.y, wall.w, 3);
    ctx.fillRect(wall.x, wall.y, 3, wall.h);

    // Crisp outer border
    ctx.strokeStyle = GAME_CONFIG.wallBorderColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(wall.x, wall.y, wall.w, wall.h);
  }
}

// ----------------------------------------------------------------------------
// 4. HEALTH & COMBAT HELPERS
// ----------------------------------------------------------------------------

/**
 * Draws a small horizontal health bar directly above a character square.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} centerX
 * @param {number} centerY
 * @param {number} entitySize
 * @param {number} health
 * @param {number} maxHealth
 */
function drawHealthBar(ctx, centerX, centerY, entitySize, health, maxHealth) {
  const barW = GAME_CONFIG.healthBarWidth;
  const barH = GAME_CONFIG.healthBarHeight;
  const barX = centerX - barW / 2;
  const barY = centerY - entitySize / 2 - GAME_CONFIG.healthBarOffset;
  const ratio = Math.max(0, Math.min(1, health / maxHealth));

  // Background track
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);

  // Health fill colour shifts from emerald -> amber -> red as health drops
  let fillColor = '#10b981';
  if (ratio <= 0.3) {
    fillColor = '#ef4444';
  } else if (ratio <= 0.6) {
    fillColor = '#f59e0b';
  }

  if (ratio > 0) {
    ctx.fillStyle = fillColor;
    ctx.fillRect(barX, barY, barW * ratio, barH);
  }

  // Crisp hairline border
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;
  ctx.strokeRect(barX - 1, barY - 1, barW + 2, barH + 2);
}

/**
 * Evaluates win/lose conditions based on player and bot health.
 *
 * @param {ReturnType<typeof createInitialGameState>} state
 */
function checkGameOutcome(state) {
  if (state.outcome !== null) return;

  if (state.bot.health <= 0) {
    state.bot.health = 0;
    state.outcome = 'win';
  } else if (state.player.health <= 0) {
    state.player.health = 0;
    state.outcome = 'lose';
  }
}

// ----------------------------------------------------------------------------
// 5. PLAYER MODULE
// ----------------------------------------------------------------------------

/**
 * Creates the player object spawned in the bottom-left corner of the room.
 *
 * @param {typeof GAME_CONFIG} config
 */
function createPlayer(config) {
  const spawnX = config.wallThickness + 52; // 76px from left edge
  const spawnY = config.height - config.wallThickness - 52; // 564px from top

  return {
    x: spawnX,
    y: spawnY,
    size: config.playerSize,
    speed: config.playerSpeed,
    angle: 0, // facing angle in radians toward mouse cursor or right joystick
    fireCooldownRemaining: 0, // seconds remaining until next allowed shot
    health: config.playerMaxHealth,
    maxHealth: config.playerMaxHealth,
  };
}

/**
 * Updates player movement (WASD or left virtual joystick), wall collision,
 * facing direction (mouse cursor or right virtual joystick), and firing cooldown.
 *
 * @param {ReturnType<typeof createInitialGameState>} state
 * @param {number} dt - Delta time in seconds
 */
function updatePlayer(state, dt) {
  const { player, input, walls } = state;
  if (player.health <= 0) return;

  // 1. Reduce firing cooldown timer
  if (player.fireCooldownRemaining > 0) {
    player.fireCooldownRemaining = Math.max(0, player.fireCooldownRemaining - dt);
  }

  // 2. Compute movement vector from WASD keys or left virtual joystick
  let moveX = 0;
  let moveY = 0;
  if (input.keys.w) moveY -= 1;
  if (input.keys.s) moveY += 1;
  if (input.keys.a) moveX -= 1;
  if (input.keys.d) moveX += 1;

  if (moveX !== 0 || moveY !== 0) {
    const length = Math.hypot(moveX, moveY);
    moveX /= length;
    moveY /= length;
  } else if (input.virtualMove.x !== 0 || input.virtualMove.y !== 0) {
    // Clamp virtual joystick vector magnitude to 1 while preserving analog speed
    const mag = Math.hypot(input.virtualMove.x, input.virtualMove.y);
    if (mag > 1) {
      moveX = input.virtualMove.x / mag;
      moveY = input.virtualMove.y / mag;
    } else {
      moveX = input.virtualMove.x;
      moveY = input.virtualMove.y;
    }
  }

  if (moveX !== 0 || moveY !== 0) {
    const deltaX = moveX * player.speed * dt;
    const deltaY = moveY * player.speed * dt;
    moveSquareWithWallCollision(player, deltaX, deltaY, walls);
  }

  // 3. Always face either the active right virtual joystick or the mouse cursor
  if (input.virtualAim.active && (input.virtualAim.x !== 0 || input.virtualAim.y !== 0)) {
    player.angle = Math.atan2(input.virtualAim.y, input.virtualAim.x);
  } else {
    player.angle = Math.atan2(input.mouse.y - player.y, input.mouse.x - player.x);
  }

  // 4. Handle shooting if left mouse button or right virtual joystick trigger is active
  if ((input.mouse.isDown || input.virtualAim.firing) && canFireBullet(player)) {
    spawnBullet(state, player, 'player');
  }
}

/**
 * Renders the player as a coloured square rotated toward the aim target,
 * plus its horizontal health bar directly above it.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {ReturnType<typeof createPlayer>} player
 */
function drawPlayer(ctx, player) {
  const half = player.size / 2;

  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.angle);

  // Main player square
  ctx.fillStyle = GAME_CONFIG.playerColor;
  ctx.fillRect(-half, -half, player.size, player.size);

  // Crisp square outline
  ctx.strokeStyle = GAME_CONFIG.playerBorderColor;
  ctx.lineWidth = 2;
  ctx.strokeRect(-half, -half, player.size, player.size);

  // Simple front barrel rectangle showing exact facing direction toward cursor
  ctx.fillStyle = GAME_CONFIG.playerBarrelColor;
  ctx.fillRect(half - 4, -3, 12, 6);

  ctx.restore();

  // Draw health bar unrotated above the player
  drawHealthBar(ctx, player.x, player.y, player.size, player.health, player.maxHealth);
}

// ----------------------------------------------------------------------------
// 6. BOT MODULE (Waypoint Patrol + Line-of-Sight Shooting)
// ----------------------------------------------------------------------------

/**
 * Defines 10 patrol waypoints positioned in open corridors and rooms of the maze.
 * Every point has ample clearance from surrounding walls.
 *
 * @returns {Array<{x: number, y: number}>}
 */
function createBotWaypoints() {
  return [
    { x: 85, y: 72 },   // 0: Top-left corner room
    { x: 340, y: 80 },  // 1: Top-center-left corridor
    { x: 880, y: 76 },  // 2: Top-right spawn corner
    { x: 84, y: 260 },  // 3: Mid-left corridor
    { x: 214, y: 340 }, // 4: Center-left junction
    { x: 340, y: 340 }, // 5: Central open hub (north-west)
    { x: 480, y: 455 }, // 6: Central open hub (south)
    { x: 725, y: 192 }, // 7: Mid-right open hall
    { x: 865, y: 330 }, // 8: Far-right corridor
    { x: 615, y: 568 }, // 9: Bottom-right open lane
  ];
}

/**
 * Picks a new random waypoint index different from the current target.
 *
 * @param {Array<{x: number, y: number}>} waypoints
 * @param {number} excludeIndex
 * @returns {number}
 */
function pickRandomWaypointIndex(waypoints, excludeIndex) {
  if (waypoints.length <= 1) return 0;

  let nextIndex = Math.floor(Math.random() * waypoints.length);
  if (nextIndex === excludeIndex) {
    nextIndex = (nextIndex + 1 + Math.floor(Math.random() * (waypoints.length - 1))) % waypoints.length;
  }
  return nextIndex;
}

/**
 * Creates the enemy bot spawned in the top-right corner, opposite the player.
 *
 * @param {typeof GAME_CONFIG} config
 * @param {Array<{x: number, y: number}>} waypoints
 */
function createBot(config, waypoints) {
  const spawnX = config.width - config.wallThickness - 52; // 884px from left edge
  const spawnY = config.wallThickness + 52; // 76px from top edge
  const initialWaypointIndex = pickRandomWaypointIndex(waypoints, 2); // avoid starting on top-right spawn point

  return {
    x: spawnX,
    y: spawnY,
    size: config.botSize,
    speed: config.botSpeed,
    angle: Math.PI,
    health: config.botMaxHealth,
    maxHealth: config.botMaxHealth,

    // Waypoint patrol & stuck-recovery state
    waypointIndex: initialWaypointIndex,
    stuckTimer: 0,
    lastCheckX: spawnX,
    lastCheckY: spawnY,

    // Line-of-sight & combat state
    canSeePlayer: false,
    fireCooldownRemaining: 0.4, // brief initial grace period after spawn
  };
}

/**
 * Updates the bot's waypoint patrol, wall-sliding collision, 1-second stuck
 * detection, line-of-sight check, aiming, and shooting.
 *
 * @param {ReturnType<typeof createInitialGameState>} state
 * @param {number} dt - Delta time in seconds
 */
function updateBot(state, dt) {
  const { bot, player, walls, waypoints } = state;
  if (bot.health <= 0) return;

  // 1. Tick bot fire-rate cooldown
  if (bot.fireCooldownRemaining > 0) {
    bot.fireCooldownRemaining = Math.max(0, bot.fireCooldownRemaining - dt);
  }

  // 2. Waypoint patrol movement with wall-sliding collision
  const target = waypoints[bot.waypointIndex];
  const toTargetX = target.x - bot.x;
  const toTargetY = target.y - bot.y;
  const distToTarget = Math.hypot(toTargetX, toTargetY);

  let moveDirX = 0;
  let moveDirY = 0;

  if (distToTarget <= GAME_CONFIG.botWaypointArrivalRadius) {
    // Arrived at waypoint: pick a new random waypoint
    bot.waypointIndex = pickRandomWaypointIndex(waypoints, bot.waypointIndex);
    bot.stuckTimer = 0;
    bot.lastCheckX = bot.x;
    bot.lastCheckY = bot.y;
  } else if (distToTarget > 0) {
    moveDirX = toTargetX / distToTarget;
    moveDirY = toTargetY / distToTarget;

    const dx = moveDirX * bot.speed * dt;
    const dy = moveDirY * bot.speed * dt;

    // Independent X/Y wall-sliding lets the bot glide along walls smoothly
    moveSquareWithWallCollision(bot, dx, dy, walls);
  }

  // 3. Stuck detection: if bot barely moved in the last 1 second, pick a new waypoint
  bot.stuckTimer += dt;
  if (bot.stuckTimer >= GAME_CONFIG.botStuckCheckInterval) {
    const movedDistance = Math.hypot(bot.x - bot.lastCheckX, bot.y - bot.lastCheckY);
    if (movedDistance < GAME_CONFIG.botStuckMinDistance) {
      bot.waypointIndex = pickRandomWaypointIndex(waypoints, bot.waypointIndex);
    }
    bot.stuckTimer = 0;
    bot.lastCheckX = bot.x;
    bot.lastCheckY = bot.y;
  }

  // 4. Line-of-sight check: bot can only see player if straight line clears all walls
  bot.canSeePlayer =
    player.health > 0 && hasLineOfSight(bot.x, bot.y, player.x, player.y, walls);

  if (bot.canSeePlayer) {
    // Aim directly at the player and shoot when fire cooldown allows
    bot.angle = Math.atan2(player.y - bot.y, player.x - bot.x);

    if (bot.fireCooldownRemaining <= 0) {
      bot.fireCooldownRemaining = GAME_CONFIG.botFireCooldown;
      spawnBullet(state, bot, 'bot');
    }
  } else if (moveDirX !== 0 || moveDirY !== 0) {
    // Otherwise face the direction of patrol movement
    bot.angle = Math.atan2(moveDirY, moveDirX);
  }
}

/**
 * Renders the bot as a distinct coloured square with a directional barrel,
 * optional faint line-of-sight indicator when actively targeting the player,
 * and a horizontal health bar above it.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {ReturnType<typeof createBot>} bot
 * @param {ReturnType<typeof createPlayer>} player
 */
function drawBot(ctx, bot, player) {
  if (bot.health <= 0) return;

  // Faint dashed sightline only when the bot has unobstructed line of sight
  if (bot.canSeePlayer && player.health > 0) {
    ctx.save();
    ctx.strokeStyle = GAME_CONFIG.botSightlineColor;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(bot.x, bot.y);
    ctx.lineTo(player.x, player.y);
    ctx.stroke();
    ctx.restore();
  }

  const half = bot.size / 2;

  ctx.save();
  ctx.translate(bot.x, bot.y);
  ctx.rotate(bot.angle);

  // Main bot square (rose-red so it stands apart clearly from player & walls)
  ctx.fillStyle = GAME_CONFIG.botColor;
  ctx.fillRect(-half, -half, bot.size, bot.size);

  // Crisp square outline
  ctx.strokeStyle = GAME_CONFIG.botBorderColor;
  ctx.lineWidth = 2;
  ctx.strokeRect(-half, -half, bot.size, bot.size);

  // Front barrel indicator showing bot aim/facing direction
  ctx.fillStyle = GAME_CONFIG.botBarrelColor;
  ctx.fillRect(half - 4, -3, 12, 6);

  ctx.restore();

  // Draw health bar unrotated above the bot
  drawHealthBar(ctx, bot.x, bot.y, bot.size, bot.health, bot.maxHealth);
}

// ----------------------------------------------------------------------------
// 7. BULLETS MODULE
// ----------------------------------------------------------------------------

/**
 * Checks whether the player's 0.3s fire rate cooldown has elapsed.
 *
 * @param {ReturnType<typeof createPlayer>} player
 * @returns {boolean}
 */
function canFireBullet(player) {
  return player.fireCooldownRemaining <= 0;
}

/**
 * Spawns a bullet from the front edge of either the player or the bot.
 *
 * @param {ReturnType<typeof createInitialGameState>} state
 * @param {{x: number, y: number, size: number, angle: number, fireCooldownRemaining: number}} shooter
 * @param {'player' | 'bot'} owner
 */
function spawnBullet(state, shooter, owner) {
  const { bullets, walls, stats } = state;

  if (owner === 'player') {
    shooter.fireCooldownRemaining = GAME_CONFIG.fireCooldown;
    stats.shotsFired += 1;
  }

  // Spawn slightly ahead of the shooter square's front edge
  const spawnOffset = shooter.size / 2 + GAME_CONFIG.bulletRadius + 2;
  const dirX = Math.cos(shooter.angle);
  const dirY = Math.sin(shooter.angle);

  const startX = shooter.x + dirX * spawnOffset;
  const startY = shooter.y + dirY * spawnOffset;

  // If the barrel tip is pressed directly inside a wall, bullet disappears immediately
  if (isCircleCollidingWithWalls(startX, startY, GAME_CONFIG.bulletRadius, walls)) {
    return;
  }

  bullets.push({
    x: startX,
    y: startY,
    vx: dirX * GAME_CONFIG.bulletSpeed,
    vy: dirY * GAME_CONFIG.bulletSpeed,
    radius: GAME_CONFIG.bulletRadius,
    owner: owner,
  });
}

/**
 * Advances all active bullets using sub-stepping so fast bullets never skip
 * through walls or characters, removes bullets on wall/target impact, and
 * applies 20 damage when a bullet hits the opposing character.
 *
 * @param {ReturnType<typeof createInitialGameState>} state
 * @param {number} dt - Delta time in seconds
 */
function updateBullets(state, dt) {
  const { bullets, walls, bot, player, width, height } = state;

  const botRect = {
    x: bot.x - bot.size / 2,
    y: bot.y - bot.size / 2,
    w: bot.size,
    h: bot.size,
  };

  const playerRect = {
    x: player.x - player.size / 2,
    y: player.y - player.size / 2,
    w: player.size,
    h: player.size,
  };

  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i];
    const moveX = bullet.vx * dt;
    const moveY = bullet.vy * dt;
    const distance = Math.hypot(moveX, moveY);

    // Sub-step in <= 4px increments to prevent tunneling through walls or characters
    const steps = Math.max(1, Math.ceil(distance / 4));
    const stepX = moveX / steps;
    const stepY = moveY / steps;

    let hitWall = false;
    let hitTarget = false;

    for (let s = 0; s < steps; s++) {
      bullet.x += stepX;
      bullet.y += stepY;

      if (isCircleCollidingWithWalls(bullet.x, bullet.y, bullet.radius, walls)) {
        hitWall = true;
        break;
      }

      if (
        bullet.owner === 'player' &&
        bot.health > 0 &&
        isCircleCollidingWithRect(bullet.x, bullet.y, bullet.radius, botRect)
      ) {
        bot.health = Math.max(0, bot.health - GAME_CONFIG.bulletDamage);
        hitTarget = true;
        break;
      }

      if (
        bullet.owner === 'bot' &&
        player.health > 0 &&
        isCircleCollidingWithRect(bullet.x, bullet.y, bullet.radius, playerRect)
      ) {
        player.health = Math.max(0, player.health - GAME_CONFIG.bulletDamage);
        hitTarget = true;
        break;
      }
    }

    const outOfBounds =
      bullet.x < 0 || bullet.x > width || bullet.y < 0 || bullet.y > height;

    // Remove bullet immediately if it hit a wall, hit a target, or exited bounds
    if (hitWall || hitTarget || outOfBounds) {
      bullets.splice(i, 1);
    }
  }

  checkGameOutcome(state);
}

/**
 * Draws all active bullets as simple coloured circles (amber for player, rose for bot).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<{x: number, y: number, radius: number, owner: 'player' | 'bot'}>} bullets
 */
function drawBullets(ctx, bullets) {
  for (let i = 0; i < bullets.length; i++) {
    const bullet = bullets[i];
    const isBotBullet = bullet.owner === 'bot';

    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
    ctx.fillStyle = isBotBullet
      ? GAME_CONFIG.botBulletColor
      : GAME_CONFIG.playerBulletColor;
    ctx.fill();

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = isBotBullet
      ? GAME_CONFIG.botBulletBorderColor
      : GAME_CONFIG.playerBulletBorderColor;
    ctx.stroke();
  }
}

// ----------------------------------------------------------------------------
// 8. INPUT MODULE
// ----------------------------------------------------------------------------

/**
 * Converts a browser PointerEvent client position into logical canvas coordinates,
 * accounting for responsive CSS scaling of the canvas element.
 */
function getCanvasMousePosition(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
}

/**
 * Binds keyboard (WASD) and mouse (aim + left-click shoot) event listeners.
 * Returns a cleanup function that detaches all listeners cleanly.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {() => ReturnType<typeof createInitialGameState>} getState
 * @returns {() => void}
 */
function attachInputHandlers(canvas, getState) {
  function handleKeyDown(event) {
    const key = event.key.toLowerCase();
    const state = getState();
    if (key in state.input.keys) {
      state.input.keys[key] = true;
    }
  }

  function handleKeyUp(event) {
    const key = event.key.toLowerCase();
    const state = getState();
    if (key in state.input.keys) {
      state.input.keys[key] = false;
    }
  }

  function handleWindowBlur() {
    const state = getState();
    state.input.keys.w = false;
    state.input.keys.a = false;
    state.input.keys.s = false;
    state.input.keys.d = false;
    state.input.mouse.isDown = false;
    state.input.virtualMove.x = 0;
    state.input.virtualMove.y = 0;
    state.input.virtualAim.active = false;
    state.input.virtualAim.firing = false;
  }

  function handlePointerMove(event) {
    // Ignore touch pointers on canvas so mobile virtual joysticks remain independent
    if (event.pointerType === 'touch') return;
    const state = getState();
    const pos = getCanvasMousePosition(canvas, event);
    state.input.mouse.x = pos.x;
    state.input.mouse.y = pos.y;
    state.input.mouse.hasMoved = true;
  }

  function handlePointerDown(event) {
    // Only respond to non-touch left click (button 0) on the canvas
    if (event.pointerType === 'touch' || event.button !== 0) return;

    const state = getState();
    const pos = getCanvasMousePosition(canvas, event);
    state.input.mouse.x = pos.x;
    state.input.mouse.y = pos.y;
    state.input.mouse.hasMoved = true;
    state.input.mouse.isDown = true;

    // Fire immediately on left click if game is active and cooldown allows
    if (!state.isPaused && state.outcome === null && canFireBullet(state.player)) {
      spawnBullet(state, state.player, 'player');
    }
  }

  function handlePointerUp(event) {
    if (event.pointerType === 'touch' || event.button !== 0) return;
    const state = getState();
    state.input.mouse.isDown = false;
  }

  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  window.addEventListener('blur', handleWindowBlur);
  canvas.addEventListener('pointermove', handlePointerMove);
  canvas.addEventListener('pointerdown', handlePointerDown);
  window.addEventListener('pointerup', handlePointerUp);

  return function cleanupInputHandlers() {
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
    window.removeEventListener('blur', handleWindowBlur);
    canvas.removeEventListener('pointermove', handlePointerMove);
    canvas.removeEventListener('pointerdown', handlePointerDown);
    window.removeEventListener('pointerup', handlePointerUp);
  };
}

// ----------------------------------------------------------------------------
// 9. GAME LOOP & RENDERER
// ----------------------------------------------------------------------------

/**
 * Draws the arena floor and subtle 40px coordinate grid.
 */
function drawArenaFloor(ctx, width, height) {
  ctx.fillStyle = GAME_CONFIG.floorColor;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = GAME_CONFIG.gridColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 40; x < width; x += 40) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  for (let y = 40; y < height; y += 40) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();
}

/**
 * Draws a simple geometric crosshair at the mouse cursor position.
 */
function drawCrosshair(ctx, mouse) {
  if (!mouse.hasMoved) return;

  const { x, y } = mouse;
  const r = 7;

  ctx.save();
  ctx.strokeStyle = GAME_CONFIG.crosshairColor;
  ctx.lineWidth = 1.5;

  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.moveTo(x - r - 4, y);
  ctx.lineTo(x - r + 2, y);
  ctx.moveTo(x + r - 2, y);
  ctx.lineTo(x + r + 4, y);
  ctx.moveTo(x, y - r - 4);
  ctx.lineTo(x, y - r + 2);
  ctx.moveTo(x, y + r - 2);
  ctx.lineTo(x, y + r + 4);
  ctx.stroke();
  ctx.restore();
}

/**
 * Advances all simulation systems by one frame (`dt` seconds).
 */
function updateGame(state, dt) {
  if (state.isPaused || state.outcome !== null) return;

  updatePlayer(state, dt);
  updateBot(state, dt);
  updateBullets(state, dt);
  checkGameOutcome(state);
}

/**
 * Renders the complete frame in painter's order:
 * Floor -> Walls -> Bullets -> Bot -> Player -> Crosshair.
 */
function renderGame(ctx, state) {
  drawArenaFloor(ctx, state.width, state.height);
  drawWalls(ctx, state.walls);
  drawBullets(ctx, state.bullets);
  drawBot(ctx, state.bot, state.player);
  drawPlayer(ctx, state.player);
  drawCrosshair(ctx, state.input.mouse);
}

/**
 * Initializes the HTML5 Canvas game loop and returns lifecycle controls.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {{
 *   onHudUpdate?: (snapshot: {
 *     shotsFired: number,
 *     activeBullets: number,
 *     cooldownRemaining: number,
 *     fireCooldownMax: number,
 *     isPaused: boolean,
 *     outcome: 'win' | 'lose' | null,
 *     playerHealth: number,
 *     playerMaxHealth: number,
 *     botHealth: number,
 *     botMaxHealth: number,
 *     playerX: number,
 *     playerY: number
 *   }) => void
 * }} [options]
 */
function createTopDownGame(canvas, options) {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not initialize 2D canvas context.');
  }

  canvas.width = GAME_CONFIG.width;
  canvas.height = GAME_CONFIG.height;

  let state = createInitialGameState();
  let animationFrameId = null;
  let lastTimestamp = 0;
  let lastHudSync = 0;
  let lastEmittedOutcome = null;

  const onHudUpdate = options && options.onHudUpdate ? options.onHudUpdate : null;

  function emitHudSnapshot(timestamp, force) {
    if (!onHudUpdate) return;
    // Always emit immediately when outcome changes (win/lose), otherwise throttle ~20Hz
    const outcomeChanged = state.outcome !== lastEmittedOutcome;
    if (!force && !outcomeChanged && timestamp - lastHudSync < 50) return;

    lastHudSync = timestamp;
    lastEmittedOutcome = state.outcome;

    onHudUpdate({
      shotsFired: state.stats.shotsFired,
      activeBullets: state.bullets.length,
      cooldownRemaining: state.player.fireCooldownRemaining,
      fireCooldownMax: GAME_CONFIG.fireCooldown,
      isPaused: state.isPaused,
      outcome: state.outcome,
      playerHealth: state.player.health,
      playerMaxHealth: state.player.maxHealth,
      botHealth: state.bot.health,
      botMaxHealth: state.bot.maxHealth,
      playerX: Math.round(state.player.x),
      playerY: Math.round(state.player.y),
    });
  }

  function gameLoop(timestamp) {
    if (lastTimestamp === 0) {
      lastTimestamp = timestamp;
    }

    // Cap delta time at 50ms to prevent huge jumps after switching browser tabs
    const dt = Math.min((timestamp - lastTimestamp) / 1000, 0.05);
    lastTimestamp = timestamp;

    updateGame(state, dt);
    renderGame(ctx, state);
    emitHudSnapshot(timestamp, false);

    animationFrameId = window.requestAnimationFrame(gameLoop);
  }

  const cleanupInput = attachInputHandlers(canvas, () => state);
  emitHudSnapshot(performance.now(), true);
  animationFrameId = window.requestAnimationFrame(gameLoop);

  return {
    reset() {
      const prevMouse = { ...state.input.mouse, isDown: false };
      state = createInitialGameState();
      state.input.mouse = prevMouse;
      lastEmittedOutcome = null;
      emitHudSnapshot(performance.now(), true);
    },
    togglePause() {
      if (state.outcome !== null) return false;
      state.isPaused = !state.isPaused;
      emitHudSnapshot(performance.now(), true);
      return state.isPaused;
    },
    setPaused(paused) {
      state.isPaused = Boolean(paused);
      emitHudSnapshot(performance.now(), true);
    },
    /** Updates left virtual joystick movement vector (normalized -1..1). */
    setVirtualMove(x, y) {
      state.input.virtualMove.x = x;
      state.input.virtualMove.y = y;
    },
    /** Updates right virtual joystick aim direction and firing state. */
    setVirtualAim(x, y, active, firing) {
      state.input.virtualAim.x = x;
      state.input.virtualAim.y = y;
      state.input.virtualAim.active = Boolean(active);
      state.input.virtualAim.firing = Boolean(firing);

      if (active && (x !== 0 || y !== 0)) {
        state.player.angle = Math.atan2(y, x);
      }
      if (firing && !state.isPaused && state.outcome === null && canFireBullet(state.player)) {
        spawnBullet(state, state.player, 'player');
      }
    },
    destroy() {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
      cleanupInput();
    },
  };
}

// Export for module environments (stripped when exporting standalone HTML file)
export { createTopDownGame };
