let scriptData = { scenes: [], characters: [] };
let network = null;

window.addEventListener('pywebviewready', async () => {
    try {
        scriptData = await window.pywebview.api.get_mindmap_data();
        initCorkboard();
        initCharacterMap();
    } catch (e) {
        console.error("Failed to load mind map data", e);
    }
});

// Tab Switching
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        
        tab.classList.add('active');
        document.getElementById(tab.getAttribute('data-target')).classList.add('active');
        
        if (tab.getAttribute('data-target') === 'character-map' && network) {
            network.fit(); // Re-center graph when shown
        }
    });
});

// --- Corkboard Logic ---
function initCorkboard() {
    const canvas = document.getElementById('corkboard-canvas');
    canvas.innerHTML = '';
    
    let x = 50;
    let y = 50;
    const padding = 220;
    
    scriptData.scenes.forEach((scene, index) => {
        const card = createCard(scene.name, scene.characters.join(', ') || 'No characters detected.', x, y);
        canvas.appendChild(card);
        
        x += padding;
        if (x > window.innerWidth - 250) {
            x = 50;
            y += 150;
        }
    });
}

// --- Character Map Logic ---
function initCharacterMap() {
    if (!window.vis || !scriptData.characters || scriptData.characters.length === 0) return;
    
    const nodes = [];
    const edges = [];
    const edgeMap = {}; // track connections between characters

    scriptData.characters.forEach((char, i) => {
        nodes.push({ id: i, label: char, shape: 'dot', size: 20, color: '#0078D4', font: { color: 'white' } });
    });

    scriptData.scenes.forEach(scene => {
        for (let i = 0; i < scene.characters.length; i++) {
            for (let j = i + 1; j < scene.characters.length; j++) {
                const char1 = scriptData.characters.indexOf(scene.characters[i]);
                const char2 = scriptData.characters.indexOf(scene.characters[j]);
                
                if (char1 !== -1 && char2 !== -1) {
                    const edgeId = char1 < char2 ? `${char1}-${char2}` : `${char2}-${char1}`;
                    if (!edgeMap[edgeId]) {
                        edgeMap[edgeId] = 1;
                    } else {
                        edgeMap[edgeId]++;
                    }
                }
            }
        }
    });

    for (const [key, weight] of Object.entries(edgeMap)) {
        const [from, to] = key.split('-');
        edges.push({
            from: parseInt(from),
            to: parseInt(to),
            value: weight,
            color: { color: '#AAAAAA', highlight: '#FFFFFF' }
        });
    }

    const container = document.getElementById('network-canvas');
    const data = { nodes: new vis.DataSet(nodes), edges: new vis.DataSet(edges) };
    const options = {
        physics: {
            stabilization: true,
            barnesHut: { springLength: 200 }
        }
    };
    network = new vis.Network(container, data, options);
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

function createCard(titleText, bodyText, x, y, editable = false) {
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
    
    card.addEventListener('mousedown', dragStart);
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
