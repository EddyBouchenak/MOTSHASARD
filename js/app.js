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
        // ALWAYS random background words. No logic here.
        const nextWord = STATE.shuffledWords[STATE.currentIndex % STATE.shuffledWords.length];
        STATE.currentIndex++;

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
            minDiff = minDiff;
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

// --- Dynamic Force Swapping ---

const handleScrollStop = debounce(() => {
    // 1. Update visual state (unblur)
    updateActiveState();

    // 2. Force Logic: detecting correct stop
    if (STATE.isForcing && STATE.forcedWord) {
        const activeItem = getActiveItem();

        // Prevent re-triggering on same item if we didn't move enough
        if (activeItem && activeItem !== STATE.lastActiveItem) {

            // Get the next target letter
            const targetLetter = STATE.forcedWord[STATE.forcedIndex];

            // Generate the forced word
            const newWord = getWordStartingWith(targetLetter, activeItem.textContent);

            // MAGIC: Swap the text content
            console.log(`Forcing ${targetLetter} -> ${newWord}`);
            activeItem.textContent = newWord;
            activeItem.style.color = "var(--accent-color)"; // Subtle hint it worked, maybe remove later

            // Advance state
            STATE.lastActiveItem = activeItem;
            STATE.forcedIndex++;

            // Check completion
            if (STATE.forcedIndex >= STATE.forcedWord.length) {
                console.log("Forcing Complete");
                STATE.isForcing = false;
                STATE.forcedWord = null;
                STATE.forcedIndex = 0;
            }
        }
    }
}, 150); // 150ms wait to consider it a "Stop"

// Scroll Handler
let isScrolling = false;
listElement.addEventListener('scroll', () => {
    if (!isScrolling) {
        window.requestAnimationFrame(() => {
            // While scrolling, we can update active state to keep it responsive (optional, or just wait for stop)
            // But for "blur" effect, we might want to keep it "blurry" while scrolling and only focus on stop.
            // For now, let's keep the active update logic but relies strictly on CSS transition.

            // Actually, for better performance and blur effect:
            updateActiveState();

            isScrolling = false;
        });
        isScrolling = true;
    }

    // Always trigger the debounce logic
    handleScrollStop();
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
            STATE.lastActiveItem = getActiveItem(); // Track current so we don't swap it immediately

            console.log("Forcing enabled for:", word);

            inputElement.value = '';
            lengthIndicator.textContent = '(0)';

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
