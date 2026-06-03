let scriptData = { scenes: [], characters: [] };

window.refreshMindmap = async function() {
    try {
        scriptData = await window.pywebview.api.get_mindmap_data();
        initCorkboard();
        initCharacterBible();
    } catch (e) {
        console.error("Failed to load mind map data", e);
    }
};

window.addEventListener('pywebviewready', async () => {
    await window.refreshMindmap();
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
        if (target === 'corkboard') initCorkboard();
        if (target === 'character-bible') initCharacterBible();
    });
}

const sortSelect = document.getElementById('sort-select');
if (sortSelect) {
    sortSelect.addEventListener('change', () => {
        const activeTab = document.querySelector('.tab.active');
        if (!activeTab) return;
        const target = activeTab.getAttribute('data-target');
        if (target === 'corkboard') initCorkboard();
        if (target === 'character-bible') initCharacterBible();
    });
}

document.getElementById('btn-add-group').addEventListener('click', () => {
    const activeTab = document.querySelector('.tab.active');
    if (!activeTab) return;
    const type = activeTab.getAttribute('data-target') === 'corkboard' ? 'scene' : 'character';
    
    const groupName = prompt("Enter a name for the new group:");
    if (groupName && groupName.trim() !== '') {
        if (window.pywebview) {
            window.pywebview.api.create_mindmap_group(type, groupName.trim());
        }
    }
});

function sortCards(array) {
    const sortType = sortSelect ? sortSelect.value : 'none';
    if (sortType === 'none') return [...array];
    
    return [...array].sort((a, b) => {
        if (sortType === 'lines') {
            return b.dialogueCount - a.dialogueCount;
        } else if (sortType === 'scenes') {
            const aScenes = a.blockCount !== undefined ? 1 : a.scenes.length;
            const bScenes = b.blockCount !== undefined ? 1 : b.scenes.length;
            return bScenes - aScenes;
        } else if (sortType === 'abc') {
            const aName = a.name.toLowerCase();
            const bName = b.name.toLowerCase();
            return aName.localeCompare(bName);
        } else if (sortType === 'first') {
            const aFirst = a.blockCount !== undefined ? a.id : (a.scenes[0] || 99999);
            const bFirst = b.blockCount !== undefined ? b.id : (b.scenes[0] || 99999);
            return aFirst - bFirst;
        }
        return 0;
    });
}

function repositionUnsortedCards(canvas, type) {
    let startY = 50;
    const groupEls = canvas.querySelectorAll('.mindmap-group');
    if (groupEls.length > 0) {
        let maxBottom = 0;
        groupEls.forEach(el => {
            const bottom = el.offsetTop + el.offsetHeight;
            if (bottom > maxBottom) maxBottom = bottom;
        });
        if (maxBottom > 0) {
            startY = maxBottom + 50;
        }
    }

    let x = 50;
    let y = startY;
    const yPadding = cardsCollapsed ? 50 : (type === 'scene' ? 340 : 280);
    
    const unsortedCards = Array.from(canvas.querySelectorAll('.card')).filter(c => c.parentNode === canvas);
    
    unsortedCards.forEach(card => {
        card.style.left = x + 'px';
        card.style.top = y + 'px';
        x += 220;
        if (x + 250 > canvas.clientWidth) {
            x = 50;
            y += yPadding;
        }
    });
}

function renderGroups(canvas, type) {
    const groupsData = type === 'scene' ? scriptData.groups?.scenes : scriptData.groups?.characters;
    const groupContainers = {};
    if (groupsData) {
        groupsData.forEach(g => {
            const groupEl = document.createElement('div');
            groupEl.className = 'mindmap-group';
            if (g.collapsed) groupEl.classList.add('collapsed');
            
            const header = document.createElement('div');
            header.className = 'group-header';
            header.innerHTML = `<span>${g.name}</span><span>▼</span>`;
            header.addEventListener('click', () => {
                groupEl.classList.toggle('collapsed');
                repositionUnsortedCards(canvas, type);
                if (window.pywebview) {
                    window.pywebview.api.toggle_group_collapse(type, g.id, groupEl.classList.contains('collapsed'));
                }
            });
            
            const body = document.createElement('div');
            body.className = 'group-body';
            
            groupEl.appendChild(header);
            groupEl.appendChild(body);
            canvas.appendChild(groupEl);
            
            groupContainers[g.id] = body;
        });
    }
    return groupContainers;
}

// --- Corkboard Logic ---
function initCorkboard() {
    const canvas = document.getElementById('corkboard-canvas');
    canvas.innerHTML = '';
    
    const groupContainers = renderGroups(canvas, 'scene');
    const sortedScenes = sortCards(scriptData.scenes);
    const unsortedCards = [];
    
    sortedScenes.forEach((scene, index) => {
        const titleText = scene.customTitle || `Scene ${scene.id}: ${scene.location || scene.name}`;
        
        let ratio = "Balanced";
        if (scene.actionCount > scene.dialogueCount * 2) ratio = "Action-Heavy";
        if (scene.dialogueCount > scene.actionCount * 2) ratio = "Dialogue-Heavy";
        
        let estPages = (scene.blockCount / 55).toFixed(1);
        let chars = scene.characters.join(', ') || 'None';
        
        const bodyHtml = scene.customBody || `
            <div class="meta-tag"><strong>Time:</strong> ${scene.time || 'N/A'}</div>
            <div class="meta-tag"><strong>Length:</strong> ~${estPages} pgs</div>
            <div class="meta-tag"><strong>Type:</strong> ${ratio}</div>
            <div class="meta-tag meta-chars"><strong>Chars:</strong> ${chars}</div>
            ${scene.synopsis ? `<div class="meta-synopsis"><i>"${scene.synopsis}"</i></div>` : ''}
        `;
        
        const card = createCard(titleText, bodyHtml, 0, 0, false, scene.notes, 'scene', scene.id);
        if (cardsCollapsed) card.classList.add('collapsed');
        
        if (scene.groupId && groupContainers[scene.groupId]) {
            card.classList.add('in-group');
            groupContainers[scene.groupId].appendChild(card);
        } else {
            unsortedCards.push(card);
        }
    });

    let startY = 50;
    const groupEls = canvas.querySelectorAll('.mindmap-group');
    if (groupEls.length > 0) {
        let maxBottom = 0;
        groupEls.forEach(el => {
            const bottom = el.offsetTop + el.offsetHeight;
            if (bottom > maxBottom) maxBottom = bottom;
        });
        if (maxBottom > 0) {
            startY = maxBottom + 50;
        }
    }

    let x = 50;
    let y = startY;
    const yPadding = cardsCollapsed ? 50 : 340;
    
    unsortedCards.forEach(card => {
        card.style.left = x + 'px';
        card.style.top = y + 'px';
        canvas.appendChild(card);
        x += 220;
        if (x + 250 > canvas.clientWidth) {
            x = 50;
            y += yPadding;
        }
    });
}

// --- Character Bible Logic ---
function initCharacterBible() {
    const canvas = document.getElementById('character-bible-canvas');
    canvas.innerHTML = '';
    
    const groupContainers = renderGroups(canvas, 'character');
    const sortedChars = sortCards(scriptData.characters);
    const unsortedCards = [];
    
    sortedChars.forEach((char) => {
        const titleText = char.customTitle || char.name;
        const bodyHtml = char.customBody || `
            <div style="margin-bottom:8px"><strong>Scenes:</strong> ${char.scenes.length}</div>
            <div style="margin-bottom:8px"><strong>Dialogue Lines:</strong> ${char.dialogueCount}</div>
            ${char.intro ? `<div style="font-size:11px; font-style:italic; border-top:1px solid rgba(0,0,0,0.1); padding-top:5px">"${char.intro}"</div>` : ''}
        `;
        
        const card = createCard(titleText, bodyHtml, 0, 0, false, char.notes, 'character', char.name);
        card.classList.add('character-card');
        if (cardsCollapsed) card.classList.add('collapsed');
        
        if (char.groupId && groupContainers[char.groupId]) {
            card.classList.add('in-group');
            groupContainers[char.groupId].appendChild(card);
        } else {
            unsortedCards.push(card);
        }
    });

    let startY = 50;
    const groupEls = canvas.querySelectorAll('.mindmap-group');
    if (groupEls.length > 0) {
        let maxBottom = 0;
        groupEls.forEach(el => {
            const bottom = el.offsetTop + el.offsetHeight;
            if (bottom > maxBottom) maxBottom = bottom;
        });
        if (maxBottom > 0) {
            startY = maxBottom + 50;
        }
    }

    let x = 50;
    let y = startY;
    const yPadding = cardsCollapsed ? 50 : 280;
    
    unsortedCards.forEach(card => {
        card.style.left = x + 'px';
        card.style.top = y + 'px';
        canvas.appendChild(card);
        x += 220;
        if (x + 250 > canvas.clientWidth) {
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
    body.innerHTML = bodyText;
    if (editable) {
        body.contentEditable = "true";
        body.textContent = bodyText; // Fallback to raw text for editable cards
    }
    
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
        const ctxMenu = document.getElementById('card-context-menu');
        if (ctxMenu) {
            ctxMenu.style.display = 'block';
            ctxMenu.style.left = e.clientX + 'px';
            ctxMenu.style.top = e.clientY + 'px';
            
            window.activeContextMenuCard = card;
            window.activeContextMenuSyncType = syncType;
            window.activeContextMenuSyncId = syncId;
            
            const submenu = document.getElementById('group-submenu');
            if (submenu) {
                submenu.innerHTML = '';
                const groupsData = syncType === 'scene' ? scriptData.groups?.scenes : scriptData.groups?.characters;
                if (groupsData && groupsData.length > 0) {
                    groupsData.forEach(g => {
                        const item = document.createElement('div');
                        item.className = 'menu-item';
                        item.textContent = g.name;
                        item.addEventListener('click', (ev) => {
                            ev.stopPropagation();
                            ctxMenu.style.display = 'none';
                            if (window.pywebview) {
                                window.pywebview.api.assign_card_to_group(syncType, syncId, g.id);
                            }
                        });
                        submenu.appendChild(item);
                    });
                    
                    const remove = document.createElement('div');
                    remove.className = 'menu-item';
                    remove.style.color = '#ff6b6b';
                    remove.textContent = 'Remove from Group';
                    remove.addEventListener('click', (ev) => {
                        ev.stopPropagation();
                        ctxMenu.style.display = 'none';
                        if (window.pywebview) {
                            window.pywebview.api.assign_card_to_group(syncType, syncId, null);
                        }
                    });
                    submenu.appendChild(remove);
                } else {
                    const item = document.createElement('div');
                    item.className = 'menu-item';
                    item.textContent = 'No Groups Available';
                    item.style.color = '#888';
                    submenu.appendChild(item);
                }
            }
        }
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

// --- Context Menu Logic ---
document.addEventListener('click', (e) => {
    const ctxMenu = document.getElementById('card-context-menu');
    if (ctxMenu && !ctxMenu.contains(e.target)) {
        ctxMenu.style.display = 'none';
    }
});

document.getElementById('menu-open').addEventListener('click', () => {
    document.getElementById('card-context-menu').style.display = 'none';
    if (window.activeContextMenuCard) {
        const card = window.activeContextMenuCard;
        const title = card.querySelector('.card-title');
        const body = card.querySelector('.card-body');
        const notesEl = card.querySelector('.card-notes');
        openModal(title, body, notesEl, window.activeContextMenuSyncType, window.activeContextMenuSyncId);
    }
});

document.getElementById('menu-close').addEventListener('click', () => {
    document.getElementById('card-context-menu').style.display = 'none';
    if (window.activeContextMenuCard) {
        window.activeContextMenuCard.classList.add('collapsed');
    }
});

document.getElementById('menu-rescan').addEventListener('click', () => {
    document.getElementById('card-context-menu').style.display = 'none';
    if (window.activeContextMenuSyncType && window.activeContextMenuSyncId && window.pywebview) {
        window.pywebview.api.request_mindmap_rescan(window.activeContextMenuSyncType, window.activeContextMenuSyncId);
    }
});

document.getElementById('menu-edit').addEventListener('click', () => {
    document.getElementById('card-context-menu').style.display = 'none';
    if (window.activeContextMenuCard) {
        const card = window.activeContextMenuCard;
        const title = card.querySelector('.card-title');
        const body = card.querySelector('.card-body');
        
        title.contentEditable = "true";
        body.contentEditable = "true";
        
        // Visual indicator that it's editable
        title.style.outline = "2px dashed var(--accent)";
        body.style.outline = "2px dashed var(--accent)";
        title.focus();
        
        const triggerSave = () => {
            title.style.outline = "none";
            body.style.outline = "none";
            title.contentEditable = "false";
            body.contentEditable = "false";
            
            if (window.pywebview && window.activeContextMenuSyncType) {
                window.pywebview.api.update_mindmap_card_content(
                    window.activeContextMenuSyncType, 
                    window.activeContextMenuSyncId, 
                    title.innerHTML, 
                    body.innerHTML
                );
            }
        };
        
        // End editing if user clicks outside the card
        const finishEdit = (e) => {
            if (!card.contains(e.target) && e.target.id !== 'menu-edit') {
                triggerSave();
                document.removeEventListener('mousedown', finishEdit);
            }
        };
        
        setTimeout(() => {
            document.addEventListener('mousedown', finishEdit);
        }, 100);
    }
});
