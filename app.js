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
    // Velocity & Prediction
    lastScrollTop: 0,
    lastScrollTime: Date.now(),
    scrollVelocity: 0,
    isLanding: false,
    hasSwappedForCurrentIndex: false
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
const BATCH_SIZE = 40; // Increased for better overflow on large screens

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
    // strict mode: use the sorted dictionary if available
    if (typeof SORTED_WORDS !== 'undefined' && SORTED_WORDS[letter]) {
        const candidates = SORTED_WORDS[letter].filter(w => w.toUpperCase() !== excludeWord.toUpperCase());
        if (candidates.length > 0) {
            return candidates[Math.floor(Math.random() * candidates.length)];
        }
    }

    // Fallback search in the full list
    const candidates = WORDS.filter(w =>
        w.toUpperCase().startsWith(letter.toUpperCase()) &&
        w.toUpperCase() !== excludeWord.toUpperCase()
    );
    if (candidates.length === 0) {
        // Fallback: just return a random word (should not happen with good data)
        return WORDS[Math.floor(Math.random() * WORDS.length)];
    }
    return candidates[Math.floor(Math.random() * candidates.length)];
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

    STATE.lastScrollTop = currentScrollTop;
    STATE.lastScrollTime = now;

    // Detect Deceleration / Landing Phase
    // Thresholds: High velocity = swiping. Low velocity = stopping.
    // We treat anything below ~0.5 px/ms as "landing soon"
    const isLanding = Math.abs(STATE.scrollVelocity) < 0.5 && Math.abs(STATE.scrollVelocity) > 0.01;

    if (STATE.isForcing && isLanding && !STATE.hasSwappedForCurrentIndex) {
        // --- PREDICTIVE SWAP ---
        // 1. Identify Target
        const activeItem = getActiveItem();

        if (activeItem && STATE.forcedWord && STATE.forcedIndex < STATE.forcedWord.length) {
            const targetLetter = STATE.forcedWord[STATE.forcedIndex];

            // Check if we need to swap
            if (!activeItem.textContent.startsWith(targetLetter)) {
                // Get a new word
                const newWord = getWordStartingWith(targetLetter, activeItem.textContent);

                // SWAP IT!
                // Note: We do this only once per landing phase to avoid flickering
                activeItem.textContent = newWord;

                // Brief highlight/debug to confirm it happened (optional, keep subtle)
                // console.log("Swapped to:", newWord);

                STATE.hasSwappedForCurrentIndex = true;
            }
        }
    }

    // Reset Swap State if velocity spikes (user flicked again)
    if (Math.abs(STATE.scrollVelocity) > 1.0) {
        STATE.hasSwappedForCurrentIndex = false;
    }

    // Debounced "Scroll End" to confirm selection
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
        // Scroll completely stopped
        updateActiveState();

        if (STATE.isForcing) {
            const centerItem = getActiveItem();
            const targetLetter = STATE.forcedWord[STATE.forcedIndex];

            if (centerItem && centerItem.textContent.startsWith(targetLetter)) {
                // Success! Move to next letter for next scroll
                STATE.forcedIndex++;
                STATE.hasSwappedForCurrentIndex = false; // Reset for next turn

                console.log(`Confirmed: ${centerItem.textContent}. Next target index: ${STATE.forcedIndex}`);

                if (STATE.forcedIndex >= STATE.forcedWord.length) {
                    STATE.isForcing = false;
                    STATE.forcedWord = null;
                    STATE.forcedIndex = 0;
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

    const word = inputElement.value.trim().toUpperCase();
    if (word && word.length > 0) {
        modalElement.close();

        // Wait for keyboard to dismiss and layout to stabilize
        setTimeout(() => {
            STATE.forcedWord = word;
            STATE.forcedIndex = 0;
            STATE.isForcing = true;
            STATE.forceCooldown = 0; // Not used in predictive mode
            STATE.hasSwappedForCurrentIndex = false;

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
            appendWords(Math.max(BATCH_SIZE, 100));

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
