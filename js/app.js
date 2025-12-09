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
    currentIndex: 0,
    currentIndex: 0,
    // Velocity & Prediction
    lastScrollTop: 0,
    lastScrollTime: Date.now(),
    scrollVelocity: 0,
    isLanding: false,
    hasSwappedForCurrentIndex: false,
    forcedRank: 1 // Default position 1
};

// --- DOM Elements ---
const listElement = document.getElementById('word-list');
const triggerElement = document.getElementById('hidden-trigger');
const modalElement = document.getElementById('mentalist-modal');
const formElement = modalElement.querySelector('form');
const inputElement = document.getElementById('target-word');
const lengthIndicator = document.getElementById('word-length-indicator');
const themeToggle = document.getElementById('theme-toggle');

// --- Configuration ---
const BATCH_SIZE = 80; // Increased for better overflow on large screens

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

function getWordStartingWith(letter, excludeWord) {
    // Advanced Mode: Use Rank
    // If STATE.forcedRank is defined, we look for words where letter is at that rank.
    // Rank 1 = Index 0, Rank 2 = Index 1, etc.

    if (typeof WORDS_BY_RANK !== 'undefined' && STATE.isForcing) {
        const rank = STATE.forcedRank || 1;
        const candidates = WORDS_BY_RANK[rank] ? WORDS_BY_RANK[rank][letter] : null;

        if (candidates && candidates.length > 0) {
            // Filter out exact match of excludeWord if needed 
            // (though excludeWord might not be in this specific list)
            const validCandidates = candidates.filter(w => w !== excludeWord);

            if (validCandidates.length > 0) {
                return validCandidates[Math.floor(Math.random() * validCandidates.length)];
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

function appendWords(count = BATCH_SIZE) {
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < count; i++) {
        // Pure Random Generation
        const nextWord = STATE.shuffledWords[STATE.currentIndex % STATE.shuffledWords.length];
        STATE.currentIndex++;

        // In the new system, EVERY word is a potential landing spot (snap target)
        // This ensures consistent physics for the prediction engine.
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

    const absVelocity = Math.abs(STATE.scrollVelocity);

    if (absVelocity > 3.5) {
        // Fast spin!
        if (!listElement.classList.contains('is-spinning')) {
            listElement.classList.add('is-spinning');
        }
    } else if (absVelocity < 1.0) {
        // Slow enough to snap
        if (listElement.classList.contains('is-spinning')) {
            listElement.classList.remove('is-spinning');
        }
    }

    // --- FORCING LOGIC REFINED ---
    // Goal: Match "Home Page" feel (Randomness) while guaranteeing the landing.
    // Strategy:
    // 1. FAST (> 3.5): Swap freely. The list is blurred, user can't see the words changing. 
    //    This "arms" the list with potential winners.
    // 2. MEDIUM (0.5 to 3.5): DO NOT SWAP. The list is sharp(er) and moving. 
    //    Show random words to prove it's "real".
    // 3. SLOW (< 0.5): SWAP. The user is about to land. Ensure the target is there.

    const isFast = absVelocity > 3.5;
    // --- FORCING LOGIC REFINED: ANTICIPATION ---
    // Goal: Pre-load the "Tube" with valid words BEFORE they hit the center.
    // This removes the "Visual Glitch" of the center word changing.

    // Always predict on Landing (Low Speed) to ensure the final destination is valid.
    // Also predict during High Speed (Spinning) to populate the list.
    // AND predict during Medium Speed, but TARGETING COMING ITEMS, not the active one.

    if (STATE.isForcing) {
        // We always run this correction loop, but we target different items based on physics.
        const activeItem = getActiveItem();

        if (activeItem && STATE.forcedWord && STATE.forcedIndex < STATE.forcedWord.length) {
            const targetLetter = STATE.forcedWord[STATE.forcedIndex];
            const targetIndex = (STATE.forcedRank || 1) - 1;

            // Strategy:
            // 1. Identify "Incoming" items based on direction.
            //    If Scrolling DOWN (Velocity > 0), incoming are BELOW (nextSibling).
            //    If Scrolling UP (Velocity < 0), incoming are ABOVE (previousSibling).
            // 2. Modify "Incoming" items aggressively.
            // 3. ONLY Modify "Active" item if:
            //    a) We are STOPPING (cleaning up the landing).
            //    b) We are SPINNING FAST (invisible).

            // Define the "Correction Zone"
            let itemsToCorrect = [];

            // A. The Active Item (Current Center)
            // Rules: Correct IF (Stopping OR Fast Spin). 
            // If Medium speed, LEAVE IT ALONE to avoid glitch.
            const isMediumSpeed = absVelocity >= 0.5 && absVelocity <= 3.5;

            if (!isMediumSpeed) {
                itemsToCorrect.push(activeItem);
            }

            // B. The Future Items (Anticipation)
            // Look ahead 1 to 5 items to create a seamless buffer.
            let nextCandidate = activeItem;
            const direction = STATE.scrollVelocity > 0 ? 1 : -1;
            const lookAheadCount = 5; // How many words ahead to fix?

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

            // Apply Correction to collected items
            itemsToCorrect.forEach(item => {
                const currentWord = item.textContent;
                // Optimization: Don't re-read/re-write if already good
                // Check if it matches requirement
                const letterAtPos = currentWord[targetIndex];

                // If doesn't match OR (crucial) if it's not marked as forced but coincidentally matches
                // we might still want to swap to ensure variety if needed, 
                // but for now, simple matching is enough.

                // Only skip if it matches the target letter.
                if (letterAtPos !== targetLetter) {
                    // SWAP
                    const newWord = getWordStartingWith(targetLetter, currentWord);
                    item.textContent = newWord;
                    // Mark it so we don't swap it again unnecessarily
                    // (Though our check above handles that, the attribute might be useful for debug)
                    item.setAttribute('data-forced', 'true');
                }
            });
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
            const centerItem = getActiveItem();
            const targetLetter = STATE.forcedWord[STATE.forcedIndex];
            const targetIndex = (STATE.forcedRank || 1) - 1;

            // Check success
            // Force-Update on Stop: If we somehow missed the swap during slowdown,
            // we do a final "glitch" swap here to enforce the rule.
            if (centerItem && (centerItem.textContent[targetIndex] !== targetLetter)) {
                console.log("Failsafe Swap Triggered");
                const fixedWord = getWordStartingWith(targetLetter, centerItem.textContent);
                centerItem.textContent = fixedWord;
            }

            // Verify again after potential fix
            if (centerItem && centerItem.textContent[targetIndex] === targetLetter) {
                // Success! Move to next letter for next scroll
                STATE.forcedIndex++;
                STATE.hasSwappedForCurrentIndex = false; // Reset for next turn

                // Cleanup marks for the next round
                listElement.querySelectorAll('[data-forced]').forEach(el => el.removeAttribute('data-forced'));

                console.log(`Confirmed: ${centerItem.textContent}. Next target index: ${STATE.forcedIndex}`);

                if (STATE.forcedIndex >= STATE.forcedWord.length) {
                    STATE.isForcing = false;
                    STATE.forcedWord = null;
                    STATE.forcedIndex = 0;
                    STATE.forcedRank = 1; // Reset
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

let clickCount = 0;
let clickTimer = null;
let longPressTimer = null;
let isPressing = false;

triggerElement.addEventListener('click', (e) => {
    e.preventDefault();
    clickCount++;
    if (clickTimer) clearTimeout(clickTimer);

    clickTimer = setTimeout(() => {
        clickCount = 0;
    }, 400);

    if (clickCount === 3) {
        openModal();
        clickCount = 0;
    }
});

triggerElement.addEventListener('mousedown', startLongPress);
triggerElement.addEventListener('touchstart', (e) => {
    e.preventDefault();
    startLongPress();
}, { passive: false });

triggerElement.addEventListener('mouseup', cancelLongPress);
triggerElement.addEventListener('mouseleave', cancelLongPress);
triggerElement.addEventListener('touchend', cancelLongPress);

function startLongPress() {
    isPressing = true;
    longPressTimer = setTimeout(() => {
        if (isPressing) {
            openModal();
            isPressing = false;
        }
    }, 1500);
}

function cancelLongPress() {
    isPressing = false;
    if (longPressTimer) clearTimeout(longPressTimer);
}

function openModal() {
    modalElement.showModal();
    // Auto-focus input
    inputElement.focus();
}

// Modal Form Handling
inputElement.addEventListener('input', (e) => {
    const word = e.target.value.trim();
    lengthIndicator.textContent = `(${word.length})`;
});

formElement.addEventListener('submit', (e) => {
    e.preventDefault();

    // Read Rank
    const rankInput = formElement.querySelector('input[name="rank"]:checked');
    const rank = rankInput ? parseInt(rankInput.value, 10) : 1;

    const word = inputElement.value.trim().toUpperCase();
    if (word && word.length > 0) {
        modalElement.close();

        // Wait for keyboard to dismiss and layout to stabilize
        setTimeout(() => {
            STATE.forcedWord = word;
            STATE.forcedIndex = 0;
            STATE.forcedRank = rank; // Store Rank
            STATE.isForcing = true;
            STATE.forceCooldown = 0;
            STATE.hasSwappedForCurrentIndex = false;

            console.log(`ARMED: Word=${word}, Rank=${rank}`);

            const activeItem = getActiveItem();
            if (activeItem) {
                // Clear everything after active item to ensure clean slate
                while (activeItem.nextElementSibling) {
                    activeItem.nextElementSibling.remove();
                }
            }

            // Generate the Trap Sequence
            // Length needed: (Word Length * 20 gaps) + buffer
            // e.g. 5 letters * 20 = 100 items. 
            // We load a massive chunk to ensure seamless scrolling
            // Fill the list with random noise
            appendWords(Math.max(BATCH_SIZE, 300));

            inputElement.value = '';
            lengthIndicator.textContent = '(0)';

            console.log("Snap Trap Armed for:", word);
            updateActiveState();
        }, 100);

    } else {
        modalElement.close();
    }
});


// --- Theme Logic ---
themeToggle.addEventListener('click', () => {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    html.setAttribute('data-theme', newTheme);
});

// Start
document.addEventListener('DOMContentLoaded', init); // Ensure DOM is ready
