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
    currentIndex: 0
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
    // Search in the original full list to ensure we find a candidate
    const candidates = WORDS.filter(w =>
        w.toUpperCase().startsWith(letter.toUpperCase()) &&
        w.toUpperCase() !== excludeWord.toUpperCase()
    );
    if (candidates.length === 0) {
        // Fallback: just return a random word if no match found (unlikely for common letters)
        return WORDS[Math.floor(Math.random() * WORDS.length)];
    }
    return candidates[Math.floor(Math.random() * candidates.length)];
}

// --- Core Logic ---

function createWordItem(text) {
    const li = document.createElement('li');
    li.classList.add('word-item');
    li.textContent = text;
    // Add observer for centering
    // Observer removed in favor of scroll calculation
    return li;
}

function appendWords(count = BATCH_SIZE) {
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < count; i++) {
        let nextWord;

        if (STATE.isForcing && STATE.forcedWord) {
            // --- Forcing Mode ---
            const targetLetter = STATE.forcedWord[STATE.forcedIndex];

            nextWord = getWordStartingWith(targetLetter, STATE.forcedWord);

            STATE.forcedIndex++;

            if (STATE.forcedIndex >= STATE.forcedWord.length) {
                STATE.isForcing = false;
                STATE.forcedWord = null;
                STATE.forcedIndex = 0;
            }
        } else {
            // --- Sequential Loop Mode ---
            nextWord = STATE.shuffledWords[STATE.currentIndex % STATE.shuffledWords.length];
            STATE.currentIndex++;

            // Re-shuffle if we completed a full loop to prevent exact same pattern?
            // User asked for "suite logique" (logical continuation), which implies a loop or consistent stream.
            // Let's keep it simple: simple infinite loop of the shuffled list.
        }

        const item = createWordItem(nextWord);
        fragment.appendChild(item);
    }

    listElement.appendChild(fragment);

    // Update Infinite Scroll Sentinel
    updateInfiniteScrollObserver();
}

// --- Observers & Scroll Logic ---

// Helper: Find the element geometrically closest to the center
function getActiveItem() {
    const listRect = listElement.getBoundingClientRect();
    const listCenterY = listRect.top + listRect.height / 2;

    // Optimization: querySelectorAll is fast enough for < 100 items. 
    // If list grows huge, we might need optimization, but generic loop is fine here.
    const items = listElement.querySelectorAll('.word-item');
    let activeItem = null;
    let minDiff = Infinity;

    // We can optimization search by checking only visible items if needed, 
    // but full iteration is robust and simple for now.
    for (const item of items) {
        const itemRect = item.getBoundingClientRect();
        const itemCenterY = itemRect.top + itemRect.height / 2;
        const diff = Math.abs(itemCenterY - listCenterY);

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

// Throttled Scroll Handler
let isScrolling = false;
listElement.addEventListener('scroll', () => {
    if (!isScrolling) {
        window.requestAnimationFrame(() => {
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

            // Use the unified getActiveItem function
            // This is visually what the user sees as "active" in the center
            const activeItem = getActiveItem();

            if (activeItem) {
                // Remove everything AFTER the active item to clear the path for forced words
                while (activeItem.nextElementSibling) {
                    activeItem.nextElementSibling.remove();
                }
            }

            // Append the forced sequence immediately
            // appendWords will check STATE.isForcing and generate the sequence
            appendWords(Math.max(BATCH_SIZE, word.length + 5));

            inputElement.value = '';
            lengthIndicator.textContent = '(0)';

            console.log("Forcing enabled for:", word);

            // Force an update of the active state visually
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
