const NAME_STORAGE_KEY = 'jumpingJackPlayerName';
const NAME_DISALLOWED_CHARS = /[^A-Za-z0-9 _-]/g;
const NAME_PANEL_Y = 420; // centre of the input and buttons, in canvas (game-space) coordinates (desktop)
const NAME_ENTER_LABEL_Y_TOUCH = 300; // "ENTER YOUR NAME" label (touch), raised to make room below
const NAME_PANEL_TOP_TOUCH = 340; // top of the letter slots, just below the label (touch)

const NAME_MESSAGE_Y_TOUCH = 430;
const NAME_SAVED_DELAY_MS = 1000;
// Characters selectable with the touch D-pad's up/down letter cycle, in cycling order
const NAME_CHARSET = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_'.split('');

const nameEntry = { score: 0, level: 1, rank: 1, message: '', messageColour: 'white', busy: false, touchMode: false, slots: [], cursor: 0 };
let nameEntryElements = null;

function getNameEntryElements() {
    if (nameEntryElements) {
        return nameEntryElements;
    }
    nameEntryElements = {
        panel: document.getElementById('nameEntry'),
        input: document.getElementById('nameInput'),
        touchNameDisplay: document.getElementById('touchNameDisplay'),
        touchDpad: document.getElementById('touchDpad'),
        submit: document.getElementById('nameSubmit'),
        skip: document.getElementById('nameSkip')
    };
    const { input, touchDpad, submit, skip } = nameEntryElements;

    input.addEventListener('input', () => {
        const cleaned = input.value.replace(NAME_DISALLOWED_CHARS, '').toUpperCase();
        if (cleaned !== input.value) {
            input.value = cleaned;
        }
        if (!nameEntry.busy) {
            setNameEntryMessage('');
        }
        updateSubmitAvailability();
    });
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            submitName();
        } else if (e.key === 'Escape') {
            skipNameEntry();
        }
    });
    touchDpad.addEventListener('click', e => {
        const button = e.target.closest('[data-dpad]');
        if (!button || nameEntry.busy) {
            return;
        }
        switch (button.dataset.dpad) {
            case 'left':
                moveTouchCursor(-1);
                break;
            case 'right':
                moveTouchCursor(1);
                break;
            case 'up':
                cycleTouchChar(1);
                break;
            case 'down':
                cycleTouchChar(-1);
                break;
        }
    });
    setUpDpadPressedHighlight(touchDpad);
    submit.addEventListener('click', submitName);
    skip.addEventListener('click', skipNameEntry);
    return nameEntryElements;
}


function setUpDpadPressedHighlight(touchDpad) {
    const PRESSED_CLASS = 'dpad-btn-pressed';
    const SAFETY_TIMEOUT_MS = 500;

    touchDpad.addEventListener('pointerdown', e => {
        const button = e.target.closest('.dpad-btn');
        if (!button || button.disabled) {
            return;
        }
        button.classList.add(PRESSED_CLASS);
        clearTimeout(button._dpadPressedSafetyTimer);
        button._dpadPressedSafetyTimer = setTimeout(() => {
            button.classList.remove(PRESSED_CLASS);
        }, SAFETY_TIMEOUT_MS);
    });

    const releaseAllDpadButtons = () => {
        document.querySelectorAll('.' + PRESSED_CLASS).forEach(button => {
            button.classList.remove(PRESSED_CLASS);
            clearTimeout(button._dpadPressedSafetyTimer);
            button.blur();
        });
    };
    // Attached to the document (capture phase) rather than the dpad itself, since the iOS
    // bug above specifically stops delivering further events to the original target.
    ['pointerup', 'pointercancel', 'touchend', 'touchcancel', 'mouseup', 'click'].forEach(type => {
        document.addEventListener(type, releaseAllDpadButtons, true);
    });
}

function setNameEntryMessage(text, colour = 'white') {
    nameEntry.message = text;
    nameEntry.messageColour = colour;
}

function setNameEntryBusy(busy) {
    const { input, touchDpad, submit, skip } = getNameEntryElements();
    nameEntry.busy = busy;
    input.disabled = busy;
    touchDpad.querySelectorAll('button').forEach(button => {
        button.disabled = busy;
    });
    updateSubmitAvailability();
    skip.disabled = busy;
}

function updateSubmitAvailability() {
    const { input, submit } = getNameEntryElements();
    const hasName = input.value.replace(/\s+/g, '').length > 0;
    submit.disabled = nameEntry.busy || !hasName;
}

function syncTouchNameToInput() {
    const { input } = getNameEntryElements();
    input.value = nameEntry.slots.join('');
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

function renderTouchNameDisplay() {
    const { touchNameDisplay } = getNameEntryElements();
    touchNameDisplay.innerHTML = '';
    nameEntry.slots.forEach((char, index) => {
        const slot = document.createElement('div');
        slot.className = 'touch-name-slot' + (index === nameEntry.cursor ? ' touch-name-slot-active' : '');
        slot.textContent = char === ' ' ? '' : char;
        touchNameDisplay.appendChild(slot);
    });
}

function moveTouchCursor(delta) {
    nameEntry.cursor = Math.min(LEADERBOARD_NAME_LENGTH - 1, Math.max(0, nameEntry.cursor + delta));
    renderTouchNameDisplay();
}

function cycleTouchChar(delta) {
    let index = NAME_CHARSET.indexOf(nameEntry.slots[nameEntry.cursor]);
    if (index === -1) {
        index = 0;
    }
    index = (index + delta + NAME_CHARSET.length) % NAME_CHARSET.length;
    nameEntry.slots[nameEntry.cursor] = NAME_CHARSET[index];
    syncTouchNameToInput();
    renderTouchNameDisplay();
}

function startNameEntry() {
    const { panel, input, touchNameDisplay, touchDpad, submit, skip } = getNameEntryElements();
    nameEntry.score = finalScore;
    nameEntry.level = finalLevel;
    nameEntry.rank = leaderboardRankFor(finalScore);
    setNameEntryMessage('');
    setNameEntryBusy(false);
    // Undo hideNameEntrySaveControls() from a previous visit to this screen
    submit.style.display = '';
    skip.style.display = '';

    let storedName = '';
    try {
        storedName = (localStorage.getItem(NAME_STORAGE_KEY) || '').replace(NAME_DISALLOWED_CHARS, '').toUpperCase();
    } catch (e) {
        storedName = '';
    }
    input.value = storedName;
    updateSubmitAvailability();

    gameState = GameState.NAME_ENTRY;
    panel.style.display = 'flex';

    const touchMode = isTouchDevice;
    nameEntry.touchMode = touchMode;
    panel.classList.toggle('touch-mode', touchMode);

    input.style.display = touchMode ? 'none' : '';
    touchNameDisplay.style.display = touchMode ? 'flex' : 'none';
    touchDpad.style.display = touchMode ? 'grid' : 'none';

    if (touchMode) {
        nameEntry.slots = storedName.padEnd(LEADERBOARD_NAME_LENGTH, ' ').slice(0, LEADERBOARD_NAME_LENGTH).split('');
        nameEntry.cursor = Math.min(storedName.length, LEADERBOARD_NAME_LENGTH - 1);
        syncTouchNameToInput();
        renderTouchNameDisplay();
    }

    updateNameEntryLayout();
    if (!touchMode) {
        input.focus({ preventScroll: true });
        input.select();
    }
}

function hideNameEntry() {
    const { panel, input } = getNameEntryElements();
    panel.style.display = 'none';
    input.blur();
}


function updateNameEntryLayout() {
    if (gameState !== GameState.NAME_ENTRY) {
        return;
    }
    const { panel } = getNameEntryElements();
    const canvasRect = canvas.getBoundingClientRect();
    const canvasScale = canvasRect.width / baseWidth;
    panel.style.left = `${canvasRect.left + (baseWidth / 2) * canvasScale}px`;
    if (nameEntry.touchMode) {

        panel.style.top = `${canvasRect.top + (verticalMargin + NAME_PANEL_TOP_TOUCH) * canvasScale}px`;
        panel.style.transform = `translate(-50%, 0) scale(${canvasScale})`;
    } else {
        panel.style.top = `${canvasRect.top + (verticalMargin + NAME_PANEL_Y) * canvasScale}px`;
        panel.style.transform = `translate(-50%, -50%) scale(${canvasScale})`;
    }
}


function hideNameEntrySaveControls() {
    const { touchDpad, submit, skip } = getNameEntryElements();
    touchDpad.style.display = 'none';
    submit.style.display = 'none';
    skip.style.display = 'none';
}

function submitName() {
    if (nameEntry.busy) {
        return;
    }
    const { input } = getNameEntryElements();
    const name = input.value.replace(/\s+/g, ' ').trim();
    if (name.length === 0) {

        return;
    }
    if (!isNameAllowed(name)) {
        setNameEntryMessage('NAME NOT ALLOWED', 'red');
        return;
    }
    try {
        localStorage.setItem(NAME_STORAGE_KEY, name);
    } catch (e) {
        // storage unavailable; the name just won't be remembered
    }

    setNameEntryBusy(true);
    setNameEntryMessage('SAVING...');
    submitLeaderboardEntry(name, nameEntry.score, nameEntry.level)
        .then(() => {
            const index = insertLeaderboardEntryLocally({ name, score: nameEntry.score, level: nameEntry.level, createdAt: new Date() });
            setNameEntryMessage('SCORE SAVED!', '#7CFC00');
            hideNameEntrySaveControls();
            setTimeout(() => {
                if (gameState === GameState.NAME_ENTRY) {
                    hideNameEntry();
                    returnToTitle();
                    showLeaderboardPageForRank(index);
                }
            }, NAME_SAVED_DELAY_MS);
        })
        .catch(err => {
            console.warn('Could not save score:', err);
            setNameEntryBusy(false);
            setNameEntryMessage('COULD NOT SAVE - TRY AGAIN', 'red');
        });
}

function skipNameEntry() {
    if (nameEntry.busy) {
        return;
    }
    hideNameEntry();
    returnToTitle();
}

function drawNameEntry(ctx) {
    drawCentredText(ctx, "NEW HIGH SCORE!", 70, "yellow", 5);
    drawCentredText(ctx, "SCORE " + nameEntry.score.toString().padStart(6, '0') + "   LEVEL " + nameEntry.level, 140, "white", 3);
    drawCentredText(ctx, "RANK #" + nameEntry.rank, 180, "white", 3);
    drawCentredText(ctx, "ENTER YOUR NAME", nameEntry.touchMode ? NAME_ENTER_LABEL_Y_TOUCH : 240, "cyan", 3);

    if (nameEntry.message) {
        ctx.fillStyle = nameEntry.messageColour;
        drawCentredText(ctx, nameEntry.message, nameEntry.touchMode ? NAME_MESSAGE_Y_TOUCH : 600, nameEntry.messageColour, 3);
    }
}
