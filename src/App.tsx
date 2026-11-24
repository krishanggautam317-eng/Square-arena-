import { useEffect, useRef, useState, useCallback } from 'react';
import { Download, Gamepad2, Home, Pause, Play, RotateCcw } from 'lucide-react';
import { createTopDownGame } from './game.js';
import gameSource from './game.js?raw';
import { VirtualJoystick } from './components/VirtualJoystick.tsx';

type ScreenState = 'MENU' | 'PLAYING';

interface HudSnapshot {
  shotsFired: number;
  activeBullets: number;
  cooldownRemaining: number;
  fireCooldownMax: number;
  isPaused: boolean;
  outcome: 'win' | 'lose' | null;
  playerHealth: number;
  playerMaxHealth: number;
  botHealth: number;
  botMaxHealth: number;
  playerX: number;
  playerY: number;
}

interface GameController {
  reset: () => void;
  togglePause: () => boolean;
  setPaused: (paused: boolean) => void;
  setVirtualMove: (x: number, y: number) => void;
  setVirtualAim: (x: number, y: number, active: boolean, firing: boolean) => void;
  destroy: () => void;
}

function detectTouchCapable(): boolean {
  if (typeof window === 'undefined') return false;
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  return Boolean(coarse || hasTouch || window.innerWidth < 768);
}

function buildStandaloneHtml(): string {
  const plainScript = gameSource.replace(/\n*\/\/ Export for module environments[\s\S]*$/m, '').trim();

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>Square Arena — 2D Top-Down Shooter</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      overscroll-behavior: none;
      height: 100%;
      background: #0b1120;
      color: #e2e8f0;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    body {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 12px;
      touch-action: manipulation;
    }
    .hidden { display: none !important; }
    .menu-card {
      width: 100%;
      max-width: 420px;
      padding: 32px 24px;
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 12px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 20px;
    }
    .menu-title { font-size: 32px; font-weight: 700; color: #f8fafc; letter-spacing: -0.02em; }
    .menu-sub { font-size: 14px; color: #94a3b8; line-height: 1.5; }
    .menu-actions { width: 100%; display: flex; flex-direction: column; gap: 10px; }
    .btn {
      min-height: 46px;
      padding: 10px 16px;
      font-size: 14px;
      font-weight: 600;
      border-radius: 8px;
      border: 1px solid #334155;
      background: #1e293b;
      color: #f8fafc;
      cursor: pointer;
    }
    .btn-primary { background: #38bdf8; border-color: #38bdf8; color: #090d16; }
    .btn-primary:hover { background: #7dd3fc; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .bar {
      width: 100%;
      max-width: 960px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font-size: 13px;
      color: #94a3b8;
    }
    .title { font-size: 16px; font-weight: 600; color: #f8fafc; }
    .stage { position: relative; width: 100%; max-width: 960px; }
    canvas {
      display: block;
      width: 100%;
      aspect-ratio: 3 / 2;
      border: 1px solid #334155;
      border-radius: 8px;
      cursor: crosshair;
      background: #1e293b;
      touch-action: none;
    }
    .overlay {
      position: absolute;
      inset: 0;
      background: rgba(2, 6, 23, 0.82);
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 14px;
      padding: 24px;
      text-align: center;
    }
    .overlay-title { font-size: 30px; font-weight: 700; color: #f8fafc; }
    .overlay-sub { font-size: 14px; color: #cbd5e1; }
    .joysticks {
      width: 100%;
      max-width: 960px;
      display: none;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      touch-action: none;
      user-select: none;
    }
    .joysticks.visible { display: flex; }
    .joy-wrap { display: flex; flex-direction: column; align-items: center; gap: 6px; }
    .joy-base {
      width: 112px;
      height: 112px;
      border-radius: 999px;
      border: 2px solid #475569;
      background: rgba(15, 23, 42, 0.75);
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      touch-action: none;
    }
    .joy-knob {
      width: 44px;
      height: 44px;
      border-radius: 999px;
      background: #38bdf8;
      border: 2px solid #bae6fd;
      pointer-events: none;
    }
    .joy-knob.amber { background: #fbbf24; border-color: #fef3c7; }
    .joy-label { font-size: 11px; color: #94a3b8; }
    .small-btn {
      padding: 6px 12px;
      font-size: 12px;
      font-weight: 500;
      color: #f8fafc;
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 6px;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div id="menuScreen" class="menu-card">
    <h1 class="menu-title">Square Arena</h1>
    <p class="menu-sub">Eliminate the wandering bot in the walled maze. Each hit deals 20 damage.</p>
    <div class="menu-actions">
      <button id="playBotBtn" class="btn btn-primary" type="button">Play vs Bot</button>
      <button class="btn" type="button" disabled aria-disabled="true">Play with Friend (Coming Soon)</button>
    </div>
    <p class="menu-sub" style="font-size: 12px;">Desktop: WASD + Mouse · Mobile: Left Stick Move + Right Stick Aim &amp; Shoot</p>
  </div>

  <div id="gameScreen" class="hidden" style="width:100%;max-width:960px;display:flex;flex-direction:column;gap:10px;align-items:center;">
    <div class="bar">
      <span class="title">Square Arena</span>
      <span id="hpReadout">Player: 100/100 · Bot: 100/100</span>
      <div style="display:flex;gap:8px;">
        <button id="menuBtn" class="small-btn" type="button">Menu</button>
        <button id="resetBtn" class="small-btn" type="button">Reset</button>
      </div>
    </div>
    <div class="stage">
      <canvas id="gameCanvas"></canvas>
      <div id="gameOverOverlay" class="overlay hidden">
        <h2 id="gameOverTitle" class="overlay-title">You Win</h2>
        <p id="gameOverSub" class="overlay-sub"></p>
        <button id="playAgainBtn" class="btn btn-primary" type="button">Play Again</button>
      </div>
    </div>
    <div id="joystickRow" class="joysticks">
      <div class="joy-wrap">
        <div id="moveStick" class="joy-base"><div id="moveKnob" class="joy-knob"></div></div>
        <span class="joy-label">Move</span>
      </div>
      <div class="joy-wrap">
        <div id="aimStick" class="joy-base"><div id="aimKnob" class="joy-knob amber"></div></div>
        <span class="joy-label">Aim &amp; Shoot</span>
      </div>
    </div>
  </div>

  <script>
${plainScript}

    (function () {
      var menuScreen = document.getElementById('menuScreen');
      var gameScreen = document.getElementById('gameScreen');
      var joystickRow = document.getElementById('joystickRow');
      var hpReadout = document.getElementById('hpReadout');
      var gameOverOverlay = document.getElementById('gameOverOverlay');
      var gameOverTitle = document.getElementById('gameOverTitle');
      var gameOverSub = document.getElementById('gameOverSub');
      var canvas = document.getElementById('gameCanvas');
      var game = null;

      var isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || window.innerWidth < 768;
      if (isTouch) joystickRow.classList.add('visible');

      function onHudUpdate(snap) {
        hpReadout.textContent = 'Player: ' + snap.playerHealth + '/' + snap.playerMaxHealth + ' · Bot: ' + snap.botHealth + '/' + snap.botMaxHealth;
        if (snap.outcome) {
          gameOverTitle.textContent = snap.outcome === 'win' ? 'You Win' : 'You Lose';
          gameOverSub.textContent = snap.outcome === 'win'
            ? 'Bot eliminated in ' + snap.shotsFired + ' shots.'
            : 'Your health reached 0.';
          gameOverOverlay.classList.remove('hidden');
        } else {
          gameOverOverlay.classList.add('hidden');
        }
      }

      function bindStick(baseEl, knobEl, onUpdate) {
        var pointerId = null;
        var maxR = 40;
        function update(cx, cy) {
          var rect = baseEl.getBoundingClientRect();
          var dx = cx - (rect.left + rect.width / 2);
          var dy = cy - (rect.top + rect.height / 2);
          var d = Math.hypot(dx, dy);
          if (d > maxR && d > 0) { dx *= maxR / d; dy *= maxR / d; }
          knobEl.style.transform = 'translate3d(' + dx + 'px,' + dy + 'px,0)';
          var nx = dx / maxR, ny = dy / maxR, mag = Math.hypot(nx, ny);
          onUpdate(mag < 0.12 ? 0 : nx, mag < 0.12 ? 0 : ny, true, mag >= 0.25);
        }
        baseEl.addEventListener('pointerdown', function (e) {
          if (pointerId !== null) return;
          e.preventDefault();
          baseEl.setPointerCapture(e.pointerId);
          pointerId = e.pointerId;
          update(e.clientX, e.clientY);
        });
        baseEl.addEventListener('pointermove', function (e) {
          if (pointerId !== e.pointerId) return;
          e.preventDefault();
          update(e.clientX, e.clientY);
        });
        function end(e) {
          if (pointerId !== e.pointerId) return;
          pointerId = null;
          knobEl.style.transform = 'translate3d(0,0,0)';
          onUpdate(0, 0, false, false);
        }
        baseEl.addEventListener('pointerup', end);
        baseEl.addEventListener('pointercancel', end);
      }

      bindStick(document.getElementById('moveStick'), document.getElementById('moveKnob'), function (x, y) {
        if (game) game.setVirtualMove(x, y);
      });
      bindStick(document.getElementById('aimStick'), document.getElementById('aimKnob'), function (x, y, active, firing) {
        if (game) game.setVirtualAim(x, y, active, firing);
      });

      function goToMenu() {
        if (game) game.setPaused(true);
        gameOverOverlay.classList.add('hidden');
        gameScreen.classList.add('hidden');
        menuScreen.classList.remove('hidden');
      }

      document.getElementById('playBotBtn').addEventListener('click', function () {
        menuScreen.classList.add('hidden');
        gameScreen.classList.remove('hidden');
        if (!game) { game = createTopDownGame(canvas, { onHudUpdate: onHudUpdate }); }
        else { game.reset(); game.setPaused(false); }
      });

      document.getElementById('resetBtn').addEventListener('click', function () {
        if (game) game.reset();
      });

      document.getElementById('menuBtn').addEventListener('click', goToMenu);
      document.getElementById('playAgainBtn').addEventListener('click', goToMenu);
    })();
  </script>
</body>
</html>`;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const controllerRef = useRef<GameController | null>(null);

  const [screen, setScreen] = useState<ScreenState>('MENU');
  const [showTouchControls, setShowTouchControls] = useState<boolean>(() => detectTouchCapable());
  const [isLandscapeCompact, setIsLandscapeCompact] = useState<boolean>(false);

  const [hud, setHud] = useState<HudSnapshot>({
    shotsFired: 0,
    activeBullets: 0,
    cooldownRemaining: 0,
    fireCooldownMax: 0.3,
    isPaused: false,
    outcome: null,
    playerHealth: 100,
    playerMaxHealth: 100,
    botHealth: 100,
    botMaxHealth: 100,
    playerX: 76,
    playerY: 564,
  });

  // Track viewport shape so portrait phones get controls below canvas and
  // compact landscape screens overlay joysticks cleanly on the corners
  useEffect(() => {
    function handleResize() {
      const compactLandscape = window.innerHeight <= 560 && window.innerWidth > window.innerHeight;
      setIsLandscapeCompact(compactLandscape);
      if (window.innerWidth < 768) {
        setShowTouchControls(true);
      }
    }
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Automatically reveal touch controls if the user touches the screen
  useEffect(() => {
    function handleFirstTouch() {
      setShowTouchControls(true);
    }
    window.addEventListener('touchstart', handleFirstTouch, { passive: true, once: true });
    return () => window.removeEventListener('touchstart', handleFirstTouch);
  }, []);

  // Mount/unmount canvas game loop cleanly when entering or leaving PLAYING screen
  useEffect(() => {
    if (screen !== 'PLAYING') return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const controller = createTopDownGame(canvas, {
      onHudUpdate: (snapshot: HudSnapshot) => {
        setHud(snapshot);
      },
    });

    controllerRef.current = controller;

    return () => {
      controller.destroy();
      controllerRef.current = null;
    };
  }, [screen]);

  const handleStartVsBot = useCallback(() => {
    setScreen('PLAYING');
  }, []);

  const handleReturnToMenu = useCallback(() => {
    setScreen('MENU');
  }, []);

  const handleReset = useCallback(() => {
    controllerRef.current?.reset();
  }, []);

  const handleTogglePause = useCallback(() => {
    controllerRef.current?.togglePause();
  }, []);

  const handleVirtualMove = useCallback((x: number, y: number) => {
    controllerRef.current?.setVirtualMove(x, y);
  }, []);

  const handleVirtualAim = useCallback(
    (x: number, y: number, active: boolean, firing: boolean) => {
      controllerRef.current?.setVirtualAim(x, y, active, firing);
    },
    []
  );

  const handleDownloadStandalone = useCallback(() => {
    const html = buildStandaloneHtml();
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'square-arena.html';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, []);

  useEffect(() => {
    if (screen !== 'PLAYING') return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat) return;
      const key = event.key.toLowerCase();
      if (key === 'r') {
        handleReset();
      } else if (key === 'p' || event.key === 'Escape') {
        handleTogglePause();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [screen, handleReset, handleTogglePause]);

  const cooldownProgress =
    hud.fireCooldownMax > 0
      ? Math.max(0, Math.min(1, 1 - hud.cooldownRemaining / hud.fireCooldownMax))
      : 1;
  const isReadyToFire = hud.cooldownRemaining <= 0.005;
  const isGameOver = hud.outcome !== null;

  return (
    <div className="min-h-dvh bg-[#0b1120] text-slate-100 flex flex-col">
      {/* 3-Zone Top Header Bar */}
      <header className="w-full border-b border-slate-800/90 bg-[#0f172a] shrink-0">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4 sm:gap-8">
          <span className="text-base sm:text-lg font-semibold tracking-tight text-slate-50 whitespace-nowrap shrink-0">
            Square Arena
          </span>

          {screen === 'PLAYING' ? (
            <div className="hidden lg:flex items-center gap-2 text-xs text-slate-400 whitespace-nowrap">
              <span>WASD Move</span>
              <span aria-hidden="true">·</span>
              <span>Mouse Aim</span>
              <span aria-hidden="true">·</span>
              <span>Left Click Shoot</span>
              <span aria-hidden="true">·</span>
              <span>0.3s Fire Rate</span>
            </div>
          ) : (
            <div className="hidden md:flex items-center gap-2 text-xs text-slate-400 whitespace-nowrap">
              <span>Top-Down Maze Shooter</span>
              <span aria-hidden="true">·</span>
              <span>Desktop &amp; Mobile</span>
            </div>
          )}

          <div className="flex items-center gap-2 shrink-0">
            {screen === 'PLAYING' && (
              <>
                <button
                  type="button"
                  onClick={() => setShowTouchControls((prev) => !prev)}
                  title="Toggle virtual touch joysticks"
                  className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 ${
                    showTouchControls
                      ? 'bg-sky-500/15 text-sky-300 border-sky-400/50 hover:bg-sky-500/25'
                      : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  <Gamepad2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Touch Pad</span>
                </button>

                <button
                  type="button"
                  onClick={handleTogglePause}
                  disabled={isGameOver}
                  className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 disabled:opacity-45 disabled:cursor-not-allowed border border-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
                >
                  {hud.isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">{hud.isPaused ? 'Resume' : 'Pause'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Reset</span>
                </button>

                <button
                  type="button"
                  onClick={handleReturnToMenu}
                  className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
                >
                  <Home className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Menu</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={handleDownloadStandalone}
              className="inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 text-xs font-medium text-slate-950 bg-sky-400 hover:bg-sky-300 rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Download HTML</span>
              <span className="sm:hidden">HTML</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      {screen === 'MENU' ? (
        <main className="flex-1 flex items-center justify-center px-4 py-8">
          <section className="w-full max-w-md bg-[#0f172a] border border-slate-800 rounded-xl p-6 sm:p-8 flex flex-col items-center text-center gap-6 shadow-2xl">
            {/* Simple coloured squares preview matching player and bot shapes */}
            <div className="flex items-center gap-6" aria-hidden="true">
              <div className="w-9 h-9 bg-sky-400 border-2 border-sky-200 relative flex items-center">
                <div className="w-4 h-2 bg-slate-50 absolute -right-2.5" />
              </div>
              <span className="text-xs font-semibold text-slate-500">VS</span>
              <div className="w-9 h-9 bg-rose-500 border-2 border-rose-200 relative flex items-center">
                <div className="w-3.5 h-2 bg-rose-50 absolute -left-2" />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-50 text-balance">
                Square Arena
              </h1>
              <p className="text-sm text-slate-400 leading-relaxed">
                Battle an autonomous bot inside the walled maze. Each hit deals 20 damage.
              </p>
            </div>

            <div className="w-full flex flex-col gap-3">
              <button
                type="button"
                onClick={handleStartVsBot}
                className="w-full min-h-[48px] px-5 py-3 text-sm font-semibold text-slate-950 bg-sky-400 hover:bg-sky-300 active:bg-sky-500 rounded-lg transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
              >
                Play vs Bot
              </button>

              <button
                type="button"
                disabled
                aria-disabled="true"
                className="w-full min-h-[48px] px-5 py-3 text-sm font-medium text-slate-400 bg-slate-800/70 border border-slate-700/80 rounded-lg opacity-60 cursor-not-allowed whitespace-nowrap"
              >
                Play with Friend (Coming Soon)
              </button>
            </div>

            <div className="w-full pt-4 border-t border-slate-800/80 flex flex-col gap-1.5 text-xs text-slate-400">
              <p>
                <span className="text-slate-300 font-medium">Desktop:</span> WASD Move · Mouse Aim · Left Click Shoot
              </p>
              <p>
                <span className="text-slate-300 font-medium">Mobile:</span> Left Joystick Move · Right Joystick Aim &amp; Shoot
              </p>
            </div>
          </section>
        </main>
      ) : (
        <main className="flex-1 flex flex-col items-center justify-center px-3 sm:px-6 py-3 sm:py-5 overflow-hidden">
          <div className="w-full max-w-[960px] flex flex-col gap-2.5 sm:gap-3">
            {/* Unobtrusive Status Strip Above Canvas */}
            <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-4 text-xs text-slate-400">
              <div className="flex items-center gap-2.5 sm:gap-3 font-mono tabular-nums">
                <span>
                  Player HP:{' '}
                  <strong className="font-medium text-sky-300">
                    {hud.playerHealth}/{hud.playerMaxHealth}
                  </strong>
                </span>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span>
                  Bot HP:{' '}
                  <strong className="font-medium text-rose-400">
                    {hud.botHealth}/{hud.botMaxHealth}
                  </strong>
                </span>
                <span aria-hidden="true" className="hidden sm:inline text-slate-600">·</span>
                <span className="hidden sm:inline">
                  Shots: <strong className="font-medium text-slate-200">{hud.shotsFired}</strong>
                </span>
              </div>

              <div className="flex items-center gap-2.5 sm:gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Weapon:</span>
                  <span
                    className={`font-mono tabular-nums font-medium ${
                      isReadyToFire ? 'text-sky-300' : 'text-amber-300'
                    }`}
                  >
                    {isReadyToFire ? 'Ready' : `${hud.cooldownRemaining.toFixed(2)}s`}
                  </span>
                  <div
                    className="w-16 sm:w-20 h-1.5 bg-slate-800 rounded-sm overflow-hidden border border-slate-700/80"
                    aria-hidden="true"
                  >
                    <div
                      className={`h-full transition-none ${
                        isReadyToFire ? 'bg-sky-400' : 'bg-amber-400'
                      }`}
                      style={{ width: `${Math.round(cooldownProgress * 100)}%` }}
                    />
                  </div>
                </div>
                <span aria-hidden="true" className="text-slate-600 hidden md:inline">·</span>
                <span className="hidden md:inline text-slate-500">
                  P Pause · R Reset
                </span>
              </div>
            </div>

            {/* HTML5 Canvas Viewport */}
            <div
              className={`relative w-full aspect-[3/2] rounded-lg overflow-hidden border border-slate-700/80 shadow-2xl bg-[#1e293b] touch-none ${
                isLandscapeCompact ? 'max-h-[calc(100dvh-110px)] w-auto mx-auto' : ''
              }`}
            >
              <canvas
                ref={canvasRef}
                onContextMenu={(e) => e.preventDefault()}
                className="block w-full h-full cursor-crosshair select-none touch-none"
              />

              {/* Overlaid Joysticks on Desktop/Landscape when Touch Pad is active */}
              {showTouchControls && !hud.isPaused && !isGameOver && (
                <div
                  className={`${
                    isLandscapeCompact ? 'flex' : 'hidden md:flex'
                  } absolute inset-x-0 bottom-0 p-4 sm:p-5 items-end justify-between pointer-events-none`}
                >
                  <div className="pointer-events-auto opacity-85">
                    <VirtualJoystick
                      label="Move"
                      accent="sky"
                      size={isLandscapeCompact ? 96 : 114}
                      onChange={(x, y) => handleVirtualMove(x, y)}
                    />
                  </div>
                  <div className="pointer-events-auto opacity-85">
                    <VirtualJoystick
                      label="Aim & Shoot"
                      accent="amber"
                      size={isLandscapeCompact ? 96 : 114}
                      onChange={handleVirtualAim}
                    />
                  </div>
                </div>
              )}

              {/* Game Over Overlay ("You Win" / "You Lose" + "Play Again") */}
              {isGameOver && (
                <div className="absolute inset-0 bg-slate-950/85 flex flex-col items-center justify-center gap-4 p-6 text-center">
                  <h2
                    className={`text-3xl sm:text-4xl font-bold tracking-tight ${
                      hud.outcome === 'win' ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {hud.outcome === 'win' ? 'You Win' : 'You Lose'}
                  </h2>
                  <p className="text-sm text-slate-300 font-mono tabular-nums">
                    {hud.outcome === 'win'
                      ? `Bot defeated · ${hud.shotsFired} shots fired`
                      : `Player health reached 0 · Bot HP ${hud.botHealth}/${hud.botMaxHealth}`}
                  </p>
                  <button
                    type="button"
                    onClick={handleReturnToMenu}
                    className="min-h-[46px] px-6 py-2.5 text-sm font-semibold text-slate-950 bg-sky-400 hover:bg-sky-300 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
                  >
                    Play Again
                  </button>
                </div>
              )}

              {/* Pause Overlay */}
              {hud.isPaused && !isGameOver && (
                <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center gap-4 p-6">
                  <h2 className="text-2xl font-semibold tracking-tight text-slate-50">
                    Game Paused
                  </h2>
                  <p className="text-sm text-slate-300 text-center">
                    Use WASD or the left joystick to move, and cursor or right joystick to aim &amp; shoot.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={handleTogglePause}
                      className="min-h-[42px] px-4 py-2 text-sm font-medium text-slate-950 bg-sky-400 hover:bg-sky-300 rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
                    >
                      Resume
                    </button>
                    <button
                      type="button"
                      onClick={handleReset}
                      className="min-h-[42px] px-4 py-2 text-sm font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
                    >
                      Reset Arena
                    </button>
                    <button
                      type="button"
                      onClick={handleReturnToMenu}
                      className="min-h-[42px] px-4 py-2 text-sm font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
                    >
                      Main Menu
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Dedicated Twin-Stick Touch Deck Below Canvas on Portrait Phones */}
            {showTouchControls && !isLandscapeCompact && !hud.isPaused && !isGameOver && (
              <div className="flex md:hidden items-center justify-between px-3 pt-2 pb-1 touch-none select-none">
                <VirtualJoystick
                  label="Move"
                  accent="sky"
                  size={116}
                  onChange={(x, y) => handleVirtualMove(x, y)}
                />
                <VirtualJoystick
                  label="Aim & Shoot"
                  accent="amber"
                  size={116}
                  onChange={handleVirtualAim}
                />
              </div>
            )}
          </div>
        </main>
      )}
    </div>
  );
}
