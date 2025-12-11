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
    recentWords: [], // History buffer for anti-repetition
    itemHeight: 100
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
        // Pure Random Generation with Anti-Repetition
        let nextWord;
        let attempts = 0;
        const MAX_ATTEMPTS = 10;

        do {
            nextWord = STATE.shuffledWords[STATE.currentIndex % STATE.shuffledWords.length];
            STATE.currentIndex++;
            attempts++;
        } while (STATE.recentWords.includes(nextWord) && attempts < MAX_ATTEMPTS);

        // Update History
        STATE.recentWords.push(nextWord);
        if (STATE.recentWords.length > 50) { // Keep last 50 words
            STATE.recentWords.shift();
        }

        // In the new system, EVERY word is a potential landing spot (snap target)
        // This ensures consistent physics for the prediction engine.
        const isSnapTarget = true;

        const item = createWordItem(nextWord, isSnapTarget);
        fragment.appendChild(item);
    }

    listElement.appendChild(fragment);
    // updateInfiniteScrollObserver(); // Removed, handled by Locomotive Scroll
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

// GSAP Logic Removed


// 2. Infinite Scroll
// const infiniteScrollObserver = new IntersectionObserver((entries) => { // Removed, handled by Locomotive Scroll
//     const lastEntry = entries[0];
//     if (lastEntry.isIntersecting) {
//         infiniteScrollObserver.unobserve(lastEntry.target);
//         appendWords(BATCH_SIZE);
//     }
// }, {
//     root: listElement,
//     rootMargin: "300px" // Load well in advance
// });

// function updateInfiniteScrollObserver() { // Removed, handled by Locomotive Scroll
//     const items = listElement.querySelectorAll('.word-item');
//     if (items.length > 0) {
//         const lastItem = items[items.length - 1];
//         infiniteScrollObserver.observe(lastItem);
//     }
// }


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
    const initialCount = BATCH_SIZE * 3;
    appendWords(initialCount);

    STATE.itemHeight = listElement.querySelector('.word-item').offsetHeight || 100;

    // Scroll to middle (approx)
    const items = listElement.querySelectorAll('.word-item');
    if (items.length > 0) {
        const middleIndex = Math.floor(initialCount / 2);
        // Use scrollIntoView to center initially
        items[middleIndex].scrollIntoView({ block: 'center' });
    }

    // Initial active update
    setTimeout(updateActiveState, 100);
}

// --- Native Scroll Logic ---

let scrollTimeout;

// Use Standard Scroll Listener
listElement.addEventListener('scroll', () => {
    // 1. Logic Loop (Velocity, Forcing Prediction)
    // We can infer direction/velocity if needed, but for Snap we mostly care about stop.
    handleScrollLogic();

    // 2. Active State Update (Throttle?)
    // Native scroll fires rapidly. Update active state is cheap-ish.
    updateActiveState();

    // 3. Infinite Scroll Check
    const scrollTop = listElement.scrollTop;
    const scrollHeight = listElement.scrollHeight;
    const clientHeight = listElement.clientHeight;

    if (scrollHeight - scrollTop - clientHeight < 500) {
        appendWords(BATCH_SIZE);
    }
}, { passive: true });


function handleScrollLogic() {
    // Detect Stop for Forcing
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
        // STOPPED (Debounced)

        if (STATE.isForcing) {
            if (STATE.forceCountdown !== null) {
                if (STATE.forceCountdown > 0) {
                    STATE.forceCountdown--;
                    console.log(`Stop detected. Countdown: ${STATE.forceCountdown}`);
                } else if (STATE.forceCountdown === 0) {
                    // Trigger Landing
                    triggerForceScroll();
                }
            }
        }

        // Ensure final snap state is clean? 
        // CSS Snap handles position. active state handles visual.

    }, 150);
}

function triggerForceScroll() {
    const activeItem = listElement.querySelector('.word-item.active');

    // Safety: If activeItem is null (e.g. fast swipe?), getGeometric
    const targetItem = activeItem || getActiveItem();

    if (targetItem && STATE.targetWordForCountdown) {
        targetItem.textContent = STATE.targetWordForCountdown;
        // Add specific class for effect?
        targetItem.classList.add('forcing-landed');

        // Ensure Perfect Centering with Smooth Scroll
        // CSS Snap pulls it, but scrollIntoView ensures it.
        targetItem.scrollIntoView({ behavior: 'smooth', block: 'center' });

        console.log("Forced Landed (Native).");
        STATE.isForcing = false;
        STATE.forceCountdown = null;
        STATE.targetWordForCountdown = null;
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
            STATE.forceCooldown = 0;
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
    const count = countInput ? parseInt(countInput.value, 10) : 0; // Default 0 if nothing selected

    if (word && word.length > 0) {
        modalLeft.close();

        setTimeout(() => {
            STATE.forcedWord = word;
            STATE.forcedIndex = 0;
            STATE.isForcing = true;

            // Strict N-th logic:
            // Input N=3 means "Show target at 3rd throw".
            // So we need 2 random throws before.
            // Countdown should be N-1.

            let finalCount;
            if (count > 0) {
                finalCount = count - 1;
            } else {
                finalCount = 0; // Immediate force if N=1 or 0
            }

            STATE.forceCountdown = finalCount;
            STATE.targetWordForCountdown = word;

            console.log(`ARMED LEFT: Word=${word}, UserInput=${count}, InternalCountdown=${finalCount}`);

            cleanAndArm(word);
        }, 100);
    } else {
        modalLeft.close();
    }
});

function cleanAndArm(word) {
    const activeItem = getActiveItem();
    if (activeItem) {
        while (activeItem.nextElementSibling) {
            activeItem.nextElementSibling.remove();
        }
    }
    appendWords(Math.max(BATCH_SIZE, 300));

    inputRight.value = '';
    indicatorRight.textContent = '(0)';

    inputLeft.value = '';
    inputLeftCount.value = '';
    indicatorLeft.textContent = '(0)';

    updateActiveState();
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
