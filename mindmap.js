let scriptData = { scenes: [], characters: [] };

window.addEventListener('pywebviewready', async () => {
    try {
        scriptData = await window.pywebview.api.get_mindmap_data();
        initCorkboard();
        initCharacterBible();
    } catch (e) {
        console.error("Failed to load mind map data", e);
    }
});

// --- Modal Logic ---
const modal = document.getElementById('card-modal');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');
const modalNotes = document.getElementById('modal-notes');
let activeSmallNotesEl = null;
let activeSyncType = null;
let activeSyncId = null;

document.getElementById('modal-close').addEventListener('click', () => {
    modal.style.display = 'none';
});

modalNotes.addEventListener('input', () => {
    if (activeSmallNotesEl) {
        activeSmallNotesEl.innerHTML = modalNotes.innerHTML;
    }
    if (window.pywebview && activeSyncType !== null) {
        if (activeSyncType === 'scene') {
            window.pywebview.api.update_mindmap_note(activeSyncId, modalNotes.innerHTML);
        } else if (activeSyncType === 'character') {
            window.pywebview.api.update_character_note(activeSyncId, modalNotes.innerHTML);
        }
    }
});

function openModal(titleEl, bodyEl, notesEl, syncType, syncId) {
    modalTitle.innerHTML = titleEl.innerHTML;
    modalBody.innerHTML = bodyEl.innerHTML;
    
    if (notesEl) {
        modalNotes.innerHTML = notesEl.innerHTML;
        activeSmallNotesEl = notesEl;
        activeSyncType = syncType;
        activeSyncId = syncId;
        modalNotes.style.display = 'block';
        document.querySelector('.modal-notes-label').style.display = 'block';
    } else {
        modalNotes.innerHTML = '';
        activeSmallNotesEl = null;
        activeSyncType = null;
        activeSyncId = null;
        modalNotes.style.display = 'none';
        document.querySelector('.modal-notes-label').style.display = 'none';
    }
    
    modal.style.display = 'flex';
}

// Tab Switching
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        
        tab.classList.add('active');
        const target = tab.getAttribute('data-target');
        document.getElementById(target).classList.add('active');
        
        if (target === 'freeform') {
            document.getElementById('add-sticky-btn').style.display = 'inline-block';
        } else {
            document.getElementById('add-sticky-btn').style.display = 'none';
        }
    });
});

// --- Toolbar Logic ---
let cardsCollapsed = false;

const btnToggle = document.getElementById('btn-toggle-collapse');
if (btnToggle) {
    btnToggle.addEventListener('click', () => {
        cardsCollapsed = !cardsCollapsed;
        document.querySelectorAll('.card').forEach(card => {
            if (cardsCollapsed) {
                card.classList.add('collapsed');
            } else {
                card.classList.remove('collapsed');
            }
        });
    });
}

const btnSort = document.getElementById('btn-sort-cards');
if (btnSort) {
    btnSort.addEventListener('click', () => {
        const activeTab = document.querySelector('.tab.active');
        if (!activeTab) return;
        
        const target = activeTab.getAttribute('data-target');
        const canvas = document.getElementById(target + '-canvas');
        if (!canvas) return;
        
        const cards = Array.from(canvas.querySelectorAll('.card'));
        let x = 50;
        let y = 50;
        
        let yPadding = 150;
        if (cardsCollapsed) yPadding = 50;
        else if (target === 'character-bible') yPadding = 200;
        
        cards.forEach(card => {
            card.style.left = x + 'px';
            card.style.top = y + 'px';
            x += 220;
            if (x > window.innerWidth - 250) {
                x = 50;
                y += yPadding;
            }
        });
    });
}

// --- Corkboard Logic ---
function initCorkboard() {
    const canvas = document.getElementById('corkboard-canvas');
    canvas.innerHTML = '';
    
    let x = 50;
    let y = 50;
    const yPadding = cardsCollapsed ? 50 : 150;
    
    scriptData.scenes.forEach((scene, index) => {
        const titleText = `Scene ${scene.id}: ${scene.name}`;
        const card = createCard(titleText, scene.characters.join(', ') || 'No characters detected.', x, y, false, scene.notes, 'scene', scene.id);
        if (cardsCollapsed) card.classList.add('collapsed');
        canvas.appendChild(card);
        
        x += 220;
        if (x > window.innerWidth - 250) {
            x = 50;
            y += yPadding;
        }
    });
}

// --- Character Bible Logic ---
function initCharacterBible() {
    const canvas = document.getElementById('character-bible-canvas');
    canvas.innerHTML = '';
    
    let x = 50;
    let y = 50;
    const yPadding = cardsCollapsed ? 50 : 200;
    
    scriptData.characters.forEach((char) => {
        const titleText = char.name;
        
        let autoStats = `<strong>Scenes In:</strong> ${char.scenes.join(', ')}<br>`;
        autoStats += `<strong>Dialogue Blocks:</strong> ${char.dialogueCount}<br>`;
        if (char.intro) {
            autoStats += `<br><strong>Script Intro:</strong> <em>"${char.intro}"</em>`;
        }
        
        const card = createCard(titleText, '', x, y, false, char.notes, 'character', char.name);
        card.querySelector('.card-body').innerHTML = autoStats;
        card.classList.add('character-card');
        if (cardsCollapsed) card.classList.add('collapsed');
        canvas.appendChild(card);
        
        x += 220;
        if (x > window.innerWidth - 250) {
            x = 50;
            y += yPadding;
        }
    });
}

// --- Freeform Logic ---
document.getElementById('add-sticky-btn').addEventListener('click', () => {
    const canvas = document.getElementById('freeform-canvas');
    // Random position in center
    const x = Math.floor(Math.random() * 200) + 100;
    const y = Math.floor(Math.random() * 200) + 100;
    
    const card = createCard('New Note', 'Double click to edit...', x, y, true);
    card.classList.add('freeform-card');
    canvas.appendChild(card);
});

// --- Draggable Card Helper ---
let activeCard = null;
let startX, startY, initialX, initialY;

function createCard(titleText, bodyText, x, y, editable = false, notesHtml = '', syncType = null, syncId = null) {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.left = x + 'px';
    card.style.top = y + 'px';
    
    const title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = titleText;
    if (editable) title.contentEditable = "true";
    
    const body = document.createElement('div');
    body.className = 'card-body';
    body.textContent = bodyText;
    if (editable) body.contentEditable = "true";
    
    card.appendChild(title);
    card.appendChild(body);
    
    // Add notes area for scene or character cards
    if (syncType !== null) {
        const notes = document.createElement('div');
        notes.className = 'card-notes';
        notes.contentEditable = "true";
        notes.innerHTML = notesHtml || '';
        
        if (syncType === 'scene') {
            notes.setAttribute('placeholder', 'Type notes or synopsis here...');
        } else if (syncType === 'character') {
            notes.setAttribute('placeholder', 'Age, Arc, Flaws, etc...');
        }
        
        // Sync to python backend on input
        notes.addEventListener('input', () => {
            if (window.pywebview) {
                if (syncType === 'scene') {
                    window.pywebview.api.update_mindmap_note(syncId, notes.innerHTML);
                } else if (syncType === 'character') {
                    window.pywebview.api.update_character_note(syncId, notes.innerHTML);
                }
            }
        });
        
        card.appendChild(notes);
    }
    
    card.addEventListener('mousedown', dragStart);
    card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const notesEl = card.querySelector('.card-notes');
        openModal(title, body, notesEl, syncType, syncId);
    });
    
    return card;
}

function dragStart(e) {
    if (e.target.contentEditable === "true") return; // Allow text selection
    activeCard = this;
    initialX = this.offsetLeft;
    initialY = this.offsetTop;
    startX = e.clientX;
    startY = e.clientY;
    
    // Bring to front
    const canvas = this.parentElement;
    canvas.appendChild(this);
    
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', dragEnd);
}

function drag(e) {
    if (!activeCard) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    activeCard.style.left = (initialX + dx) + 'px';
    activeCard.style.top = (initialY + dy) + 'px';
}

function dragEnd() {
    activeCard = null;
    document.removeEventListener('mousemove', drag);
    document.removeEventListener('mouseup', dragEnd);
}
