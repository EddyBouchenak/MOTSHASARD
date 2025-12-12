// Remove import, verify WORDS exists
if (typeof WORDS === 'undefined') {
    console.error("WORDS is not defined. Ensure data.js is loaded first.");
}

// --- State ---
const STATE = {
    forcedWord: null,
    forcedIndex: 0,
    isForcing: false,
    shuffledWords: [],
    currentIndex: 0,
    // Velocity & Prediction
    lastScrollTop: 0,
    lastScrollTime: Date.now(),
    scrollVelocity: 0,
    isLanding: false,
    hasSwappedForCurrentIndex: false,
    forcedRank: 1, // Default position 1
    forceCountdown: null, // New: Number of stops before forcing entire word
    targetWordForCountdown: null, // New: The word to force whole
    recentWords: [] // History buffer for anti-repetition
};

// --- DOM Elements ---
// --- DOM Elements ---
const listElement = document.getElementById('word-list');
const triggerRight = document.getElementById('hidden-trigger');
const triggerLeft = document.getElementById('backdoor-trigger'); // New
const modalRight = document.getElementById('mentalist-modal');
const modalLeft = document.getElementById('backdoor-modal'); // New
const formRight = modalRight.querySelector('form');
const formLeft = modalLeft.querySelector('form'); // New

const inputRight = document.getElementById('target-word');
const indicatorRight = document.getElementById('word-length-indicator');

const inputLeft = document.getElementById('backdoor-word');
// inputLeftCount removed
// indicatorLeft removed

const themeToggle = document.getElementById('theme-toggle');

// --- Configuration ---
const BATCH_SIZE = 80; // Increased for better overflow on large screens

function resetAppState() {
    STATE.forcedWord = null;
    STATE.forcedIndex = 0;
    STATE.isForcing = false;
    STATE.forceCountdown = null;
    STATE.targetWordForCountdown = null;
    STATE.forcedRank = 1;

    // Clear Inputs
    inputRight.value = '';
    indicatorRight.textContent = '(0)';
    inputLeft.value = '';
    // reset radio buttons
    const radios = document.querySelectorAll('input[name="forcing-count"]');
    radios.forEach(r => r.checked = false);

    // Clear recent history to ensure fresh random start? 
    // Maybe not necessary, but "suppression des configurations précédentes" implies state clean.
    console.log("State Reset.");
}

// --- Utilities ---

// Fisher-Yates Shuffle
function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// Helper: Get word starting with letter, excluding specific words
function getWordStartingWith(letter, excludeWords = []) {
    // Advanced Mode: Use Rank
    if (typeof WORDS_BY_RANK !== 'undefined' && STATE.isForcing) {
        const rank = STATE.forcedRank || 1;
        const candidates = WORDS_BY_RANK[rank] ? WORDS_BY_RANK[rank][letter] : null;

        if (candidates && candidates.length > 0) {
            // Filter out exact matches of excludeWords
            // Create a Set for faster lookup if excludeWords is large, but array is fine for small visual buffer
            const validCandidates = candidates.filter(w => !excludeWords.includes(w));

            if (validCandidates.length > 0) {
                return validCandidates[Math.floor(Math.random() * validCandidates.length)];
            } else {
                // Formatting Note: Fallback if all candidates are excluded (e.g. only 1 word exists)
                // We MUST return a word that fits the criteria, so we ignore exclusions.
                return candidates[Math.floor(Math.random() * candidates.length)];
            }
        }
    }

    // Fallback: Random from global list (should rarely happen if data is good)
    return WORDS[Math.floor(Math.random() * WORDS.length)];
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// --- Core Logic ---

function createWordItem(text, isSnapTarget = false) {
    const li = document.createElement('li');
    li.classList.add('word-item');
    if (isSnapTarget) {
        li.classList.add('snap-target');
    }
    li.textContent = text;
    // Add observer for centering
    // Observer removed in favor of scroll calculation
    return li;
}

// Helper: Refresh the Safe Deck
// Helper: Refresh the Safe Deck
function refreshSafeDeck(excludeWord = null) {
    // Safety check for global WORDS
    if (typeof WORDS === 'undefined' || !Array.isArray(WORDS)) {
        console.error("CRITICAL: WORDS data missing");
        STATE.safeDeck = ["ERREUR", "DATA"];
        return;
    }

    let sourceWords = [...WORDS];
    if (excludeWord) {
        sourceWords = sourceWords.filter(w => w !== excludeWord);
    }
    // Filter unwanted
    sourceWords = sourceWords.filter(w => !['DEBUT', 'FIN', 'LISTE', 'VIDE'].includes(w.toUpperCase()));

    // Safety: If deck is empty (e.g. dictionary only had the target word), refill it with placeholders
    if (sourceWords.length === 0) {
        sourceWords = ["ERREUR", "VIDE", "RELOAD"];
    }

    STATE.safeDeck = shuffleArray(sourceWords);
    STATE.safeDeckIndex = 0;
    console.log(`Deck Refreshed. Size: ${STATE.safeDeck.length}. Excluded: ${excludeWord}`);
}


function appendWords(count = BATCH_SIZE) {
    const fragment = document.createDocumentFragment();

    // Get the last added word for initial-check
    let lastWordContent = null;
    const lastLi = listElement.querySelector('.word-item:last-child');
    if (lastLi) {
        lastWordContent = lastLi.textContent;
    }

    for (let i = 0; i < count; i++) {
        // Deck Shuffle Method: Linear Consumption
        let nextWord = STATE.safeDeck[STATE.safeDeckIndex % STATE.safeDeck.length];
        STATE.safeDeckIndex++;

        // CRITICAL SAFETY CHECK: If nextWord is undefined, use a fallback
        if (!nextWord) nextWord = "ERREUR";

        // Simple Visual Diversity Check: Initials
        // Added safety check: Ensure words exist and have length before checking [0]
        if (lastWordContent && nextWord && lastWordContent.length > 0 && nextWord.length > 0 && nextWord[0] === lastWordContent[0]) {
            nextWord = STATE.safeDeck[STATE.safeDeckIndex % STATE.safeDeck.length];
            STATE.safeDeckIndex++;
            if (!nextWord) nextWord = "ERREUR"; // Double safety
        }

        // Failsafe: If somehow we picked the excluded target
        if (STATE.isForcing && STATE.targetWordForCountdown && nextWord === STATE.targetWordForCountdown) {
            nextWord = STATE.safeDeck[STATE.safeDeckIndex % STATE.safeDeck.length];
            STATE.safeDeckIndex++;
            if (!nextWord) nextWord = "ERREUR"; // Triple safety
        }

        // Update tracking
        lastWordContent = nextWord;

        const isSnapTarget = true;
        const item = createWordItem(nextWord, isSnapTarget);
        fragment.appendChild(item);
    }

    listElement.appendChild(fragment);
    updateInfiniteScrollObserver();
}

// --- Observers & Scroll Logic ---

// Helper: Find the element geometrically closest to the center
function getActiveItem() {
    // Robust viewport center calculation
    // On mobile, the "center" is simply the middle of the screen
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const centerY = viewportHeight / 2;

    // Optimization: querySelectorAll is fast enough.
    const items = listElement.querySelectorAll('.word-item');
    let activeItem = null;
    let minDiff = Infinity;

    for (const item of items) {
        const itemRect = item.getBoundingClientRect();
        const itemCenterY = itemRect.top + itemRect.height / 2;
        const diff = Math.abs(itemCenterY - centerY);

        if (diff < minDiff) {
            minDiff = diff;
            activeItem = item;
        }
    }
    return activeItem;
}

// Update UI based on scroll
function updateActiveState() {
    const centerItem = getActiveItem();

    const currentActive = listElement.querySelector('.word-item.active');
    if (currentActive && currentActive !== centerItem) {
        currentActive.classList.remove('active');
    }

    if (centerItem && !centerItem.classList.contains('active')) {
        centerItem.classList.add('active');
    }
}

// Scroll Handler
// Scroll Handler with Prediction
let scrollTimeout;
listElement.addEventListener('scroll', () => {
    const now = Date.now();
    const currentScrollTop = listElement.scrollTop;

    // Calculate Velocity (pixels per ms)
    const dt = now - STATE.lastScrollTime;
    if (dt > 0) {
        const dy = currentScrollTop - STATE.lastScrollTop;
        STATE.scrollVelocity = dy / dt;
    }

    // Velocity & Physics
    // High velocity = "Spinning" mode (no snap)
    // Low velocity = "Landing" mode (snap enabled via CSS removal)

    const absVelocity = Math.abs(STATE.scrollVelocity); // PHYSICS THRESHOLD (Lowered for Mobile Momentum)

    // Tweak: Lower threshold to make it feel more "slippery" / "roulette-like"
    if (absVelocity > 0.5) { // Was 1.0, lowered for easier spin on mobile
        // Fast spin!
        if (!listElement.classList.contains('is-spinning')) {
            listElement.classList.add('is-spinning');
        }
    } else if (absVelocity < 0.1) {
        // Only re-enable snap when almost stopped
        // Slow enough to snap
        if (listElement.classList.contains('is-spinning')) {
            listElement.classList.remove('is-spinning');
        }
    }

    // --- FORCING LOGIC REFINED: ANTICIPATION ---
    // Goal: Pre-load the "Tube" with valid words BEFORE they hit the center.
    // This removes the "Visual Glitch" of the center word changing.

    // Always predict on Landing (Low Speed) to ensure the final destination is valid.
    // Also predict during High Speed (Spinning) to populate the list.
    // AND predict during Medium Speed, but TARGETING COMING ITEMS, not the active one.

    if (STATE.isForcing) {
        // If we are in Countdown Mode, we DO NOT force letters in the tube.
        // We want pure random words until the countdown finishes.
        if (STATE.forceCountdown !== null) {
            // Do nothing during scroll for countdown mode.
            // The forcing happens ONLY on the final stop.
        } else {
            // Standard Rank Forcing (VRTX Mode) - Only runs if Backdoor Mode is NOT active

            // STRICT SAFETY: If we are in "Count Mode" (Backdoor), WE MUST NOT RUN THIS LOGIC.
            // This logic swaps words based on letters, which ruins the "Deck Shuffle" uniqueness.
            if (STATE.targetWordForCountdown !== null) return;

            // We always run this correction loop, but we target different items based on physics.
            const activeItem = getActiveItem();
            // Safety check
            if (!activeItem) return;

            // Only proceed if we have a valid forced word state
            if (!STATE.forcedWord || STATE.forcedIndex >= STATE.forcedWord.length) return;

            const targetLetter = STATE.forcedWord[STATE.forcedIndex];
            const targetIndex = (STATE.forcedRank || 1) - 1;

            // Strategy:
            // 1. Identify "Incoming" items based on direction.
            //    If Scrolling DOWN (Velocity > 0), incoming are BELOW (nextSibling).
            //    If Scrolling UP (Velocity < 0), incoming are ABOVE (previousSibling).
            // 2. Modify "Incoming" items aggressively.

            // Collect items
            let itemsToCorrect = [];

            // LOGIC THRESHOLD (Kept High to avoid visible glitches)
            const isFast = absVelocity > 3.0; // Still high for invisible swaps
            const isStopping = absVelocity < 0.5 && absVelocity > 0.01;

            // If we are in the "Momentum Zone" (0.5 to 3.0), we DO NOT touch the active item.
            if (isFast || isStopping) {
                itemsToCorrect.push(activeItem);
            }

            // B. The Future Items (Anticipation)
            // Look ahead 1 to 5 items to create a seamless buffer.
            let nextCandidate = activeItem;
            const direction = STATE.scrollVelocity > 0 ? 1 : -1;
            const lookAheadCount = 20; // Increased to 20 (approx 2 screens) for invisibility

            for (let i = 0; i < lookAheadCount; i++) {
                if (direction > 0) {
                    nextCandidate = nextCandidate.nextElementSibling;
                } else {
                    nextCandidate = nextCandidate.previousElementSibling;
                }

                if (nextCandidate) {
                    itemsToCorrect.push(nextCandidate);
                } else {
                    break;
                }
            }

            // Prepare Exclusion List from current items to avoid dupes nearby
            let currentVisibleWords = itemsToCorrect.map(el => el.textContent);

            // Also add active item's neighbors to exclusion to be safe
            if (activeItem.previousElementSibling) currentVisibleWords.push(activeItem.previousElementSibling.textContent);
            if (activeItem.nextElementSibling) currentVisibleWords.push(activeItem.nextElementSibling.textContent);


            // Apply Correction to collected items
            itemsToCorrect.forEach(item => {
                const currentWord = item.textContent;
                // Check if it matches requirement
                const letterAtPos = currentWord[targetIndex];

                // If doesn't match OR (crucial) if it's not marked as forced but coincidentally matches
                // we might still want to swap to ensure variety if needed.

                // Only skip if it matches the target letter.
                if (letterAtPos !== targetLetter) {
                    // SWAP
                    // Pass currentVisibleWords as exclusion
                    const newWord = getWordStartingWith(targetLetter, currentVisibleWords);

                    item.textContent = newWord;
                    // Mark it
                    item.setAttribute('data-forced', 'true');

                    // Add to exclusion list so next items don't pick it
                    currentVisibleWords.push(newWord);
                }
            });
            // End of Correction Loop

            // Failsafe Logic for Active Item on Stop
            const centerItemForCheck = getActiveItem(); // Re-query just in case
            if (centerItemForCheck && (centerItemForCheck.textContent[targetIndex] !== targetLetter)) {
                // Failsafe
                const fixedWord = getWordStartingWith(targetLetter, currentVisibleWords); // Use exclusion here too
                centerItemForCheck.textContent = fixedWord;
            }
        }
    }

    // Debounced "Scroll End" to confirm selection
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
        // Scroll completely stopped
        // Ensure snap is active
        listElement.classList.remove('is-spinning');

        updateActiveState();

        if (STATE.isForcing) {
            // New Strict Logic (Backdoor Mode)
            if (STATE.targetWordForCountdown !== null) {
                // Increment Counter (Start of "Generation" for this round)
                STATE.currentRoundCounter++;

                const centerItem = getActiveItem();
                let motGenere = centerItem ? centerItem.textContent : "???";

                // Condition de Victoire
                if (STATE.currentRoundCounter === STATE.targetRound) {
                    // C'est le bon tour ! 
                    if (centerItem && STATE.targetWordForCountdown) {
                        centerItem.textContent = STATE.targetWordForCountdown;
                        centerItem.classList.add('active'); // Ensure highlight
                        motGenere = STATE.targetWordForCountdown;

                        // Disable forcing immediately (One-shot)
                        STATE.isForcing = false;
                        STATE.targetWordForCountdown = null;
                        STATE.forcedWord = null;
                    }
                } else {
                    // Ce n'est PAS le bon tour -> Mot aléatoire
                    // Si par hasard on tombe sur le mot cible, on le change !
                    if (centerItem && centerItem.textContent === STATE.targetWordForCountdown) {
                        // Fallback safe word
                        let safeWord = "RATE";
                        // Find a safe word
                        const attempts = 10;
                        for (let i = 0; i < attempts; i++) {
                            const w = STATE.shuffledWords[Math.floor(Math.random() * STATE.shuffledWords.length)];
                            if (w !== STATE.targetWordForCountdown) {
                                safeWord = w;
                                break;
                            }
                        }
                        centerItem.textContent = safeWord;
                        motGenere = safeWord;
                    }
                }

                // Débuggage Strict Obligatoire
                console.log("Tour actuel : " + STATE.currentRoundCounter + " / Cible : " + STATE.targetRound + " -> Mot : " + motGenere);
                return;
            }


            // Standard Rank Forcing (VRTX Mode) - Only runs if Backdoor Mode is NOT active
            // ... (Rest of existing logic for letter forcing)
            const centerItem = getActiveItem();
            if (!centerItem) return;

            const targetLetter = STATE.forcedWord[STATE.forcedIndex];
            const targetIndex = (STATE.forcedRank || 1) - 1;

            if (centerItem.textContent[targetIndex] !== targetLetter) {
                // Failsafe
                const fixedWord = getWordStartingWith(targetLetter, centerItem.textContent);
                centerItem.textContent = fixedWord;
            }

            if (centerItem.textContent[targetIndex] === targetLetter) {
                STATE.forcedIndex++;
                STATE.hasSwappedForCurrentIndex = false;
                listElement.querySelectorAll('[data-forced]').forEach(el => el.removeAttribute('data-forced'));
                console.log(`Confirmed: ${centerItem.textContent}. Next target index: ${STATE.forcedIndex}`);
                if (STATE.forcedIndex >= STATE.forcedWord.length) {
                    STATE.isForcing = false;
                    STATE.forcedWord = null;
                    STATE.forcedIndex = 0;
                    STATE.forcedRank = 1;
                    console.log("Forcing Complete.");
                }
            }
        }
    }, 150); // 150ms without scroll event = stop
});


// Update on resize too
window.addEventListener('resize', updateActiveState);


// 2. Infinite Scroll
const infiniteScrollObserver = new IntersectionObserver((entries) => {
    const lastEntry = entries[0];
    if (lastEntry.isIntersecting) {
        infiniteScrollObserver.unobserve(lastEntry.target);
        appendWords(BATCH_SIZE);
    }
}, {
    root: listElement,
    rootMargin: "300px" // Load well in advance
});

function updateInfiniteScrollObserver() {
    const items = listElement.querySelectorAll('.word-item');
    if (items.length > 0) {
        const lastItem = items[items.length - 1];
        infiniteScrollObserver.observe(lastItem);
    }
}


// --- Initialization ---

function init() {
    // 1. Prepare Data
    if (WORDS && WORDS.length > 0) {
        // Filter out unwanted markers
        const filteredWords = WORDS.filter(w => !['DEBUT', 'FIN', 'LISTE', 'VIDE'].includes(w.toUpperCase()));
        STATE.shuffledWords = shuffleArray(filteredWords);
    } else {
        STATE.shuffledWords = ["LISTE", "VIDE", "ERREUR", "DATA"];
    }

    // Initialize Safe Deck for first load
    refreshSafeDeck();

    // 2. Clear List
    listElement.innerHTML = '';

    // 3. Initial Fill with Buffer
    // We append a large batch, then scroll to the middle
    const initialCount = BATCH_SIZE * 3;
    appendWords(initialCount);

    // Scroll to the middle item
    const items = listElement.querySelectorAll('.word-item');
    if (items.length > 0) {
        const middleIndex = Math.floor(items.length / 2);
        items[middleIndex].scrollIntoView({ block: 'center' });
        // Initial active update
        setTimeout(updateActiveState, 100);
    }
}


// --- Trigger & Modal Logic ---

function setupTrigger(triggerEl, modalEl, inputEl) {
    let clickCount = 0;
    let clickTimer = null;
    let longPressTimer = null;
    let isPressing = false;

    // Triple Click Support (Replaces Double Click)
    let tapCount = 0;
    let tapTimer = null;

    triggerEl.addEventListener('touchend', (e) => {
        if (e.cancelable) e.preventDefault(); // Stop click emulation
        registerTap();
        cancelLongPress(); // Ensure long press is cancelled
    });

    triggerEl.addEventListener('click', (e) => {
        registerTap();
    });

    function registerTap() {
        tapCount++;

        if (tapCount === 1) {
            tapTimer = setTimeout(() => {
                tapCount = 0;
            }, 600); // 600ms window
        }

        if (tapCount === 3) {
            clearTimeout(tapTimer);
            tapCount = 0;
            openModal();
        }
    }

    triggerEl.addEventListener('mousedown', startLongPress);
    triggerEl.addEventListener('touchstart', (e) => {
        startLongPress();
    }, { passive: true });

    triggerEl.addEventListener('mouseup', cancelLongPress);
    triggerEl.addEventListener('mouseleave', cancelLongPress);
    triggerEl.addEventListener('touchend', (e) => {
        cancelLongPress();
        // Touchend is also handled in handleTap via listener above
    });

    function startLongPress() {
        isPressing = true;
        // 1.5 Seconds for Long Press
        longPressTimer = setTimeout(() => {
            if (isPressing) {
                openModal();
                isPressing = false;
                if (navigator.vibrate) navigator.vibrate(50);
            }
        }, 1500);
    }

    function openModal() {
        resetAppState(); // RESET STATE ON OPEN
        modalEl.showModal();
        inputEl.focus();
    }

    function cancelLongPress() {
        isPressing = false;
        if (longPressTimer) clearTimeout(longPressTimer);
    }
}

// Setup Both Triggers
setupTrigger(triggerRight, modalRight, inputRight);
setupTrigger(triggerLeft, modalLeft, inputLeft);

// Modal Forms Logic

// 1. Right Modal (Original - Rank Forcing)
inputRight.addEventListener('input', (e) => {
    indicatorRight.textContent = `(${e.target.value.trim().length})`;
});

formRight.addEventListener('submit', (e) => {
    e.preventDefault();

    // Read Rank
    const rankInput = formRight.querySelector('input[name="rank"]:checked');
    const rank = rankInput ? parseInt(rankInput.value, 10) : 1;

    const word = inputRight.value.trim().toUpperCase();

    if (word && word.length > 0) {
        modalRight.close();

        // Wait for keyboard to dismiss and layout to stabilize
        setTimeout(() => {
            STATE.forcedWord = word;
            STATE.forcedIndex = 0;
            STATE.forcedRank = rank; // Store Rank
            STATE.isForcing = true;
            STATE.forceCountdown = 0;
            STATE.hasSwappedForCurrentIndex = false;

            // Standard behavior (No Countdown here)
            STATE.forceCountdown = null;
            STATE.targetWordForCountdown = null;

            console.log(`ARMED RIGHT: Word=${word}, Rank=${rank}`);

            cleanAndArm(word); // Helper function
        }, 100);

    } else {
        modalRight.close();
    }
});

// 2. Left Modal (Backdoor - Countdown Forcing)
inputLeft.addEventListener('input', (e) => {
    // No indicator update needed
});

formLeft.addEventListener('submit', (e) => {
    e.preventDefault();

    const word = inputLeft.value.trim().toUpperCase();

    // Read Count from Radio
    const countInput = formLeft.querySelector('input[name="forcing-count"]:checked');
    // FIX: Default to 5 if nothing is selected (prevents infinite random loop)
    const count = countInput ? parseInt(countInput.value, 10) : 5;

    if (word && word.length > 0) {
        modalLeft.close();

        setTimeout(() => {
            STATE.forcedWord = word;
            STATE.isForcing = true;

            // Strict Reset Logic
            STATE.currentRoundCounter = 0;
            STATE.targetRound = count;

            STATE.targetWordForCountdown = word;
            STATE.forceCountdown = null;

            console.log(`ARMED LEFT: Word=${word}, TargetRound=${STATE.targetRound}`);

            cleanAndArm(word);
        }, 100);
    } else {
        modalLeft.close();
    }
});

function cleanAndArm(word) {
    // 1. Prepare the Deck
    refreshSafeDeck(word);

    // Safer Reset Strategy:
    // Instead of trying to keep the active item and deleting siblings (which can glitch layout),
    // we simply wipe the list and start fresh. This ensures "Natural Scroll" physics are reset too.

    listElement.innerHTML = '';

    // Append a fresh batch
    // Force at least a screen's worth of words
    appendWords(Math.max(BATCH_SIZE, 50));

    inputRight.value = '';
    indicatorRight.textContent = '(0)';
    inputLeft.value = '';

    // Scroll to top immediately to show the new list
    listElement.scrollTop = 0;

    // Force update after a repaint to ensure active state is caught
    requestAnimationFrame(() => {
        updateActiveState();
        // Double check after small delay for mobile rendering
        setTimeout(updateActiveState, 50);
    });
}


// --- Theme Logic ---
themeToggle.addEventListener('click', () => {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    html.setAttribute('data-theme', newTheme);
});

// Start
document.addEventListener('DOMContentLoaded', init); // Ensure DOM is ready
