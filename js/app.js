// =================================================================================
// js/app.js - CODE CORRIGÉ POUR LE FORÇAGE SÉQUENTIEL PAR DÉFILEMENT
// =================================================================================

// Vérification de la variable WORDS (supposée être chargée depuis data.js)
if (typeof WORDS === 'undefined') {
    console.error("WORDS is not defined. Ensure data.js is loaded first and defines the WORDS array globally.");
}

// --- State ---
const STATE = {
    forcedWord: null, // Le mot cible (ex: "CHIEN")
    forcedIndex: 0,   // L'index de la lettre courante à forcer (0, 1, 2...)
    isForcing: false, // Indique si la séquence de forçage est active
    shuffledWords: [],// La liste des mots mélangés pour le mode aléatoire
    currentIndex: 0   // L'index dans la liste mélangée pour le mode aléatoire
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
const BATCH_SIZE = 40; // Nombre de mots à ajouter en mode aléatoire

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

/**
 * Recherche et retourne un mot dans la liste WORDS qui commence par 'letter',
 * sans être 'excludeWord'.
 */
function getWordStartingWith(letter, excludeWord) {
    // S'assurer que le tableau WORDS existe pour éviter une erreur
    const wordList = typeof WORDS !== 'undefined' ? WORDS : [];

    const candidates = wordList.filter(w =>
        w.toUpperCase().startsWith(letter.toUpperCase()) &&
        w.toUpperCase() !== excludeWord.toUpperCase()
    );

    if (candidates.length === 0) {
        console.warn(`Aucun mot trouvé pour la lettre ${letter} (ou seulement le mot cible).`);
        // Fallback: retourne un mot aléatoire non-forcé, ou le premier mot disponible
        return wordList.length > 0 ? wordList[Math.floor(Math.random() * wordList.length)] : "PASDELETTE";
    }
    
    // Retourne un candidat aléatoire
    return candidates[Math.floor(Math.random() * candidates.length)];
}

// --- Core Logic ---

function createWordItem(text) {
    const li = document.createElement('li');
    li.classList.add('word-item');
    li.textContent = text;
    // Ajout de l'observer de centrage
    centerObserver.observe(li);
    return li;
}

/**
 * Ajoute des mots à la liste.
 * Important: N'ajoute qu'un seul mot si STATE.isForcing est vrai.
 */
function appendWords(count = BATCH_SIZE) {
    const fragment = document.createDocumentFragment();
    let wordsToAppend = [];
    
    // Si on est en mode forçage, on ne génère qu'un seul mot à la fois pour respecter la règle.
    const loopCount = STATE.isForcing ? 1 : count; 
    
    for (let i = 0; i < loopCount; i++) {
        let nextWord;

        if (STATE.isForcing && STATE.forcedWord) {
            // --- Forcing Mode (injecte 1 mot) ---
            
            // 1. Récupérer la lettre cible
            const targetLetter = STATE.forcedWord[STATE.forcedIndex];

            // 2. Trouver un mot correspondant
            nextWord = getWordStartingWith(targetLetter, STATE.forcedWord);

            // 3. Passer à la lettre suivante
            STATE.forcedIndex++;

            // 4. Vérifier la fin de séquence
            if (STATE.forcedIndex >= STATE.forcedWord.length) {
                console.log("Séquence de forçage terminée. Retour au mode aléatoire.");
                STATE.isForcing = false;
                STATE.forcedWord = null;
                STATE.forcedIndex = 0;
            }
        } else {
            // --- Sequential Loop Mode (injecte BATCH_SIZE mots) ---
            nextWord = STATE.shuffledWords[STATE.currentIndex % STATE.shuffledWords.length];
            STATE.currentIndex++;
        }
        
        wordsToAppend.push(nextWord); 
    }
    
    wordsToAppend.forEach(word => {
        const item = createWordItem(word);
        fragment.appendChild(item);
    });

    listElement.appendChild(fragment);

    // Mettre à jour l'Observer d'Infinite Scroll pour le dernier élément
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
    rootMargin: "-45% 0px -45% 0px" // Détermine le centre de l'affichage
});

// 2. Infinite Scroll
const infiniteScrollObserver = new IntersectionObserver((entries) => {
    const lastEntry = entries[0];
    if (lastEntry.isIntersecting) {
        // Déconnecte l'observer pour ne pas le déclencher plusieurs fois
        infiniteScrollObserver.unobserve(lastEntry.target);
        
        // C'est ici que l'appel à appendWords se fait au moment du défilement
        appendWords(BATCH_SIZE); 
    }
}, {
    root: listElement,
    rootMargin: "300px" // Chargement anticipé
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
    if (typeof WORDS !== 'undefined' && WORDS.length > 0) {
        STATE.shuffledWords = shuffleArray(WORDS);
    } else {
        STATE.shuffledWords = ["LISTE", "VIDE", "ERREUR", "DATA"];
    }

    // 2. Clear List
    listElement.innerHTML = '';

    // 3. Initial Fill with Buffer
    const initialCount = BATCH_SIZE * 3;
    appendWords(initialCount);

    // Scroll au milieu pour commencer
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

// Logique pour ouvrir la modale (Triple clic ou Longue pression)
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
    inputElement.focus();
}

// Indicateur de longueur
inputElement.addEventListener('input', (e) => {
    const word = e.target.value.trim();
    lengthIndicator.textContent = `(${word.length})`;
});

// GESTION DU BOUTON GO (SUBMIT) - CORRECTION APPLIQUÉE ICI
formElement.addEventListener('submit', (e) => {
    e.preventDefault();

    const word = inputElement.value.trim().toUpperCase();
    
    if (word && word.length > 0) {
        // 1. Définir le nouvel état de forçage
        STATE.forcedWord = word;
        STATE.forcedIndex = 0;
        STATE.isForcing = true;

        // 2. Nettoyer la liste après le mot actif (au centre)
        const listRect = listElement.getBoundingClientRect();
        const listCenterY = listRect.top + listRect.height / 2;
        const items = Array.from(listElement.querySelectorAll('.word-item'));
        let activeItem = null;
        let minDiff = Infinity;

        // Trouver l'élément le plus proche du centre (le mot actif)
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
            // Supprimer TOUT ce qui est APRÈS le mot actif.
            while (activeItem.nextElementSibling) {
                activeItem.nextElementSibling.remove();
            }
            // Mettre l'observer sur le mot actif pour qu'il déclenche le nouveau mot
            // au prochain défilement
            infiniteScrollObserver.unobserve(activeItem);
            infiniteScrollObserver.observe(activeItem);
        }
        
        // 🛑 LIGNE CLÉ CORRIGÉE : NE PAS APPELER appendWords ICI.
        // C'est le DÉFILEMENT (via infiniteScrollObserver) qui doit le faire.

        modalElement.close();

        inputElement.value = '';
        lengthIndicator.textContent = '(0)';

        console.log("Forcing enabled for:", word);
    } else {
        // Si le mot est vide, on ferme sans changer d'état
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
document.addEventListener('DOMContentLoaded', init);
