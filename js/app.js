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
    centerObserver.observe(li);
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

// --- Observers ---

// 1. Highlight Active Item (Center)
const centerObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('active');
        } else {
            entry.target.classList.remove('active');
        }
    });
}, {
    root: listElement,
    threshold: 0.5,
    rootMargin: "-45% 0px -45% 0px"
});

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
        STATE.forcedWord = word;
        STATE.forcedIndex = 0;
        STATE.isForcing = true;

        // Find the currently active element
        // We use the centerObserver's last known active, but querying DOM is safer
        // Find the currently active element
        // Strategy: Find the element geometrically closest to the center of the list
        // This is robust against the modal being open (which blocks elementFromPoint)
        const listRect = listElement.getBoundingClientRect();
        const listCenterY = listRect.top + listRect.height / 2;

        const items = Array.from(listElement.querySelectorAll('.word-item'));
        let activeItem = null;
        let minDiff = Infinity;

        for (const item of items) {
            const itemRect = item.getBoundingClientRect();
            const itemCenterY = itemRect.top + itemRect.height / 2;
            const diff = Math.abs(itemCenterY - listCenterY);

            if (diff < minDiff) {
                minDiff = diff;
                activeItem = item;
            }
        }

        if (activeItem) {
            // Remove everything AFTER the active item to clear the path for forced words
            while (activeItem.nextElementSibling) {
                activeItem.nextElementSibling.remove();
            }
        }

        // Append the forced sequence immediately
        // appendWords will check STATE.isForcing and generate the sequence
        appendWords(Math.max(BATCH_SIZE, word.length + 5));

        modalElement.close();

        inputElement.value = '';
        lengthIndicator.textContent = '(0)';

        console.log("Forcing enabled for:", word);
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
