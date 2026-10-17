// #region set event handlers etc.
"use strict";
window.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', resizeCanvas);
const pressedKeys = new Set();
const isKeyDown = (key) => pressedKeys.has(key);

const keysPendingRelease = new Set();
const isKeyDownFresh = (key) => isKeyDown(key) && !keysPendingRelease.has(key);

const JUMP_KEYS = ["ArrowUp", "w", "W", " "];
const LEFT_KEYS = ["ArrowLeft", "a", "A"];
const RIGHT_KEYS = ["ArrowRight", "d", "D"];
const isJumpKeyDown = () => JUMP_KEYS.some(isKeyDownFresh);
const isLeftKeyDown = () => LEFT_KEYS.some(isKeyDownFresh);
const isRightKeyDown = () => RIGHT_KEYS.some(isKeyDownFresh);

// Shared by the real keyup listener and simulateKeyTap (touch) below - resets
// keyboardTimer (same as any key release) and, if the released key was a
// Jump key and no OTHER Jump key is still held (e.g. ArrowUp and W both
// pressed at once), restores canJump so a new jump can start.
function handleKeyRelease(key) {
    pressedKeys.delete(key);
    keysPendingRelease.delete(key);
    keyboardTimer = 0;
    if (JUMP_KEYS.includes(key) && !isJumpKeyDown()) {
        canJump = true;
    }
}

// True if this device supports touch input Used to show
// "Tap to ..." prompts instead of "Press Space to ..." ones.
const isTouchDevice = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

// Builds a "Press Space to <action>"/"Tap to <action>" prompt depending on
// isTouchDevice, so every screens prompt stays consistent with 
// input method this device  supports.
function actionPrompt(action) {
    return isTouchDevice ? `Tap to ${action}` : `Press Space to ${action}`;
}

// #region touch screen event listeners
let touchStartX = 0;
let touchStartY = 0;
let isTouching = false;

let touchSwipeDirection = null;
let touchSwipeReferenceX = 0;
const TOUCH_SWIPE_THRESHOLD = 20; // game-space pixels of sideways movement needed to (re)register a swipe direction

// True if a touch event's target is inside the name entry overlay (input, touch D-pad, or
// Submit/Skip buttons) - these are real HTML controls layered over the canvas, so touches on
// them must be left alone (no preventDefault, no simulated Space tap) or their native
// click/tap behaviour would be suppressed.
function isNameEntryTouchEvent(e) {
    return e.target instanceof Element && e.target.closest('#nameEntry') !== null;
}

document.addEventListener('touchstart', (e) => {
    if (isNameEntryTouchEvent(e)) return;
    e.preventDefault();
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    touchStartX = Math.round((touch.clientX - rect.left) / scale);
    touchStartY = Math.round((touch.clientY - rect.top) / scale);
    isTouching = true;

    onTouchStart(touchStartX, touchStartY);
}, { passive: false });

document.addEventListener('touchmove', (e) => {
    if (isNameEntryTouchEvent(e)) return;
    e.preventDefault();
    if (!isTouching) return;

    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const touchX = Math.round((touch.clientX - rect.left) / scale);
    const touchY = Math.round((touch.clientY - rect.top) / scale);

    onTouchMove(touchX, touchY);
}, { passive: false });

document.addEventListener('touchend', (e) => {
    if (isNameEntryTouchEvent(e)) return;
    e.preventDefault();
    if (!isTouching) return;

    const touch = e.changedTouches[0];
    const rect = canvas.getBoundingClientRect();
    const touchEndX = Math.round((touch.clientX - rect.left) / scale);
    const touchEndY = Math.round((touch.clientY - rect.top) / scale);
    isTouching = false;

    onTouchEnd(touchEndX, touchEndY);
}, { passive: false });

function simulateKeyTap(key, holdMilliseconds = 60) {
    pressedKeys.add(key);
    setTimeout(() => handleKeyRelease(key), holdMilliseconds);
}

// Touch event handlers (override these in your game)
function onTouchStart(x, y) {
    ensureAudioContext(); // Unlock audio on the first user gesture (see #region sound), same as keydown/mousedown
    touchSwipeReferenceX = x;
    touchSwipeDirection = null;
}

function onTouchMove(x, y) {
    if (gameState !== GameState.PLAYING) return; // swipe-to-run only applies during gameplay

    const deltaFromReference = x - touchSwipeReferenceX;
    if (deltaFromReference <= -TOUCH_SWIPE_THRESHOLD) {
        touchSwipeDirection = "left";
        pressedKeys.add("ArrowLeft");
        pressedKeys.delete("ArrowRight");
        touchSwipeReferenceX = x; // re-measure the NEXT swipe movement from here
    } else if (deltaFromReference >= TOUCH_SWIPE_THRESHOLD) {
        touchSwipeDirection = "right";
        pressedKeys.add("ArrowRight");
        pressedKeys.delete("ArrowLeft");
        touchSwipeReferenceX = x;
    }

}

function onTouchEnd(x, y) {
    if (gameState === GameState.PLAYING) {
        if (touchSwipeDirection === null) {
            // The finger never moved far enough sideways to count as a swipe
            // - treat this as a tap: Jump.
            simulateKeyTap("ArrowUp");
        } else {
            // End of a swipe-run gesture - release both direction keys so
            // Jack returns to standing still, same as releasing the
            // keyboard's arrow key.
            pressedKeys.delete("ArrowLeft");
            pressedKeys.delete("ArrowRight");
            keyboardTimer = 0;
        }
    } else {
        // Title/Level Complete/Game Over screens - any tap acts like Space.
        simulateKeyTap(" ");
    }
    touchSwipeDirection = null;
}

// If the page is interrupted or backgrounded mid-gesture (e.g. iOS sends the
// app to the background during a swipe, or a call/notification cancels the
// touch), no matching touchend is guaranteed to fire, so pressedKeys could
// be left stuck with a direction key held down - making Jack keep running
// on his own once the page is foregrounded again. Clear all held-input
// state whenever that happens.
function resetHeldInput() {
    pressedKeys.clear();
    keysPendingRelease.clear();
    isTouching = false;
    touchSwipeDirection = null;
    keyboardTimer = 0;
    canJump = true;
}

document.addEventListener('touchcancel', resetHeldInput, { passive: false });
document.addEventListener('visibilitychange', () => {
    if (document.hidden) resetHeldInput();
});
window.addEventListener('pagehide', resetHeldInput);
window.addEventListener('blur', resetHeldInput);
// #endregion

// #region keyboard and mouse listeners
document.addEventListener('keydown', (e) => {
    ensureAudioContext(); // Unlock audio on the first user gesture (see #region sound)
    pressedKeys.add(e.key);
    // disable arrow keys' and space's default behaviour i.e. scrolling the browser window
    switch (e.key) {
        case "ArrowLeft":
            e.preventDefault();
            break;
        case "ArrowRight":
            e.preventDefault();
            break;
        case "ArrowUp":
            e.preventDefault();
            break;
        case "ArrowDown":
            e.preventDefault();
            break;
        case " ":
            e.preventDefault();
            break;
    }
});

document.addEventListener('keyup', (e) => {
    handleKeyRelease(e.key);
}
);
let canvas;
let context;
let secondsPassed = 0;
let oldTimeStamp = 0;
document.addEventListener("mousedown", function (e) {
    ensureAudioContext(); // Unlock audio on the first user gesture (see #region sound)
    getMouseClickPosition(canvas, e);
});
//# endregion

// #endregion
// #endregion

// #region gameLoop
function gameLoop(timeStamp) {
    // Calculate how much time has passed
    secondsPassed = (timeStamp - oldTimeStamp) / 1000;
    oldTimeStamp = timeStamp;
    // Clamp time step to prevent huge jumps
    secondsPassed = Math.min(secondsPassed, 0.1);
    update(secondsPassed);
    draw();
    // Keep requesting new frames
    window.requestAnimationFrame(gameLoop);
}
// #endregion

// #region initialization
window.onload = init;
function init() {
    createCanvas();
}
function createCanvas() {
    canvas = document.getElementById('canvas');
    context = canvas.getContext('2d', { alpha: false });
    canvas.height = baseHeight + verticalMargin * 2;
    canvas.width = baseWidth;

    // Set rendering properties
    context.imageSmoothingEnabled = false;

    resizeCanvas();

    // Start the first frame request
    window.requestAnimationFrame(gameLoop);
    gameLoad();
}
//   #endregion

// #region classes (cannot reference before declared, hence at the top)

class gap {
    constructor(x, platform, dir, hidden, canFall) {
        this.x = x;
        this.platform = platform;
        this.dir = dir;
        this.hidden = hidden;
    }
}

class hazard {
    constructor(x, platform, design, initialFrame = 0) {
        this.x = x;             // Horizontal CENTRE position 
        this.platform = platform;
        this.design = design;    // Key into graphics.hazards, e.g. "octopus"
        this.frameCounter = initialFrame;
        this.frameTimer = 0;
    }
}


// #endregion

// #region game Variables
// Images must be pre-loaded in the initialize section above
// #region images & sprite sheets
// Add your images here
// Example: const myImage = new Image();

// Jack/hazard sprite animation data (loaded from assets/jumpingjack-graphics.js,
// included in index.html before this script). Each entry is
// { description, width, height, anchor: {x, y}, frames: [ frame, ... ] },
// where each frame is an array of pixel-row strings ('0'/'1').
const graphics = JumpingJackGraphics;

// ZX Spectrum-style bitmap font (loaded from assets/jumpingjack-font.js, included in
// index.html before this script). See assets/jumpingjack-font.js for format/licensing.
const bitmapFont = JumpingJackFont;

const BALLAD_TEASER = "Jumping Jack is quick and bold\nWith skill his story will unfold";

const ballad = [
    "THE BALLAD OF JUMPING JACK\nA daring explorer named Jack...",
    "Once found a peculiar track...",
    "There were dangers galore...",
    "Even holes in the floor...",
    "So he kept falling flat on\nhis back...",
    "Quite soon he got used to\nthe place...",
    "He could jump to escape from\nthe chase...",
    "But without careful thought...",
    "His leaps came to nought...",
    "And he left with a much\nwider face...",
    "Things seemed just as bad as\ncould be...",
    "Hostile faces were all Jack\ncould see...",
    "He tried to stay calm...",
    "And to come to no harm...",
    "But more often got squashed\nlike a flea...",
    "By now Jack was in a\ngreat flap...",
    "He felt like a rat in a trap...",
    "If only he'd guessed...",
    "That soon he could rest...",
    "After jumping the very\nlast gap. - WELL DONE"
];

const HAZARD_START_POSITIONS = [
    { platform: 1, col: 0 },
    { platform: 3, col: 24 },
    { platform: 1, col: 17 },
    { platform: 2, col: 1 },
    { platform: 5, col: 2 },
    { platform: 6, col: 19 },
    { platform: 1, col: 13 },
    { platform: 5, col: 8 },
    { platform: 7, col: 8 },
    { platform: 3, col: 5 },
    { platform: 2, col: 7 },
    { platform: 3, col: 10 },
    { platform: 2, col: 25 },
    { platform: 4, col: 3 },
    { platform: 4, col: 18 },
    { platform: 4, col: 25 },
    { platform: 6, col: 7 },
    { platform: 6, col: 24 },
    { platform: 5, col: 26 },
    { platform: 7, col: 28 }
];

const HAZARD_DESIGNS = ["octopus", "train", "ray", "farmer", "aeroplane", "bus", "dinosaur", "witch", "axe", "snake"];

const HAZARD_FRAME_DELAYS = {
    octopus: 0.1,
    train: 0.2,
    ray: 0.2,
    farmer: 0.3,
    aeroplane: 0.1,
    bus: 0.2,
    dinosaur: 0.2,
    witch: 0.1,
    axe: 0.1,
    snake: 0.3
};

const HAZARD_COLOUR_PALETTE = [
    "#0000D7", // Blue   - slots 0, 6, 12, 18
    "#035703", // Green  - slots 1, 7, 13, 19
    "#7c027c", // Magenta- slots 2, 8, 14
    "#D7D700", // Yellow - slots 3, 9, 15
    "#000000", // Black  - slots 4, 10, 16
    "#5e0000"  // Red    - slots 5, 11, 17
];

const HAZARD_WRAP_MARGIN = 12;

// #endregion
// Native canvas size (will scale with window size changes, but coordinate system remains at this)
const baseWidth = 1024;
const baseHeight = 768;
const keyboardDelay = 0.1; // seconds before a pressed key will repeat

let canFall = 0;    // Global flag to indicate if the player can fall through a gap, set to 500 immediately after a good jump to stop immediately falling through same gap

let canJump = true; // Global flag to stop a jump (good or bad) immediately chaining into another - set to false as soon as any jump starts, and only restored once all Jump keys (ArrowUp/W/Space) are released (see handleKeyRelease)

let keyboardTimer = 0;
let canvasColour = "#6a6a6a";
let scale = 1; // scale that the canvas is drawn. Will change after resize
let mouseX = 0;
let mouseY = 0;

let pixelScale = 4;

// Extra blank area added above and below the gameplay area, equal to the
// vertical distance between platforms, so the canvas isn't flush with the
// top/bottom of the window. Gameplay itself is drawn identically, just
// offset down by this margin (see draw()).
const verticalMargin = 24 * pixelScale;

let gaps = [];
const gapCrossingSeconds = 4; // time (in seconds) for a gap, or Jack, to cross the full canvas width
let gapVel = baseWidth / gapCrossingSeconds; // pixels per second
createGaps()

let hazards = [];
// Which design is "slot 1" - randomized once at startup here (matching the
// original's call to RndHazds from Start) and re-randomized at the start of
// every new game (see randomizeHazardDesigns, called from the TITLE ->
// PLAYING transition below) - matching the original's RndHazds/GLNewGame.
// The relative ORDER of designs across slots never changes, only which
// design the cycle starts from, same as the original rotating its GFX data.
let hazardDesignOffset = Math.floor(Math.random() * HAZARD_DESIGNS.length);
createHazards(); // Created once and never reset - see HAZARD_START_POSITIONS comment

// Whether Jack was touching a Hazard on the PREVIOUS frame - used to make
// hazard-hit detection edge-triggered rather than level-triggered (see the
// PLAYING case in update()), matching the original's own Collision flag in
// CollDetn.
let wasTouchingHazard = false;


let jackFrameCounter = 0;
let jackFrameTimer = 0;
let jackFrameDelay = 0.5;


let jackX = (baseWidth / 2) - (graphics.jack.standingStill.width * pixelScale) / 2;
let jackY = baseHeight - graphics.jack.standingStill.height * pixelScale;
let jackVel = 0;
let jackState = "standingStill";
let jackPlatform = 8;

let gameState;

let lives = 6;
let score = 0;
let level = 0; // Internal level counter is zero-indexed (matches the original game); displayed as level+1

// Leaderboard (see Leaderboard.js/NameEntry.js) - captured once at the moment of death so the
// name entry screen and submission always reflect that run, even if score/level keep changing
// (e.g. a lingering keypress) before the player finishes entering their name.
let finalScore = 0;
let finalLevel = 1;
let nameEntryPending = false;
let potentialLeaderboardEntryTracked = false;

function isExtraLifeLevel(level) {
    return level === 5 || level === 10 || level === 15 || level === 20;
}

// Game states enum
const GameState = {
    TITLE: "TITLE",
    INTRO: "INTRO", // one-time story teaser shown before level 1 (see BALLAD_TEASER)
    PLAYING: "PLAYING",
    LEVEL_COMPLETE: "LEVEL_COMPLETE",
    GAME_OVER: "GAME_OVER",
    NAME_ENTRY: "NAME_ENTRY" // high score entry, shown instead of returning straight to TITLE when the run qualifies
};

// #endregion

// #region gameLoad
function gameLoad() {
    gameState = GameState.TITLE;
    loadLeaderboard();
    resetTitleView();
}
// #endregion

// #region update game state
function update(secondsPassed) {
    updateNameEntryLayout();
    keyboardTimer -= secondsPassed;

    titleRainbowHue = (titleRainbowHue + secondsPassed * (360 / TITLE_RAINBOW_CYCLE_SECONDS)) % 360;

    canFall -= secondsPassed;
    if (canFall < 0) {
        canFall = 0;
    }

    screenFlashTimer -= secondsPassed;
    if (screenFlashTimer < 0) {
        screenFlashTimer = 0;
    }

    if (gameState === GameState.PLAYING) {
        jackFrameTimer += secondsPassed;

        runningFootstepTimer += secondsPassed;

        jackY = baseHeight - graphics.jack.standingStill.height * pixelScale - ((8 - jackPlatform) * 24 * pixelScale);

        switch (jackState) {
            case "standingStill":
                jackFrameDelay = 0.5;
                break;
            case "runningLeft":
            case "runningRight":
                jackFrameDelay = 0.03;
                break;
            case "goodJumpPart1":
                jackFrameDelay = 0.03;
                break;
            case "goodJumpPart2":
                jackFrameDelay = 0.03;
                break;
            case "fallingPart1":
                jackFrameDelay = 0.03;
                break;
            case "fallingPart2":
                jackFrameDelay = 0.03;
                break;
            case "stunned1":
            case "stunned2":
                jackFrameDelay = 0.15;
                break;
            case "badJump":
                jackFrameDelay = 0.05;
                break;
        }


        if (jackFrameTimer >= jackFrameDelay) { // Change frame every 0.5 seconds

            switch (jackState) {
                case "standingStill":
                case "runningLeft":
                case "runningRight":
                    jackFrameCounter = (jackFrameCounter + 1) % 4; // 4 frames per sprite anim
                    jackFrameTimer = 0;
                    if (jackState === "standingStill") {
                        playStandingStillTick(jackFrameCounter);
                    }
                    break;

                case "goodJumpPart1":
                case "goodJumpPart2":
                    jackFrameCounter += 1;
                    if (jackFrameCounter === 4) {
                        if (jackState === "goodJumpPart1") {
                            jackFrameCounter = 0;
                            jackPlatform -= 1;
                            jackState = "goodJumpPart2"
                            jackY = baseHeight - graphics.jack.standingStill.height * pixelScale - ((8 - jackPlatform) * 24 * pixelScale);
                            addScore();
                            playJmpNote(5); // 5th of the 8-note ascending run, right as Part 2 begins
                        } else if (jackState === "goodJumpPart2") {
                            jackFrameCounter = 0;
                            jackState = "standingStill";
                            canFall = 0.3;
                            if (jackPlatform === 0) {
                                level += 1;
                                if (isExtraLifeLevel(level)) {
                                    lives += 1;
                                }
                                createGaps();
                                gameState = GameState.LEVEL_COMPLETE;
                                stopAllSound(); // Don't let gameplay sound bleed into the Level Complete screen
                            }
                        }
                    } else {
                        // Notes 2,3,4 (Part 1) / 6,7,8 (Part 2) of the ascending
                        // run - see SGGoodJmp in JJGame.asm.
                        const combinedFrame = jackState === "goodJumpPart1" ? jackFrameCounter : jackFrameCounter + 4;
                        playJmpNote(combinedFrame + 1);
                    }
                    break;
                case "fallingPart1":
                case "fallingPart2":
                    jackFrameCounter += 1;
                    if (jackFrameCounter === 4) {
                        if (jackState === "fallingPart1") {
                            jackFrameCounter = 0;
                            jackPlatform += 1;
                            // Landing on the bottom platform (8) only costs a life once the dazed
                            // (stunned) animation finishes below - not immediately on landing, which
                            // would otherwise cost a second life for the same fall.
                            jackState = "fallingPart2";
                            jackY = baseHeight - graphics.jack.standingStill.height * pixelScale - ((8 - jackPlatform) * 24 * pixelScale);
                            playJmpNote(4); // 5th of the 8-note descending run, right as Part 2 begins
                        } else if (jackState === "fallingPart2") {
                            jackFrameCounter = 0;
                            jackState = "stunned1";
                            stunnedNoteIndex = 1; // Fresh stunned sequence always starts at PlayStn1
                            playStunnedNote();
                        }
                    } else {

                        const combinedFrame = jackState === "fallingPart1" ? jackFrameCounter : jackFrameCounter + 4;
                        playJmpNote(8 - combinedFrame);
                    }
                    break;
                case "stunned1":
                    jackFrameCounter += 1;
                    playStunnedNote();
                    if (jackFrameCounter === 4) {
                        jackFrameCounter = 0;
                        jackState = "stunned2";
                    }
                    break;
                case "stunned2":
                    jackFrameCounter += 1;
                    playStunnedNote();
                    if (jackFrameCounter === 4) {
                        jackFrameCounter = 0;
                        jackState = "stunned3";
                    }
                    break;
                case "stunned3":
                    jackFrameCounter += 1;
                    playStunnedNote();
                    if (jackFrameCounter === 4) {
                        jackFrameCounter = 0;
                        jackState = "standingStill";
                        if (jackPlatform === 8) {
                            lives -= 1;
                            if (lives === 0) {
                                enterGameOver();
                            }
                        }
                    }
                    break;
                case "badJump":
                    jackFrameCounter += 1;
                    if (jackFrameCounter === 4) {
                        jackFrameCounter = 0;
                        jackState = "stunned1";
                        stunnedNoteIndex = 1; // Fresh stunned sequence always starts at PlayStn1
                        playStunnedNote();
                    } else if (jackFrameCounter === 3) {
                        playBadJumpEnd(); // Falling 3-note run, as Jack drops back down
                    } else {
                        playShock(); // Frames 1 & 2 - the moment his head bumps the Jline
                    }
                    break;
            }
            jackFrameTimer = 0;

        }

        if (runningFootstepTimer >= RUNNING_FOOTSTEP_INTERVAL_SECONDS) {
            runningFootstepTimer -= RUNNING_FOOTSTEP_INTERVAL_SECONDS;
            if (jackState === "runningLeft" || jackState === "runningRight") {
                playRunningFootstep();
            }
        }
    }

    switch (gameState) {
        case GameState.TITLE: // title screen
            updateTitleView(secondsPassed);
            if (keyboardTimer < 0) {
                if (isKeyDownFresh(' ')) {
                    lives = 6;
                    score = 0;
                    level = 0;
                    randomizeHazardDesigns(); // New game - re-randomize which design each Hazard slot starts with 
                    gameState = GameState.INTRO
                    keyboardTimer = keyboardDelay;
                    keysPendingRelease.add(' ');
                }
            }
            break;

        case GameState.INTRO: // one-time story teaser shown before level 1
            if (keyboardTimer < 0) {
                if (isKeyDownFresh(' ')) {
                    gameState = GameState.PLAYING
                    keyboardTimer = keyboardDelay;
                    keysPendingRelease.add(' ');
                }
            }
            break;

        case GameState.PLAYING: // playing
            {
                const touchingHazardNow = isTouchingHazard(jackX, jackPlatform);
                if (touchingHazardNow && !wasTouchingHazard &&
                    (jackState === "standingStill" || jackState === "runningLeft" || jackState === "runningRight" ||
                        jackState === "stunned1" || jackState === "stunned2" || jackState === "stunned3")) {
                    jackState = "stunned1";
                    jackVel = 0;
                    jackFrameCounter = 0;
                    jackFrameTimer = 0;
                    playHazardHit();
                }
                wasTouchingHazard = touchingHazardNow;
            }
            if (isOverGap(jackX, jackPlatform) && jackState !== "fallingPart1" && jackState !== "fallingPart2" && jackState !== "goodJumpPart1" && jackState !== "goodJumpPart2") {
                jackState = "fallingPart1";
                jackVel = 0;
                jackFrameCounter = 0;
                jackFrameTimer = 0;
                playJmpNote(8);
            }
            if (keyboardTimer < 0) {
                switch (jackState) {
                    case "standingStill":
                    case "runningLeft":
                    case "runningRight":
                        if (isLeftKeyDown()) {
                            jackVel = -gapVel;
                            jackState = "runningLeft";
                            keyboardTimer = keyboardDelay;
                        } else if (isRightKeyDown()) {
                            jackVel = gapVel;
                            jackState = "runningRight";
                            keyboardTimer = keyboardDelay;
                        } else {
                            jackVel = 0;
                            jackState = "standingStill";
                        }
                        if (isJumpKeyDown() && canJump && isGoodJump(jackX, jackPlatform - 1)) {
                            // Handle jump logic here
                            addGap();
                            keyboardTimer = keyboardDelay;
                            jackState = "goodJumpPart1";
                            jackVel = 0;
                            jackFrameCounter = 0;
                            jackFrameTimer = 0;
                            canJump = false; // Require all jump keys to be released before another jump can start
                            playJmpNote(1);
                        }
                        if (isJumpKeyDown() && canJump && !isGoodJump(jackX, jackPlatform - 1)) {
                            // Handle bad jump logic here
                            keyboardTimer = keyboardDelay;
                            jackState = "badJump";
                            jackVel = 0;
                            jackFrameCounter = 0;
                            jackFrameTimer = 0;
                            canJump = false; // Require all jump keys to be released before another jump can start
                            playBadJumpStart();
                        }
                        break;
                    case "goodJumpPart1":
                    case "goodJumpPart2":
                        break;
                }

            }
            jackX += jackVel * secondsPassed;
            if (jackX < 0 - graphics.jack.standingStill.width) {
                jackX = baseWidth + graphics.jack.standingStill.width;
            }
            if (jackX > baseWidth + graphics.jack.standingStill.width) {
                jackX = 0 - graphics.jack.standingStill.width;
            }

            gaps.forEach(gap => {
                if (gap.dir === "left") {
                    gap.x -= gapVel * secondsPassed;
                    if (gap.x < 0 - 24 * pixelScale) {
                        gap.x = baseWidth + 24 * pixelScale;
                        gap.platform -= 1 // Left gaps travel up
                        if (gap.platform === -1)
                            gap.platform = 7;
                    }
                } else if (gap.dir === "right") {

                    gap.x += gapVel * secondsPassed;
                    if (gap.x > baseWidth + 24 * pixelScale) {
                        gap.x = 0 - 24 * pixelScale;
                        gap.platform += 1 // Right gaps travel down
                        if (gap.platform === 8)
                            gap.platform = 0;
                    }
                }
            });

            hazards.forEach(h => {
                const hazardMarginPx = HAZARD_WRAP_MARGIN * pixelScale;
                h.x -= gapVel * secondsPassed; // Hazards always crawl left, at the same speed as Jack/the gaps
                if (h.x < -hazardMarginPx) {
                    h.x += baseWidth + 2 * hazardMarginPx;
                    h.platform -= 1;
                    if (h.platform === 0) {
                        h.platform = 7;
                    }
                }

                h.frameTimer += secondsPassed;
                if (h.frameTimer >= HAZARD_FRAME_DELAYS[h.design]) {
                    h.frameCounter = (h.frameCounter + 1) % 4;
                    h.frameTimer = 0;
                }
            });

            break;

        case GameState.LEVEL_COMPLETE: // level complete
            if (keyboardTimer < 0) {
                if (isKeyDownFresh(' ')) {
                    jackPlatform = 8; // Back to the bottom for the next level
                    jackState = "standingStill";
                    jackFrameCounter = 0;
                    jackFrameTimer = 0;
                    gameState = GameState.PLAYING
                    keyboardTimer = keyboardDelay;
                    keysPendingRelease.add(' '); // Don't let this same keypress also register as an immediate Jump once PLAYING starts
                }
            }
            break;

        case GameState.GAME_OVER:
            if (keyboardTimer < 0) {
                if (isKeyDownFresh(' ')) {
                    keyboardTimer = keyboardDelay;
                    keysPendingRelease.add(' ');
                    if (nameEntryPending && leaderboardQualifies(finalScore)) {
                        nameEntryPending = false;
                        startNameEntry();
                    } else {
                        returnToTitle();
                    }
                }
            }
            break;

        case GameState.NAME_ENTRY:
            // The HTML overlay (NameEntry.js) owns all input on this screen - nothing to do here.
            break;

        default:
            break;
    }
}

// Fires once per game over, capturing the run's final score/level so it stays stable even if
// the player lingers on the Game Over screen (and computing whether it already qualifies for
// the leaderboard, same check NameEntry.js uses when actually submitting).
function enterGameOver() {
    stopAllSound(); // Don't let gameplay sound bleed into the Game Over/Name Entry screen
    finalScore = score;
    finalLevel = level + 1; // Internal level is zero-indexed; the level reached is level+1 (see its declaration)
    nameEntryPending = leaderboardQualifies(finalScore);
    potentialLeaderboardEntryTracked = false;
    trackPotentialLeaderboardEntry();

    if (nameEntryPending) {
        // Already known (from the leaderboard data loaded at startup/last game over) to
        // qualify for the Top 50 - skip the Game Over screen and go straight to name entry.
        startNameEntry();
    } else {
        gameState = GameState.GAME_OVER;
    }

    // Re-check against fresh data, since other players may have posted scores since the last
    // read. Only matters for the GAME_OVER screen's Space-key handling below - if we already
    // jumped straight to NAME_ENTRY above, the gameState check here is false and this is a no-op.
    if (window.leaderboardService && finalScore > 0) {
        loadLeaderboard().then(refreshed => {
            if (refreshed && gameState === GameState.GAME_OVER) {
                nameEntryPending = leaderboardQualifies(finalScore);
                trackPotentialLeaderboardEntry();
            }
        });
    }
}

// Fires once per game over, as soon as the score qualifies for the leaderboard -
// counts the opportunity even if the player skips entering their name.
function trackPotentialLeaderboardEntry() {
    if (!nameEntryPending || potentialLeaderboardEntryTracked) {
        return;
    }
    potentialLeaderboardEntryTracked = true;
    if (window.goatcounter && typeof window.goatcounter.count === 'function') {
        window.goatcounter.count({
            path: 'jumping-jack-potential-leaderboard-addition',
            title: 'Jumping Jack Potential Leaderboard Addition',
            event: true
        });
    }
}

function returnToTitle() {
    gameState = GameState.TITLE;
    stopAllSound();
    nameEntryPending = false;
    resetTitleView();
}
// #endregion

// #region draw Each Frame to Canvas
function draw() {
    context.clearRect(0, 0, canvas.width, canvas.height);
    // The Title, Intro, Level Complete and Game Over screens use a black
    // background (like the real ZX Spectrum's PAPER 0) - every other screen
    // keeps the usual canvasColour.
    const useBlackBackground = gameState === GameState.TITLE || gameState === GameState.INTRO || gameState === GameState.LEVEL_COMPLETE || gameState === GameState.GAME_OVER || gameState === GameState.NAME_ENTRY;
    context.fillStyle = useBlackBackground ? "black" : canvasColour;
    context.fillRect(0, 0, canvas.width, canvas.height);

    // On the Title, Level Complete and Game Over screens the rainbow stripe
    // is drawn LAST (after everything else below, see the bottom of this
    // function) and runs the full height of the canvas instead of just the
    // margin, so it displays higher up and sits on top of that screen's
    // content. Every other screen keeps the original behaviour: drawn here,
    // before the gameplay translate below, confined to the margin, so
    // anything gameplay code draws into the bottom margin (game-space y
    // between baseHeight and baseHeight + verticalMargin) layers on top of
    // this background instead of being painted over by it.
    const stripeDrawnLast = useBlackBackground;
    if (!stripeDrawnLast) {
        drawSpectrumStripe(context, false);
    }

    context.save();
    context.translate(0, verticalMargin);

    switch (gameState) {
        case GameState.TITLE: {
            const spriteTopY = 20;
            context.globalAlpha = titleViewAlpha();
            if (titleView.mode === 'sprite') {
                drawSprite(context, graphics.loadingScreenFigures, 0,
                    (baseWidth - graphics.loadingScreenFigures.width * pixelScale) / 2,
                    spriteTopY, `hsl(${titleRainbowHue}, 100%, 50%)`, pixelScale);
            } else {
                drawLeaderboardPage(context);
            }
            context.globalAlpha = 1;
            const titleY = spriteTopY + graphics.loadingScreenFigures.height * pixelScale + 60;
            drawCentredText(context, "A Tribute to Jumping Jack", titleY, "cyan");
            drawCentredText(context, "By Neil Kendall 2026", titleY + 50, "cyan", 3);
            drawCentredText(context, "Original Game by Albert Ball 1983", titleY + 120, "green", 3);
            drawCentredText(context, actionPrompt("Start"), titleY + 170, "yellow", 3);
            break;
        }

        case GameState.INTRO: {
            drawBalladStyleScreen([
                { text: BALLAD_TEASER, color: "yellow" },
                { text: "", color: "cyan" },
                { text: actionPrompt("Continue"), color: "cyan" }
            ]);
            break;
        }

        case GameState.PLAYING:
            drawPlatforms(context);
            drawGaps(context);
            drawHazards(context);
            let jackColour = "black"
            switch (jackState) {
                case "standingStill":
                    drawSprite(context, graphics.jack.standingStill, jackFrameCounter, jackX, jackY, jackColour, pixelScale);
                    break;
                case "runningLeft":
                    drawSprite(context, graphics.jack.runningLeft, jackFrameCounter, jackX, jackY, jackColour, pixelScale);
                    break;
                case "runningRight":
                    drawSprite(context, graphics.jack.runningRight, jackFrameCounter, jackX, jackY, jackColour, pixelScale);
                    break;
                case "goodJumpPart1":
                    drawSprite(context, graphics.jack.goodJumpPart1, jackFrameCounter, jackX, jackY - (graphics.jack.goodJumpPart1.height - graphics.jack.standingStill.height) * pixelScale, jackColour, pixelScale);
                    break;
                case "goodJumpPart2":
                    drawSprite(context, graphics.jack.goodJumpPart2, jackFrameCounter, jackX, jackY, jackColour, pixelScale);
                    break;
                case "fallingPart1":
                    drawSprite(context, graphics.jack.fallingPart1, jackFrameCounter, jackX, jackY, jackColour, pixelScale);
                    break;
                case "fallingPart2":
                    drawSprite(context, graphics.jack.fallingPart2, jackFrameCounter, jackX, jackY - (graphics.jack.fallingPart2.height - graphics.jack.standingStill.height) * pixelScale, jackColour, pixelScale);
                    break;
                case "stunned1":
                case "stunned2":
                case "stunned3":
                    drawSprite(context, graphics.jack.stunned, jackFrameCounter, jackX + 2 * pixelScale, jackY - (graphics.jack.stunned.height - graphics.jack.standingStill.height) * pixelScale, jackColour, pixelScale);
                    break;
                case "badJump":
                    drawSprite(context, graphics.jack.badJump, jackFrameCounter, jackX, jackY - (graphics.jack.badJump.height - graphics.jack.standingStill.height) * pixelScale, jackColour, pixelScale);
                    break;

            }
            drawLives(context);
            drawScore(context);
            break;



        case GameState.LEVEL_COMPLETE: {
            const segments = [
                { text: "LEVEL " + level + " COMPLETE!", color: "cyan" }
            ];
            if (level <= ballad.length) {
                segments.push({ text: "", color: "cyan" });
                segments.push({ text: ballad[level - 1], color: "yellow" });
            }
            const nextLevelHazards = Math.min(level, hazards.length);
            segments.push({ text: "", color: "cyan" });
            segments.push({ text: "NEXT LEVEL - " + nextLevelHazards + " HAZARD" + (nextLevelHazards === 1 ? "" : "S"), color: "cyan" });
            if (isExtraLifeLevel(level)) {
                segments.push({ text: "", color: "cyan" });
                segments.push({ text: "EXTRA LIFE!", color: "cyan" });
            }
            segments.push({ text: "", color: "cyan" });
            segments.push({ text: actionPrompt("Continue"), color: "cyan" });

            drawBalladStyleScreen(segments);
            break;
        }

        case GameState.GAME_OVER:
            drawCentredText(context, "Game Over\n\n" + actionPrompt("Restart"), baseHeight / 4, "red");
            break;

        case GameState.NAME_ENTRY:
            drawNameEntry(context);
            break;
        default:
            break;
    }

    context.restore();

    // Top-score banner in the top margin (only has room before the sprite/leaderboard area
    // starts) - only shown once real leaderboard data has loaded and there's an actual entry;
    // stays blank while offline/loading or if the leaderboard is still empty.
    if (gameState === GameState.TITLE && leaderboardEntries.length > 0) {
        const topEntry = leaderboardEntries[0];
        drawCentredText(context, "HI SCORE " + topEntry.name + " " + topEntry.score.toString().padStart(6, '0'), verticalMargin / 2, "magenta", 3);
    }

    if (stripeDrawnLast) {
        drawSpectrumStripe(context, true);
    }

    if (screenFlashTimer > 0) {
        context.fillStyle = screenFlashColour;
        context.globalAlpha = screenFlashTimer / SCREEN_FLASH_DURATION_SECONDS;
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.globalAlpha = 1;
    }

}
// #endregion

// #region other methods

function resizeCanvas() {
    if (!canvas) return; // Guard against calling before canvas is created
    const gameWidth = canvas.width;
    const gameHeight = canvas.height;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const scaleX = windowWidth / gameWidth;
    const scaleY = windowHeight / gameHeight;
    scale = Math.min(scaleX, scaleY);
    canvas.style.transform = `scale(${scale})`;
    canvas.style.position = 'absolute';
    canvas.style.left = `${(windowWidth - gameWidth * scale) / 2}px`;
    canvas.style.top = `${(windowHeight - gameHeight * scale) / 2}px`;
}

function getMouseClickPosition(canvas, event) {
    let rect = canvas.getBoundingClientRect();
    let x = event.clientX - rect.left;
    let y = event.clientY - rect.top;
    mouseX = Math.round(x / scale);
    mouseY = Math.round(y / scale);
}

function drawCentredText(ctx, textString, y, color = "white", scale = pixelScale) {
    drawBitmapText(ctx, textString, baseWidth / 2, y, color, scale, "center");
}

function drawBitmapText(ctx, textString, x, y, color, scale, align = "left") {
    const lines = textString.split("\n");
    const lineHeight = bitmapFont.height * scale;
    const startY = Math.round(y - (lines.length * lineHeight) / 2);
    ctx.fillStyle = color;
    lines.forEach((line, lineIndex) => {
        const lineWidth = line.length * bitmapFont.width * scale;
        let startX;
        if (align === "center") {
            startX = x - lineWidth / 2;
        } else if (align === "right") {
            startX = x - lineWidth;
        } else {
            startX = x;
        }
        const lineY = startY + lineIndex * lineHeight;
        for (let i = 0; i < line.length; i++) {
            const glyph = bitmapFont.glyphs[line[i]];
            if (!glyph) continue; // unsupported character - leave its cell blank, like a space
            const charX = startX + i * bitmapFont.width * scale;
            for (let row = 0; row < bitmapFont.height; row++) {
                const bits = glyph[row];
                for (let col = 0; col < bitmapFont.width; col++) {
                    if (bits[col] === '1') {
                        ctx.fillRect(Math.round(charX + col * scale), Math.round(lineY + row * scale), scale, scale);
                    }
                }
            }
        }
    });
}

function drawSprite(ctx, sprite, frameIndex, x, y, color = "black", pixelScale = 1) {
    const frame = sprite.frames[frameIndex % sprite.frames.length];
    // Round to hole pixels so each per-pixel fillRect below lands on an exact pixel boundary -
    // fractional positions (e.g. from delta-time based movement) would otherwise let the canvas
    // anti-alias each rect's edges independently, leaving visible hairline gaps between adjacent pixels.
    const drawX = Math.round(x - sprite.anchor.x * pixelScale);
    const drawY = Math.round(y - sprite.anchor.y * pixelScale);
    ctx.fillStyle = color;
    for (let row = 0; row < sprite.height; row++) {
        const pixels = frame[row];
        for (let col = 0; col < sprite.width; col++) {
            if (pixels[col] === '1') {
                ctx.fillRect(drawX + col * pixelScale, drawY + row * pixelScale, pixelScale, pixelScale);
            }
        }
    }
}

function drawPlatforms(ctx) {
    for (let y = 0; y < 193; y += 24) {
        ctx.fillStyle = "darkred";
        ctx.fillRect(0, y * pixelScale, baseWidth, pixelScale);
    }
}

function drawSpectrumStripe(ctx, fullHeight = false) {
    const marginTop = canvas.height - verticalMargin;
    const marginBottom = canvas.height;
    ctx.fillStyle = "black";
    ctx.fillRect(0, marginTop, canvas.width, verticalMargin);

    const stripeColours = ["red", "yellow", "green", "cyan"];

    const stripeAngle = 66 * Math.PI / 180;
    const sinA = Math.sin(stripeAngle);
    const cosA = Math.cos(stripeAngle);
    const stripeThickness = verticalMargin * 0.4;
    const bandSSpread = stripeThickness / stripeColours.length;

    const clipTop = fullHeight ? 0 : marginTop;
    const sOuter = canvas.width * sinA + marginTop * cosA;

    // x coordinate of the point on band-boundary line s, at a given y.
    const xAt = (s, y) => (s - y * cosA) / sinA;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, clipTop, canvas.width, marginBottom - clipTop);
    ctx.clip();

    let s1 = sOuter;
    for (let i = stripeColours.length - 1; i >= 0; i--) {
        const s0 = s1 - bandSSpread;
        ctx.fillStyle = stripeColours[i];
        ctx.beginPath();
        ctx.moveTo(xAt(s1, clipTop), clipTop);
        ctx.lineTo(xAt(s0, clipTop), clipTop);
        ctx.lineTo(xAt(s0, marginBottom), marginBottom);
        ctx.lineTo(xAt(s1, marginBottom), marginBottom);
        ctx.closePath();
        ctx.fill();
        s1 = s0;
    }

    ctx.restore();
}

function drawGaps(ctx) {
    ctx.fillStyle = "#6a6a6a";
    for (let i = 0; i < gaps.length; i++) {
        const gap = gaps[i];
        // Round for the same reason as drawSprite - avoids hairline seams from sub-pixel positioning.
        ctx.fillRect(Math.round(gap.x), gap.platform * 24 * pixelScale, 24 * pixelScale, pixelScale);
    }
}

function drawHazards(ctx) {
    const activeCount = Math.min(level, hazards.length);
    for (let i = 0; i < activeCount; i++) {
        const h = hazards[i];
        const sprite = graphics.hazards[h.design];
        const hazardColour = HAZARD_COLOUR_PALETTE[i % HAZARD_COLOUR_PALETTE.length];
        const topY = h.platform * 24 * pixelScale - sprite.height * pixelScale;
        drawSprite(ctx, sprite, h.frameCounter, h.x, topY, hazardColour, pixelScale);
    }
}

function addGap() {
    let target = gaps.find(gap => gap.hidden && gap.dir === "left");
    if (!target) {
        target = gaps.find(gap => gap.hidden && gap.dir === "right");
    }
    if (target) {
        target.hidden = false;
        target.x = Math.floor(Math.random() * 256) * pixelScale;
        target.platform = Math.floor(Math.random() * 8);
    }
}

function addScore() {
    score += Math.min(100, 5 * (level + 1));
}

function isOverGap(jackX, jackPlatform) {
    for (let i = 0; i < gaps.length; i++) {
        const gap = gaps[i];
        if (!gap.hidden && gap.platform === jackPlatform && canFall <= 0) {
            if (jackX > gap.x && jackX < gap.x + 24 * pixelScale) {
                return true;
            }
        }
    }
    return false;
}

function isTouchingHazard(jackX, jackPlatform) {
    // stunned1/2/3 all share a single "stunned" sprite in graphics.jack.
    const jackSpriteKey = jackState.startsWith("stunned") ? "stunned" : jackState;
    const jackWidth = graphics.jack[jackSpriteKey].width * pixelScale;
    const jackLeft = jackX;
    const jackRight = jackX + jackWidth;
    const activeCount = Math.min(level, hazards.length);
    for (let i = 0; i < activeCount; i++) {
        const h = hazards[i];
        if (h.platform !== jackPlatform) continue;
        const halfWidthPx = (graphics.hazards[h.design].width / 2) * pixelScale;
        const hazardLeft = h.x - halfWidthPx;
        const hazardRight = h.x + halfWidthPx;
        if (jackRight > hazardLeft && jackLeft < hazardRight) {
            return true;
        }
    }
    return false;
}

function isGoodJump(jackX, jackPlatform) {
    const jumpGapLeadMargin = 6 * pixelScale; // a quarter of the gap's 24-unit width

    const jumpGapTrailMargin = 12 * pixelScale; // half of the gap's 24-unit width

    for (let i = 0; i < gaps.length; i++) {
        const gap = gaps[i];
        if (!gap.hidden && gap.platform === jackPlatform) {
            let lowerBound, upperBound;
            if (gap.dir === "left") {
                lowerBound = gap.x - jumpGapLeadMargin;
                upperBound = gap.x + 24 * pixelScale - jumpGapTrailMargin;
            } else {
                lowerBound = gap.x + jumpGapTrailMargin;
                upperBound = gap.x + 24 * pixelScale + jumpGapLeadMargin;
            }
            if (jackX >= lowerBound && jackX < upperBound) {
                return true;
            }
        }
    }
    return false;
}

function drawLives(ctx) {
    const y = (196 + 12 - graphics.lifeSymbol.height / 2) * pixelScale;
    drawBitmapText(ctx, bitmapFont.lifeGlyph.repeat(lives), 9, y, "#9e0c66", pixelScale, "left");
}

function drawScore(ctx) {
    const y = (196 + 12 - graphics.lifeSymbol.height / 2) * pixelScale;
    drawBitmapText(ctx, "SCORE " + score.toString().padStart(6, '0'), baseWidth - 90, y, "#9e0c66", pixelScale, "right");
}

function createGaps() {
    gaps = []; // Clear existing gaps before creating new ones
    const randomLeftGapX = Math.floor(Math.random() * 256) * pixelScale;
    const randomLeftPlatform = Math.floor(Math.random() * 8);
    const randomRightGapX = Math.floor(Math.random() * 256) * pixelScale;
    const randomRightPlatform = Math.floor(Math.random() * 8);
    gaps.push(new gap(randomLeftGapX, randomLeftPlatform, "left", false, 0));
    gaps.push(new gap(randomRightGapX, randomRightPlatform, "right", false, 0));
    gaps.push(new gap(randomLeftGapX, randomLeftPlatform, "left", true, 0));
    gaps.push(new gap(randomRightGapX, randomRightPlatform, "right", true, 0));
    gaps.push(new gap(randomLeftGapX, randomLeftPlatform, "left", true, 0));
    gaps.push(new gap(randomRightGapX, randomRightPlatform, "right", true, 0));
    gaps.push(new gap(randomLeftGapX, randomLeftPlatform, "left", true, 0));
    gaps.push(new gap(randomRightGapX, randomRightPlatform, "right", true, 0));
}

function createHazards() {
    const occurrenceCounts = {}; // Tracks how many of each design we've seen so far, to stagger their starting frame
    hazards = HAZARD_START_POSITIONS.map((pos, i) => {
        const design = HAZARD_DESIGNS[(i + hazardDesignOffset) % HAZARD_DESIGNS.length];
        const occurrence = occurrenceCounts[design] || 0;
        occurrenceCounts[design] = occurrence + 1;
        const initialFrame = (occurrence * 2) % 4;
        return new hazard(pos.col * 8 * pixelScale, pos.platform, design, initialFrame);
    });
}

function randomizeHazardDesigns() {
    hazardDesignOffset = Math.floor(Math.random() * HAZARD_DESIGNS.length);
    const occurrenceCounts = {};
    hazards.forEach((h, i) => {
        h.design = HAZARD_DESIGNS[(i + hazardDesignOffset) % HAZARD_DESIGNS.length];
        const occurrence = occurrenceCounts[h.design] || 0;
        occurrenceCounts[h.design] = occurrence + 1;
        h.frameCounter = (occurrence * 2) % 4;
    });
}

function drawBalladStyleScreen(segments) {
    const flatLines = segments.flatMap(segment =>
        segment.text.split("\n").map(line => ({ text: line, color: segment.color }))
    );
    const lineHeight = bitmapFont.height * pixelScale;
    const startY = Math.round(baseHeight / 4 - (flatLines.length * lineHeight) / 2);
    flatLines.forEach((line, i) => {
        drawBitmapText(context, line.text, baseWidth / 2, startY + i * lineHeight + lineHeight / 2, line.color, pixelScale, "center");
    });
}

// #endregion

// #region sound

const audioMasterVolume = 0.2;
let audioCtx = null;

// Browsers block audio until a user gesture creates/resumes the
// AudioContext - called from the keydown/mousedown listeners above so the
// very first key press or click unlocks it.
function ensureAudioContext() {
    if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === "suspended") {
        audioCtx.resume();
    }
}

// Plays a single square-wave "beep"
let nextBeepTime = 0;

let activeOscillators = [];

function playBeep(frequencyHz, durationSeconds) {
    if (!audioCtx) return; // Not yet unlocked by a user gesture
    const startTime = Math.max(audioCtx.currentTime, nextBeepTime);
    nextBeepTime = startTime + durationSeconds;
    const osc = audioCtx.createOscillator();
    osc.type = "square";
    osc.frequency.value = frequencyHz;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(audioMasterVolume, startTime);
    // Quick fade-out just before stopping, to avoid an audible click

    gain.gain.setValueAtTime(audioMasterVolume, startTime + Math.max(0, durationSeconds - 0.005));
    gain.gain.linearRampToValueAtTime(0, startTime + durationSeconds);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(startTime);
    osc.stop(startTime + durationSeconds);
    activeOscillators.push(osc);
    osc.onended = () => {
        const i = activeOscillators.indexOf(osc);
        if (i !== -1) activeOscillators.splice(i, 1);
    };
}

function stopAllSound() {
    activeOscillators.forEach(osc => {
        try {
            osc.stop(audioCtx.currentTime);
        } catch (e) {
            // Already stopped/ended - nothing to do
        }
    });
    activeOscillators = [];
    if (audioCtx) {
        nextBeepTime = audioCtx.currentTime;
    }
}

function romPitchToHz(pitch) {
    return 437500 / (pitch + 30.125);
}

const PLAY_JMP_NOTES = {
    1: { pitch: 0x0690, cycles: 3 },
    2: { pitch: 0x0584, cycles: 3 },
    3: { pitch: 0x04A3, cycles: 3 },
    4: { pitch: 0x03E6, cycles: 4 },
    5: { pitch: 0x0347, cycles: 5 },
    6: { pitch: 0x02C2, cycles: 6 },
    7: { pitch: 0x0252, cycles: 8 },
    8: { pitch: 0x01F4, cycles: 9 }
};

function playJmpNote(n) {
    const note = PLAY_JMP_NOTES[n];
    const frequencyHz = romPitchToHz(note.pitch);
    playBeep(frequencyHz, note.cycles / frequencyHz);
}

function playStandingStillTick(jackFrameCounter) {
    playJmpNote(jackFrameCounter % 2 === 0 ? 4 : 3);
}

function playRunningFootstep() {
    playJmpNote(runningFootstepToggle ? 5 : 4);
    runningFootstepToggle = !runningFootstepToggle;
}
const RUNNING_FOOTSTEP_INTERVAL_SECONDS = 4 / 50; // 4 raw 50Hz game-loop frames
let runningFootstepTimer = 0;
let runningFootstepToggle = false; // alternates which of the 2 notes plays next

const PLAY_STN_NOTES = {
    1: { pitch: 0x69, cycles: 0x1C },
    2: { pitch: 0x73, cycles: 0x18 },
    3: { pitch: 0x7D, cycles: 0x17 },
    4: { pitch: 0x88, cycles: 0x14 }
};

function playStnNote(n) {
    const note = PLAY_STN_NOTES[n];
    const frequencyHz = romPitchToHz(note.pitch);
    playBeep(frequencyHz, note.cycles / frequencyHz);
}

let stunnedNoteIndex = 1;
function playStunnedNote() {
    playStnNote(stunnedNoteIndex);
    stunnedNoteIndex = (stunnedNoteIndex % 4) + 1; // 1,2,3,4,1,2,...
}

let screenFlashTimer = 0;
let screenFlashColour = "white";
const SCREEN_FLASH_DURATION_SECONDS = 0.08;

// ROYGBIV HUE for title screen
let titleRainbowHue = 60;
const TITLE_RAINBOW_CYCLE_SECONDS = 8; // how long one full rainbow cycle takes

function playShock() {
    screenFlashTimer = SCREEN_FLASH_DURATION_SECONDS;
    screenFlashColour = "white";
    for (let i = 0; i < 512; i++) {
        const pitch = Math.floor(Math.random() * 16); // 0-15, matching the ROM's "and 0Fh"
        const cycles = Math.floor(Math.random() * 4); // 0-3, matching the ROM's "and 03h"
        if (cycles > 0) {
            const frequencyHz = romPitchToHz(pitch);
            playBeep(frequencyHz, cycles / frequencyHz);
        }
    }
}

function playSqwk() {
    screenFlashTimer = SCREEN_FLASH_DURATION_SECONDS;
    screenFlashColour = "magenta";
    for (let i = 0; i < 84; i++) {
        const pitch = Math.floor(Math.random() * 256); // 0-255, matching the ROM's unmasked random byte
        const cycles = Math.floor(Math.random() * 8); // 0-7, matching the ROM's "and 07h"
        if (cycles > 0) {
            const frequencyHz = romPitchToHz(pitch);
            playBeep(frequencyHz, cycles / frequencyHz);
        }
    }
}

function playHazardHit() {
    playSqwk();
    stunnedNoteIndex = 1;
    playStunnedNote();
}

function playBadJumpStart() {
    playJmpNote(1);
    playJmpNote(2);
    playJmpNote(3);
}
function playBadJumpEnd() {
    playJmpNote(3);
    playJmpNote(2);
    playJmpNote(1);
}

// #endregion
