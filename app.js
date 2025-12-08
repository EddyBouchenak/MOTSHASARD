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
    lastActiveItem: null // Track to prevent double-swapping same item
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

function appendWords(count = BATCH_SIZE) {
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < count; i++) {
        let nextWord;
        let isSnapTarget = false;

        if (STATE.isForcing && STATE.forcedWord) {
            if (STATE.forceCooldown <= 0) {
                // --- Time to Force! ---
                const targetLetter = STATE.forcedWord[STATE.forcedIndex];

                // Get strictly from sorted list if possible
                nextWord = getWordStartingWith(targetLetter, "XXXXX"); // Exclude nothing specific
                isSnapTarget = true;

                // Advance
                STATE.forcedIndex++;
                // Set gap to ~15-20 words
                STATE.forceCooldown = 15 + Math.floor(Math.random() * 5);

                console.log(`Planned Snap: ${nextWord} (${targetLetter})`);

                if (STATE.forcedIndex >= STATE.forcedWord.length) {
                    STATE.isForcing = false;
                    STATE.forcedWord = null;
                    STATE.forcedIndex = 0;
                }
            } else {
                // --- Cooldown (Random Buffer) ---
                nextWord = STATE.shuffledWords[STATE.currentIndex % STATE.shuffledWords.length];
                STATE.currentIndex++;
                STATE.forceCooldown--;
            }
        } else {
            // --- Normal Mode ---
            nextWord = STATE.shuffledWords[STATE.currentIndex % STATE.shuffledWords.length];
            STATE.currentIndex++;
            // Note: In normal mode, we can optionally make ALL words snap targets if we want standard behavior,
            // OR keep them slippery for the "Roulette" feel. 
            // Let's make them slippery by default (no snap-target) as per plan, so the forced ones feel special.
            // Wait, if normal words don't snap, the list might stop between words?
            // "scroll-snap-type: y mandatory" in CSS requires valid snap points.
            // If random words have no snap-align, the browser will search for the nearest snap point (which might be far away!).
            // CRITICAL FIX: Random words MUST have weak snap or no snap?
            // If they have NO snap, the scroll will slide until it hits a forced word. This is the "Trap".
            // But if user isn't forcing, we want normal scrolling behavior (snapping to every word).
            // SO: If !STATE.isForcing, we might want EVERYTHING to snap?
            // OR: We just accept that normal scrolling is "free" (like standard web), and forcing is "snappy".
            // User asked for "Roulette" feel before. Free scroll is part of that feel.
            // Let's stick to the plan: RANDOM = No Snap, FORCED = Snap.

            // Correction: For normal usage (not Mentalist), the user expects to pick a random word?
            // If nothing snaps, it's hard to stop exactly on center.
            // Let's give Random Items `snap-target` ONLY IF `!STATE.isForcing`.
            // ACTUALLY: The user never complained about normal scroll.
            // Let's make Random Words `snap-target` unless we are in Force Mode?
            // No, keeping it simple:
            // "Buffer" words in Force Mode = NO SNAP.
            // "Normal" words (when not forcing) = SNAP.

            if (!STATE.isForcing) {
                isSnapTarget = true; // Normal behavior
            }
        }

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
let isScrolling = false;
listElement.addEventListener('scroll', () => {
    if (!isScrolling) {
        window.requestAnimationFrame(() => {
            // Check active state for visual purposes (blur/unblur)
            updateActiveState();
            isScrolling = false;
        });
        isScrolling = true;
    }
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
        STATE.shuffledWords = shuffleArray(WORDS);
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
            STATE.forceCooldown = 5; // Start with a small buffer before first word (5 randoms)

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
            appendWords(Math.max(BATCH_SIZE, word.length * 25));

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
