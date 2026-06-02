// Safeguard to prevent recursive property traversal of window.native by Windows Accessibility / UI Automation
try {
    if ('native' in window) {
        delete window.native;
    }
    const safeguardInterval = setInterval(() => {
        try {
            if ('native' in window && window.native !== null) {
                delete window.native;
            }
        } catch (e) { }
    }, 50);
    setTimeout(() => clearInterval(safeguardInterval), 5000);
} catch (e) { }

const editor = document.getElementById('editor');
const indicator = document.getElementById('line-type-indicator');
const syncDot = document.getElementById('syncDot');
const syncText = document.getElementById('syncText');

// State Machine Rules for Tab and Enter behavior
const workflowRules = {
    'scene-heading': { enter: 'action', tab: 'action' },
    'action': { enter: 'action', tab: 'character' },
    'character': { enter: 'dialogue', tab: 'transition' },
    'parenthetical': { enter: 'dialogue', tab: 'dialogue' },
    'dialogue': { enter: 'character', tab: 'action' },
    'transition': { enter: 'scene-heading', tab: 'scene-heading' },
    'shot': { enter: 'action', tab: 'action' },
    'dual': { enter: 'character', tab: 'character' },
    'page-break': { enter: 'scene-heading', tab: 'scene-heading' }
};

function insertPageBreak() {
    const p = getCurrentParagraph();
    if (!p) return;

    if (p.classList.contains('page-break')) {
        return; // Prevent nesting duplicate page breaks
    }

    const sel = window.getSelection();
    let textAfterCursor = "";

    if (sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        if (range.endOffset < p.textContent.length) {
            const endRange = range.cloneRange();
            endRange.selectNodeContents(p);
            endRange.setStart(range.endContainer, range.endOffset);
            textAfterCursor = endRange.toString();
            endRange.deleteContents();
        }
    }

    let pageBreakNode;
    if (p.textContent.replace(/\u200B/g, '').trim() === '') {
        setLineType('page-break', p);
        p.innerHTML = '&#8203;';
        pageBreakNode = p;
    } else {
        pageBreakNode = document.createElement('p');
        pageBreakNode.className = 'page-break';
        pageBreakNode.innerHTML = '&#8203;';
        p.parentNode.insertBefore(pageBreakNode, p.nextSibling);
    }

    const actionP = document.createElement('p');
    if (textAfterCursor.trim().length > 0) {
        actionP.className = p.className;
        actionP.textContent = textAfterCursor;
    } else {
        actionP.className = 'action';
        actionP.innerHTML = '&#8203;';
    }
    pageBreakNode.parentNode.insertBefore(actionP, pageBreakNode.nextSibling);

    const newRange = document.createRange();
    newRange.setStart(actionP, 0);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);

    actionP.focus();
    triggerBackup();
    updateStats();
}

// Helper tracking currently selected element
function getCurrentParagraph() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return null;
    let node = selection.getRangeAt(0).startContainer;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
    while (node && node.parentNode !== editor) {
        node = node.parentNode;
    }
    return node && node.tagName === 'P' ? node : null;
}

function getLineType(p) {
    if (!p) return 'action';
    const types = ['scene-heading', 'action', 'character', 'parenthetical', 'dialogue', 'transition', 'shot', 'dual', 'page-break', 'text', 'note'];
    for (let type of types) {
        if (p.classList.contains(type)) return type;
    }
    return 'action';
}

function setLineType(type, element = getCurrentParagraph()) {
    if (!element) return;
    element.className = '';
    element.classList.add(type);
    updateToolbarUI(type);
}

function updateToolbarUI(activeType) {
    indicator.textContent = `Current Element: ${activeType.replace('-', ' ').toUpperCase()}`;
    document.querySelectorAll('.tool-btn').forEach(btn => {
        if (btn.getAttribute('data-type') === activeType) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

// Prevents main formatting buttons from stealing focus from the editor!
document.querySelectorAll('.tool-btn[data-type]').forEach(btn => {
    btn.addEventListener('mousedown', e => e.preventDefault());
});

// Monitors context changes to match active styling buttons
document.addEventListener('selectionchange', () => {
    const p = getCurrentParagraph();
    if (p) {
        updateToolbarUI(getLineType(p));
        updateMiniToolbarState();
    }
    // Keep the scenes sidebar in sync with cursor position
    highlightCurrentSceneInSidebar();
});

// Translates keystrokes into saveable string formats (e.g., 'ctrl+shift+p')
function getHotkeyString(e) {
    let keys = [];
    if (e.ctrlKey) keys.push('ctrl');
    if (e.altKey) keys.push('alt');
    if (e.shiftKey) keys.push('shift');
    if (e.key !== 'Control' && e.key !== 'Alt' && e.key !== 'Shift') {
        keys.push(e.key.toLowerCase());
    }
    return keys.join('+');
}

const defaultHotkeys = {
    'scene-heading': 'ctrl+1',
    'action': 'ctrl+2',
    'character': 'ctrl+3',
    'parenthetical': 'ctrl+4',
    'dialogue': 'ctrl+5',
    'transition': 'ctrl+6',
    'shot': 'ctrl+7',
    'page-break': 'ctrl+enter',
    'bold': 'ctrl+b',
    'italic': 'ctrl+i',
    'underline': 'ctrl+u',
    'strikethrough': 'ctrl+alt+x',
    'toggle-case': 'ctrl+shift+u',
    'add-revision': 'ctrl+]',
    'remove-revision': 'ctrl+[',
    'undo': 'ctrl+z',
    'redo': 'ctrl+y',
    'cut': 'ctrl+x',
    'copy': 'ctrl+c',
    'paste': 'ctrl+v',
    'select-all': 'ctrl+a',
    'find-replace': 'ctrl+f',
    'print': 'ctrl+p',
    'open-project': 'ctrl+o',
    'save-project': 'ctrl+s',
    'manage-backups': 'ctrl+shift+s',
    'focus-mode': 'f11',
    'toggle-menu': 'ctrl+m'
};

// Intercepting and mapping keystrokes explicitly
editor.addEventListener('keydown', (e) => {
    const p = getCurrentParagraph();
    if (!p) return;

    const currentType = getLineType(p);
    const textContent = p.textContent.trim();

    // Handle Enter Key Behavior
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();

        const sel = window.getSelection();
        let textAfterCursor = "";

        if (sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            if (!range.isCollapsed) {
                range.deleteContents();
            }
            const endRange = range.cloneRange();
            endRange.selectNodeContents(p);
            endRange.setStart(range.endContainer, range.endOffset);
            textAfterCursor = endRange.toString();
            endRange.deleteContents();
        }

        if (p.textContent === '') {
            p.innerHTML = '&#8203;';
        }

        let nextType = workflowRules[currentType].enter;

        // Traditional Option Context Overrides
        if (currentType === 'action' && p.textContent.replace(/\u200B/g, '').trim() === '') {
            nextType = 'character';
        }

        const newP = document.createElement('p');
        newP.className = nextType;
        textAfterCursor = textAfterCursor.replace(/\u200B/g, '');
        if (textAfterCursor.length > 0) {
            newP.textContent = textAfterCursor;
        } else {
            newP.innerHTML = '&#8203;'; // Set zero-width space to hold layout cursor open safely
        }
        p.parentNode.insertBefore(newP, p.nextSibling);

        // Re-focus cursor down to new line
        const range = document.createRange();
        range.setStart(newP, 0);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);

        newP.focus();
        triggerBackup();
        updateStats();
        return;
    }

    // Handle Tab Key Cycling Mechanics
    if (e.key === 'Tab') {
        e.preventDefault();
        const nextType = workflowRules[currentType].tab;
        setLineType(nextType, p);
        return;
    }
});

// --- Auto-Capitalize Character Names in Action / Scene / Parenthetical Lines ---
// Builds a cached lookup of every character name in the document and uppercases
// any match found in action, scene-heading, or parenthetical paragraphs as you type.
// Fires only on word-boundary keystrokes (space, punctuation) to stay non-disruptive.

let _charNameCache = null;
let _charNameCacheDirty = true;

function invalidateCharNameCache() {
    _charNameCacheDirty = true;
}

function getCharNameTable() {
    if (!_charNameCacheDirty && _charNameCache) return _charNameCache;
    _charNameCache = new Set();
    editor.querySelectorAll('p.character').forEach(p => {
        // Strip extensions like (V.O.), (CONT'D), etc. to get the base name
        const raw = p.textContent.replace(/\u200B/g, '').replace(/\(.*?\)/g, '').trim();
        if (raw.length > 1) _charNameCache.add(raw.toUpperCase());
    });
    _charNameCacheDirty = false;
    return _charNameCache;
}

function autoCapCharNamesInParagraph(p) {
    const type = getLineType(p);
    if (!['action', 'scene-heading', 'parenthetical'].includes(type)) return;

    const names = getCharNameTable();
    // For parentheticals we still run even with no names (to apply lowercasing)
    if (names.size === 0 && type !== 'parenthetical') return;

    // Save cursor offset as a character count from the start of the paragraph
    const sel = window.getSelection();
    let cursorOffset = 0;
    if (sel.rangeCount) {
        const anchorNode = sel.getRangeAt(0).startContainer;
        if (p.contains(anchorNode)) {
            try {
                const preRange = document.createRange();
                preRange.setStart(p, 0);
                preRange.setEnd(anchorNode, sel.getRangeAt(0).startOffset);
                cursorOffset = preRange.toString().length;
            } catch (e) { }
        }
    }

    // Walk all text nodes: lowercase first (parentheticals only), then uppercase char names
    let changed = false;
    function processNode(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            let val = node.nodeValue;

            // Step 1 – parentheticals: lowercase everything first
            if (type === 'parenthetical') {
                const lowered = val.toLowerCase();
                if (lowered !== val) { val = lowered; changed = true; }
            }

            // Step 2 – re-uppercase any character name matches
            names.forEach(name => {
                const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                val = val.replace(new RegExp('\\b' + escaped + '\\b', 'gi'), match => {
                    if (match === name) return match; // Already correctly cased
                    changed = true;
                    return name;
                });
            });
            if (val !== node.nodeValue) node.nodeValue = val;
        } else {
            node.childNodes.forEach(processNode);
        }
    }
    processNode(p);

    // Restore cursor (only case was changed so the character offset is unchanged)
    if (changed) {
        let remaining = cursorOffset;
        const range = document.createRange();
        let restored = false;
        function restoreCursor(node) {
            if (restored) return;
            if (node.nodeType === Node.TEXT_NODE) {
                if (remaining <= node.nodeValue.length) {
                    range.setStart(node, remaining);
                    range.collapse(true);
                    restored = true;
                } else {
                    remaining -= node.nodeValue.length;
                }
            } else {
                node.childNodes.forEach(restoreCursor);
            }
        }
        restoreCursor(p);
        if (!restored) { range.selectNodeContents(p); range.collapse(false); }
        sel.removeAllRanges();
        sel.addRange(range);
    }
}

// Trigger on word-boundary keys so we never fight mid-word typing
editor.addEventListener('keyup', (e) => {
    const WORD_BOUNDARIES = [' ', ',', '.', '!', '?', ';', ':', '-', ')', ']', '"', "'"];
    if (!WORD_BOUNDARIES.includes(e.key)) return;

    const p = getCurrentParagraph();
    if (!p) return;

    // If the user is editing a character-name line, invalidate the cache so new
    // names are picked up on the very next word boundary in any other paragraph.
    if (getLineType(p) === 'character') {
        invalidateCharNameCache();
        return;
    }

    autoCapCharNamesInParagraph(p);
});

// Global Settings and Application State
let appSettings = {
    localDir: null,
    cloudDir: null,
    autoSaveInterval: 5,
    maxBackupLimit: 5,
    authorName: 'Writer',
    authorColor: '#ef4444',
    recentProjects: [],
    projectName: 'Untitled Project',
    currentProjectFile: null,
    sharedFolderLink: '',
    geminiApiKey: '',
    isRevisionMode: false,
    isFocusMode: false,
    showPageNumbers: false,
    showMenuBar: true,
    showFormatBtns: true,
    showWordCount: true,
    showColorCodes: false,
    showSceneNumbers: false,
    elementColors: {},
    filterDialogue: false,
    filterNonDialogue: false,
    darkMode: false,
    snapshots: [],
    projectDocuments: {
        'Default Document': '',
        'Revision Notes': '',
        'Title Page': ''
    },
    hotkeys: { ...defaultHotkeys }
};
let currentDocument = 'Default Document';

// Setup Support for Multiple Menu Dropdowns
document.querySelectorAll('.dropdown').forEach(menu => {
    menu.addEventListener('click', (e) => {
        document.querySelectorAll('.dropdown').forEach(m => {
            if (m !== menu) m.classList.remove('open');
        });
        menu.classList.toggle('open');
        e.stopPropagation();
    });
});
document.addEventListener('click', () => { document.querySelectorAll('.dropdown').forEach(m => m.classList.remove('open')); });

function updateHotkeyDisplay() {
    document.querySelectorAll('[data-hotkey-display]').forEach(el => {
        const action = el.getAttribute('data-hotkey-display');
        if (appSettings.hotkeys && appSettings.hotkeys[action]) {
            const parts = appSettings.hotkeys[action].split('+').map(p => p.charAt(0).toUpperCase() + p.slice(1));
            if (el.tagName === 'SPAN') {
                el.textContent = parts.join('-');
            } else if (el.hasAttribute('title')) {
                const baseTitle = el.getAttribute('title').split(' (')[0];
                el.setAttribute('title', `${baseTitle} (${parts.join('+')})`);
            }
        }
    });
}

// Core Initialization (Load via PyWebView or LocalStorage)
let isAppReady = false;

function initApp() {
    if (isAppReady) return;
    isAppReady = true;
    initializeEnvironment();
}

window.addEventListener('pywebviewready', async () => {
    // Dynamic version retrieval
    try {
        const verInfo = await window.pywebview.api.get_version_info();
        if (verInfo && verInfo.version) {
            const titleDisplay = document.getElementById('app-title-display');
            if (titleDisplay) {
                titleDisplay.textContent = `ReelScript ${verInfo.version}`;
            }
        }
    } catch (err) {
        console.error("Failed to load version info", err);
    }

    const loaded = await window.pywebview.api.load_settings();
    if (loaded && Object.keys(loaded).length > 0) {
        appSettings = { ...appSettings, ...loaded };
        if (appSettings.projectDocuments && appSettings.projectDocuments['Private Pad'] !== undefined) {
            appSettings.projectDocuments['Revision Notes'] = appSettings.projectDocuments['Private Pad'];
            delete appSettings.projectDocuments['Private Pad'];
        }
        if (!appSettings.hotkeys) appSettings.hotkeys = {};
        for (const [k, v] of Object.entries(defaultHotkeys)) {
            if (appSettings.hotkeys[k] === undefined) appSettings.hotkeys[k] = v;
        }
    }

    const initialFile = await window.pywebview.api.get_initial_file();
    if (initialFile && initialFile.data) {
        try {
            const parsed = JSON.parse(initialFile.data);
            if (parsed['Private Pad'] !== undefined) {
                parsed['Revision Notes'] = parsed['Private Pad'];
                delete parsed['Private Pad'];
            }
            appSettings.projectDocuments = parsed;
            currentDocument = Object.keys(parsed)[0] || 'Default Document';
            appSettings.currentProjectFile = initialFile.filepath;
            const filename = initialFile.filepath.split('\\').pop().split('/').pop().replace(/\.(rsp|ksp)$/i, '');
            updateProjectName(filename);
            addToRecent(initialFile.filepath);
            saveSettings();
        } catch (e) { alert("Invalid project file."); }
    } else if (initialFile && initialFile.error) { alert(initialFile.error); }

    // Check GitHub for updates on startup (runs in background, non-blocking)
    try {
        const check = await window.pywebview.api.check_for_github_updates();
        if (check && check.update_available) {
            const btnUpdate = document.getElementById('btn-update-now');
            if (btnUpdate) {
                btnUpdate.style.display = 'inline-block';
                btnUpdate.addEventListener('click', () => {
                    const msg = `ReelScript ${check.remote_version} is available!\n\n` +
                        `Your version: ${check.local_version}\n` +
                        `Latest version: ${check.remote_version}\n\n` +
                        `What's new:\n` + (check.changelog || []).map(c => `• ${c}`).join('\n') + `\n\n` +
                        `Visit GitHub to download the latest release?`;
                    if (confirm(msg)) {
                        if (window.pywebview) {
                            window.pywebview.api.open_url('https://github.com/XenoHead2/reelscript/releases');
                        } else {
                            window.open('https://github.com/XenoHead2/reelscript/releases', '_blank');
                        }
                    }
                });
            }
        }
    } catch (err) {
        console.error("Failed to check GitHub for updates", err);
    }

    initApp();
});

window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (!window.pywebview && !isAppReady) {
            const cache = localStorage.getItem('kindred_script_settings');
            if (cache) {
                appSettings = { ...appSettings, ...JSON.parse(cache) };
                if (appSettings.projectDocuments && appSettings.projectDocuments['Private Pad'] !== undefined) {
                    appSettings.projectDocuments['Revision Notes'] = appSettings.projectDocuments['Private Pad'];
                    delete appSettings.projectDocuments['Private Pad'];
                }
                if (!appSettings.hotkeys) appSettings.hotkeys = {};
                for (const [k, v] of Object.entries(defaultHotkeys)) {
                    if (appSettings.hotkeys[k] === undefined) appSettings.hotkeys[k] = v;
                }
            }
            const legacyBackup = localStorage.getItem('kindred_script_backup');
            if (legacyBackup && !appSettings.projectDocuments['Default Document']) {
                appSettings.projectDocuments['Default Document'] = legacyBackup;
            }
            initApp();
        }
    }, 750); // Give Python wrapper a moment to inject before falling back
});

function initializeEnvironment() {
    applySettingsToUI();
    loadCurrentDocument();
    rebuildDocumentSidebar();
    updateHotkeyDisplay();
}

function applySettingsToUI() {
    if (appSettings.cloudDir) {
        const cStatus = document.getElementById('cloud-dir-status');
        if (cStatus) {
            cStatus.textContent = `Saving to: ${appSettings.cloudDir}`;
            cStatus.style.color = '#10b981';
        }
    }
    if (appSettings.localDir) {
        const lStatus = document.getElementById('local-dir-status');
        if (lStatus) {
            lStatus.textContent = `Saving to: ${appSettings.localDir}`;
            lStatus.style.color = '#10b981';
        }
    }
    const intervalSelect = document.getElementById('auto-save-interval');
    if (intervalSelect && appSettings.autoSaveInterval !== undefined) {
        intervalSelect.value = appSettings.autoSaveInterval;
    }
    const maxBackupInput = document.getElementById('max-backup-limit');
    if (maxBackupInput && appSettings.maxBackupLimit !== undefined) {
        maxBackupInput.value = appSettings.maxBackupLimit;
    }
    startAutoSaveInterval();

    updateRecentProjectsUI();

    const projectNameDisplay = document.getElementById('project-name-display');
    if (projectNameDisplay) {
        projectNameDisplay.innerHTML = `⬅ &nbsp; ${appSettings.projectName || 'Untitled Project'}`;
    }

    const statusProjectName = document.getElementById('status-project-name');
    if (statusProjectName) {
        statusProjectName.textContent = appSettings.projectName || 'Untitled Project';
    }
    const revCheck = document.getElementById('rev-mode-check');
    if (revCheck) {
        revCheck.style.visibility = appSettings.isRevisionMode ? 'visible' : 'hidden';
    }
    const darkModeCheck = document.getElementById('dark-mode-check');
    if (darkModeCheck) {
        darkModeCheck.style.visibility = appSettings.darkMode ? 'visible' : 'hidden';
    }
    const focusModeCheck = document.getElementById('focus-mode-check');
    if (focusModeCheck) {
        focusModeCheck.style.visibility = appSettings.isFocusMode ? 'visible' : 'hidden';
    }
    const pageNumbersCheck = document.getElementById('page-numbers-check');
    if (pageNumbersCheck) {
        pageNumbersCheck.style.visibility = appSettings.showPageNumbers ? 'visible' : 'hidden';
    }
    const formatBtnsCheck = document.getElementById('format-btns-check');
    if (formatBtnsCheck) {
        formatBtnsCheck.style.visibility = appSettings.showFormatBtns ? 'visible' : 'hidden';
    }
    const wordCountCheck = document.getElementById('word-count-check');
    if (wordCountCheck) {
        wordCountCheck.style.visibility = appSettings.showWordCount ? 'visible' : 'hidden';
    }
    const colorCodesCheck = document.getElementById('color-codes-check');
    if (colorCodesCheck) {
        colorCodesCheck.style.visibility = appSettings.showColorCodes ? 'visible' : 'hidden';
    }
    document.body.classList.toggle('color-codes-active', appSettings.showColorCodes);

    const sceneNumbersCheck = document.getElementById('scene-numbers-check');
    if (sceneNumbersCheck) {
        sceneNumbersCheck.style.visibility = appSettings.showSceneNumbers ? 'visible' : 'hidden';
    }
    document.body.classList.toggle('show-scene-numbers', appSettings.showSceneNumbers);

    const colors = appSettings.elementColors || {};
    document.documentElement.style.setProperty('--color-scene', colors.scene || '');
    document.documentElement.style.setProperty('--color-action', colors.action || '');
    document.documentElement.style.setProperty('--color-character', colors.character || '');
    document.documentElement.style.setProperty('--color-parenthetical', colors.parenthetical || '');
    document.documentElement.style.setProperty('--color-dialogue', colors.dialogue || '');
    document.documentElement.style.setProperty('--color-transition', colors.transition || '');
    document.documentElement.style.setProperty('--color-shot', colors.shot || '');

    const filterDialogueCheck = document.getElementById('filter-dialogue-check');
    if (filterDialogueCheck) {
        filterDialogueCheck.style.visibility = appSettings.filterDialogue ? 'visible' : 'hidden';
    }
    const filterNonDialogueCheck = document.getElementById('filter-non-dialogue-check');
    if (filterNonDialogueCheck) {
        filterNonDialogueCheck.style.visibility = appSettings.filterNonDialogue ? 'visible' : 'hidden';
    }

    if (appSettings.darkMode) {
        document.body.classList.add('dark-mode');
    } else {
        document.body.classList.remove('dark-mode');
    }
    if (appSettings.isFocusMode) {
        document.body.classList.add('focus-mode');
    } else {
        document.body.classList.remove('focus-mode');
    }
    if (appSettings.showPageNumbers) {
        document.body.classList.add('show-page-numbers');
    } else {
        document.body.classList.remove('show-page-numbers');
    }

    document.body.classList.toggle('hide-menubar', !appSettings.showMenuBar);
    document.body.classList.toggle('hide-format-btns', !appSettings.showFormatBtns);
    document.body.classList.toggle('hide-word-count', !appSettings.showWordCount);

    document.body.classList.toggle('filter-dialogue', appSettings.filterDialogue);
    document.body.classList.toggle('filter-non-dialogue', appSettings.filterNonDialogue);
}

function updateProjectName(newName) {
    appSettings.projectName = newName;
    applySettingsToUI();
}

function addToRecent(filepath) {
    if (!appSettings.recentProjects) appSettings.recentProjects = [];
    
    // Remove if already exists so we can move it to the top
    const index = appSettings.recentProjects.indexOf(filepath);
    if (index > -1) {
        appSettings.recentProjects.splice(index, 1);
    }
    
    appSettings.recentProjects.unshift(filepath);
    
    if (appSettings.recentProjects.length > 10) {
        appSettings.recentProjects = appSettings.recentProjects.slice(0, 10);
    }
    
    updateRecentProjectsUI();
}

function updateRecentProjectsUI() {
    const list = document.getElementById('recent-projects-list');
    if (!list) return;
    list.innerHTML = '';
    
    if (!appSettings.recentProjects || appSettings.recentProjects.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'dropdown-item';
        empty.style.color = 'var(--text-muted)';
        empty.style.cursor = 'default';
        empty.innerHTML = '<span>No recent projects</span>';
        list.appendChild(empty);
        return;
    }
    
    appSettings.recentProjects.forEach(filepath => {
        let filename = filepath;
        if (filepath.includes('\\')) filename = filepath.split('\\').pop();
        else if (filepath.includes('/')) filename = filepath.split('/').pop();
        
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        item.title = filepath;
        item.innerHTML = `<span>${filename}</span>`;
        item.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (window.pywebview) {
                const result = await window.pywebview.api.open_recent_project(filepath);
                if (result && result.data) {
                    try {
                        const parsed = JSON.parse(result.data);
                        if (parsed['Private Pad'] !== undefined) {
                            parsed['Revision Notes'] = parsed['Private Pad'];
                            delete parsed['Private Pad'];
                        }
                        appSettings.projectDocuments = parsed;
                        currentDocument = Object.keys(parsed)[0] || 'Default Document';
                        appSettings.currentProjectFile = result.filepath;
                        const finalName = filename.replace(/\.(rsp|ksp)$/i, '');
                        updateProjectName(finalName);
                        saveSettings();
                        initializeEnvironment();
                        addToRecent(result.filepath);
                        document.querySelectorAll('.dropdown').forEach(d => d.classList.remove('open'));
                    } catch (err) { alert("Invalid project file."); }
                } else if (result && result.error) {
                    alert(result.error);
                }
            } else {
                alert("Native opening requires the Python app wrapper.");
            }
        });
        list.appendChild(item);
    });
}

function saveSettings() {
    if (window.pywebview) {
        window.pywebview.api.save_settings(appSettings);
    } else {
        localStorage.setItem('kindred_script_settings', JSON.stringify(appSettings));
    }
}

function loadCurrentDocument() {
    editor.innerHTML = appSettings.projectDocuments[currentDocument] || '<p class="action">&#8203;</p>';
    editor.setAttribute('data-docname', currentDocument);

    if (currentDocument === 'Title Page') {
        editor.classList.add('title-page-active');
    } else {
        editor.classList.remove('title-page-active');
    }

    updateToolbarUI(getLineType(getCurrentParagraph()));
    updateStats();
    if (typeof buildScenesList === 'function' && document.getElementById('sidebar-scenes-view') && document.getElementById('sidebar-scenes-view').style.display === 'flex') {
        buildScenesList();
    }
}

function saveCurrentDocument() {
    appSettings.projectDocuments[currentDocument] = editor.innerHTML;
    saveSettings();
}

const newProjectModal = document.getElementById('new-project-modal');
const newProjectNameInput = document.getElementById('new-project-name');
const newProjectLocalDirInput = document.getElementById('new-project-local-dir');
const newProjectCloudDirInput = document.getElementById('new-project-cloud-dir');

document.getElementById('file-menu-new').addEventListener('click', () => {
    if (confirm("Create a new project? Any unsaved changes will be lost.")) {
        newProjectNameInput.value = 'Untitled Project';
        newProjectLocalDirInput.value = appSettings.localDir || '';
        if (newProjectCloudDirInput) newProjectCloudDirInput.value = appSettings.cloudDir || '';
        newProjectModal.style.display = 'flex';
    }
});

document.getElementById('btn-cancel-new-project').addEventListener('click', () => {
    newProjectModal.style.display = 'none';
});

document.getElementById('btn-browse-new-local').addEventListener('click', async () => {
    if (window.pywebview) {
        const folderPath = await window.pywebview.api.choose_directory();
        if (folderPath && folderPath !== "None") {
            newProjectLocalDirInput.value = folderPath;
        }
    } else {
        alert("Folder picker requires running through the Python app wrapper.");
    }
});

const btnBrowseNewCloud = document.getElementById('btn-browse-new-cloud');
if (btnBrowseNewCloud) {
    btnBrowseNewCloud.addEventListener('click', async () => {
        if (window.pywebview) {
            const folderPath = await window.pywebview.api.choose_directory();
            if (folderPath && folderPath !== "None") {
                newProjectCloudDirInput.value = folderPath;
            }
        } else {
            alert("Folder picker requires running through the Python app wrapper.");
        }
    });
}

document.getElementById('btn-create-new-project').addEventListener('click', async () => {
    const newName = newProjectNameInput.value.trim() || 'Untitled Project';
    const newLocalDir = newProjectLocalDirInput.value.trim();
    const newCloudDir = newProjectCloudDirInput ? newProjectCloudDirInput.value.trim() : '';

    if (newLocalDir) {
        appSettings.localDir = newLocalDir;
    }
    if (newCloudDir) {
        appSettings.cloudDir = newCloudDir;
    }

    let cloudFolderPath = null;
    if (window.pywebview && appSettings.cloudDir) {
        const result = await window.pywebview.api.create_project_folder(appSettings.cloudDir, newName);
        if (result && result.success) {
            cloudFolderPath = result.path;
        } else if (result && result.error) {
            alert("Could not create cloud folder: " + result.error);
        }
    }

    appSettings.projectDocuments = { 'Default Document': '<p class="action">&#8203;</p>', 'Revision Notes': '', 'Title Page': '' };
    currentDocument = 'Default Document';
    updateProjectName(newName);

    if (window.pywebview) {
        const projectData = JSON.stringify(appSettings.projectDocuments);
        const safeName = newName.replace(/[\\/:*?"<>|]/g, '');
        let savedPath = null;

        if (cloudFolderPath) {
            savedPath = cloudFolderPath + '\\' + safeName + '.rsp';
            await window.pywebview.api.save_project(projectData, savedPath);
        } else if (newLocalDir) {
            savedPath = newLocalDir + '\\' + safeName + '.rsp';
            await window.pywebview.api.save_project(projectData, savedPath);
        }

        appSettings.currentProjectFile = savedPath;
        if (savedPath) addToRecent(savedPath);
    } else {
        appSettings.currentProjectFile = null;
    }

    saveSettings();
    initializeEnvironment();
    triggerBackup(); // Safely flushes the initialized state into the new folders

    newProjectModal.style.display = 'none';
});

async function handleOpenProject() {
    if (window.pywebview) {
        const result = await window.pywebview.api.open_project_dialog();
        if (result && result.data) {
            try {
                const parsed = JSON.parse(result.data);
                if (parsed['Private Pad'] !== undefined) {
                    parsed['Revision Notes'] = parsed['Private Pad'];
                    delete parsed['Private Pad'];
                }
                appSettings.projectDocuments = parsed;
                currentDocument = Object.keys(parsed)[0] || 'Default Document';
                appSettings.currentProjectFile = result.filepath;
                const filename = result.filepath.split('\\').pop().split('/').pop().replace(/\.(rsp|ksp)$/i, '');
                updateProjectName(filename);
                saveSettings();
                initializeEnvironment();
                addToRecent(result.filepath);
            } catch (e) { alert("Invalid project file."); }
        } else if (result && result.error) { alert(result.error); }
    } else { alert("Native opening requires the Python app wrapper."); }
}

document.getElementById('file-menu-open').addEventListener('click', handleOpenProject);

async function handleSave() {
    saveCurrentDocument();
    const projectData = JSON.stringify(appSettings.projectDocuments);

    if (window.pywebview) {
        if (appSettings.currentProjectFile) {
            // Already has a file, just overwrite it
            const result = await window.pywebview.api.save_project(projectData, appSettings.currentProjectFile);
            if (result && !result.startsWith("Error")) {
                alert("Project saved successfully!");
            } else if (result) {
                alert(result);
            }
        } else {
            // No file yet, trigger Save As behavior
            handleSaveAs();
        }
    } else {
        alert("Native saving requires the Python app wrapper.");
    }
}

async function handleSaveAs() {
    saveCurrentDocument();
    const projectData = JSON.stringify(appSettings.projectDocuments);
    const projectName = appSettings.projectName || "Untitled Project";

    if (window.pywebview) {
        const result = await window.pywebview.api.save_project_dialog(projectData, projectName);
        if (result && !result.startsWith("Error")) {
            appSettings.currentProjectFile = result;
            const filename = result.split('\\').pop().split('/').pop().replace(/\.(rsp|ksp)$/i, '');
            updateProjectName(filename);
            addToRecent(result);
            alert("Project saved as successfully!");
        } else if (result) {
            alert(result);
        }
    } else {
        alert("Native saving requires the Python app wrapper.");
    }
}

document.getElementById('file-menu-save').addEventListener('click', handleSave);
document.getElementById('file-menu-save-as').addEventListener('click', handleSaveAs);

document.getElementById('file-menu-close-tab')?.addEventListener('click', () => {
    const docNames = Object.keys(appSettings.projectDocuments);
    if (docNames.length <= 1) {
        alert("Cannot close the only remaining document.");
        return;
    }
    if (confirm(`Are you sure you want to close "${currentDocument}"?\n\nThis will permanently delete this document's text from the project.`)) {
        delete appSettings.projectDocuments[currentDocument];
        const remainingDocs = Object.keys(appSettings.projectDocuments);
        currentDocument = remainingDocs[0];
        saveSettings();
        rebuildDocumentSidebar();
        loadCurrentDocument();
    }
});

document.getElementById('file-menu-close-other-tabs')?.addEventListener('click', () => {
    const docNames = Object.keys(appSettings.projectDocuments);
    if (docNames.length <= 1) {
        alert("No other documents to close.");
        return;
    }
    if (confirm(`Are you sure you want to close all documents EXCEPT "${currentDocument}"?\n\nThis will permanently delete the text of all other documents.`)) {
        saveCurrentDocument(); // Ensure current text is saved
        const savedDocText = appSettings.projectDocuments[currentDocument];
        appSettings.projectDocuments = {};
        appSettings.projectDocuments[currentDocument] = savedDocText;
        saveSettings();
        rebuildDocumentSidebar();
    }
});

document.getElementById('file-menu-rename').addEventListener('click', () => {
    const currentName = appSettings.projectName || "Untitled Project";
    const newName = prompt("Rename Project:", currentName);
    if (newName) updateProjectName(newName);
});

document.getElementById('file-menu-duplicate').addEventListener('click', () => {
    appSettings.currentProjectFile = null;
    const currentName = appSettings.projectName || "Untitled Project";
    updateProjectName(currentName + " (Copy)");
    alert("Project duplicated in memory. Use 'Save Project' to write it to a new file.");
});

// Smart Cloud Auto-Save Trigger
let backupTimeout;
function triggerBackup() {
    syncDot.style.backgroundColor = '#f59e0b';
    syncText.textContent = 'Saving Changes...';
    clearTimeout(backupTimeout);
    backupTimeout = setTimeout(async () => {
        saveCurrentDocument(); // Update Memory & settings.json

        const updateTime = () => {
            const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            appSettings.lastBackupTime = now;
            const ts = document.getElementById('last-backup-timestamp');
            if (ts) ts.textContent = `Last backup: ${now}`;
            saveSettings();
        };

        if (window.pywebview) {
            window.pywebview.api.save_backup(
                editor.innerHTML,
                appSettings.cloudDir,
                appSettings.localDir,
                appSettings.projectName,
                appSettings.maxBackupLimit || 5
            ).then(response => {
                syncDot.style.backgroundColor = '#10b981';
                syncText.textContent = response;
                updateTime();
            });
        } else {
            syncDot.style.backgroundColor = '#10b981';
            syncText.textContent = 'Saved to Settings (Browser Mode)';
            updateTime();
        }
    }, 1200);
}

function autoPaginate() {
    if (currentDocument === 'Title Page') return;

    // Save active element, selection, and scroll offset to prevent visual jumping
    const workspace = document.querySelector('.workspace');
    const sel = window.getSelection();
    let savedRange = null;
    let activeNode = null;
    let activeNodeOffset = 0;

    if (sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
        savedRange = sel.getRangeAt(0).cloneRange();
        activeNode = getCurrentParagraph();
        if (activeNode && workspace) {
            activeNodeOffset = activeNode.getBoundingClientRect().top;
        }
    }

    const PPI = 96;
    const PAGE_HEIGHT = 11 * PPI;
    const BOTTOM_MARGIN = 1 * PPI;
    const TOP_MARGIN = 1 * PPI;

    const paragraphs = Array.from(editor.querySelectorAll('p'));

    // First pass: reset all custom top margins to calculate natural flow
    paragraphs.forEach(p => {
        if (!p.classList.contains('page-break')) {
            p.style.marginTop = '';
        }
    });

    let forceNextPage = false;

    for (let i = 0; i < paragraphs.length; i++) {
        let p = paragraphs[i];

        if (p.classList.contains('page-break')) {
            forceNextPage = true;
            continue;
        }

        let top = p.offsetTop;
        let height = p.offsetHeight;
        let bottom = top + height;

        let pageNum = Math.floor(top / PAGE_HEIGHT) + 1;
        let pageBottomLimit = (pageNum * PAGE_HEIGHT) - BOTTOM_MARGIN;

        if (forceNextPage || bottom > pageBottomLimit) {
            if (height > (PAGE_HEIGHT - TOP_MARGIN - BOTTOM_MARGIN) && !forceNextPage) {
                continue; // Ignore excessively long Action paragraphs that wouldn't fit on one page anyway
            }

            let targetNode = p;
            let type = getLineType(p);

            // Screenplay Widow/Orphan rules (keeps Characters grouped with their Dialogue)
            if (!forceNextPage) {
                if (type === 'dialogue') {
                    if (i > 0 && getLineType(paragraphs[i - 1]) === 'parenthetical') {
                        targetNode = paragraphs[i - 1];
                        if (i > 1 && getLineType(paragraphs[i - 2]) === 'character') {
                            targetNode = paragraphs[i - 2];
                        }
                    } else if (i > 0 && getLineType(paragraphs[i - 1]) === 'character') {
                        targetNode = paragraphs[i - 1];
                    }
                } else if (type === 'parenthetical') {
                    if (i > 0 && getLineType(paragraphs[i - 1]) === 'character') {
                        targetNode = paragraphs[i - 1];
                    }
                }
            }

            top = targetNode.offsetTop;
            pageNum = Math.floor(top / PAGE_HEIGHT) + 1;
            const nextPageTop = (pageNum * PAGE_HEIGHT) + TOP_MARGIN;
            const pushAmount = nextPageTop - top;

            const currentMarginTop = parseFloat(window.getComputedStyle(targetNode).marginTop) || 0;
            targetNode.style.marginTop = (currentMarginTop + pushAmount) + 'px';

            forceNextPage = false;
        }
    }

    // Restore selection and scroll position seamlessly
    if (savedRange) {
        sel.removeAllRanges();
        sel.addRange(savedRange);
    }

    if (activeNode && workspace) {
        const newOffset = activeNode.getBoundingClientRect().top;
        const diff = newOffset - activeNodeOffset;
        if (Math.abs(diff) > 0) {
            workspace.scrollTop += diff;
        }
    }
}

function updatePageNumbersDisplay(pages, pageHeightPixels) {
    const overlay = document.getElementById('page-numbers-overlay');
    if (!overlay) return;

    overlay.innerHTML = '';
    if (!appSettings.showPageNumbers) return;

    // Start numbering from page 2 (the first page of the Default Document, since page 1 is the Title Page)
    for (let i = 1; i <= pages; i++) {
        const num = document.createElement('div');
        num.className = 'editor-page-number';
        num.textContent = `${i + 1}.`;
        // 0.5 inches (48px) from the top edge of each simulated 11-inch page
        num.style.top = `${((i - 1) * pageHeightPixels) + 48}px`;
        overlay.appendChild(num);
    }
}

function updateStats() {
    // Get raw text, remove our zero-width cursor spacers, and split by whitespace
    let text = editor.innerText || "";
    text = text.replace(/\u200B/g, '').trim();
    const words = text ? text.split(/\s+/).filter(word => word.length > 0).length : 0;

    // A standard page is 11 inches. Assuming standard 96 CSS pixels per inch
    const pageHeightPixels = 11 * 96;
    let pages = Math.max(1, Math.ceil(editor.scrollHeight / pageHeightPixels));

    const statsEl = document.getElementById('status-stats');
    if (statsEl) statsEl.textContent = `${words} words | ${pages} page${pages !== 1 ? 's' : ''}`;

    updatePageNumbersDisplay(pages, pageHeightPixels);

    clearTimeout(window.paginateTimeout);
    window.paginateTimeout = setTimeout(() => {
        autoPaginate();
        pages = Math.max(1, Math.ceil(editor.scrollHeight / pageHeightPixels));
        if (statsEl) statsEl.textContent = `${words} words | ${pages} page${pages !== 1 ? 's' : ''}`;
        updatePageNumbersDisplay(pages, pageHeightPixels);
    }, 800);
}

let isAutoCapitalizing = false;

editor.addEventListener('input', () => {
    if (isAutoCapitalizing) return;

    const sel = window.getSelection();
    if (sel.isCollapsed && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const node = range.startContainer;

        if (node.nodeType === Node.TEXT_NODE) {
            const p = getCurrentParagraph();
            if (p) {
                const lineType = getLineType(p);
                // Only auto-capitalize Action and Dialogue lines (others are CSS uppercase by default)
                if (lineType === 'action' || lineType === 'dialogue') {
                    const startOffset = range.startOffset;
                    const textBefore = node.nodeValue.substring(0, startOffset);

                    // Match lowercase letters at the start of a paragraph or after punctuation + spaces
                    const match = textBefore.match(/(?:^|[\u200B.!?]\s+['"]?|\u200B['"]?)([a-z])$/);
                    if (match) {
                        const upperChar = match[1].toUpperCase();
                        isAutoCapitalizing = true;

                        const replaceRange = document.createRange();
                        replaceRange.setStart(node, startOffset - 1);
                        replaceRange.setEnd(node, startOffset);
                        sel.removeAllRanges();
                        sel.addRange(replaceRange);

                        document.execCommand('insertText', false, upperChar);
                        isAutoCapitalizing = false;
                    }
                }
            }
        }
    }

    if (appSettings.isRevisionMode && currentDocument !== 'Revision Notes') {
        const p = getCurrentParagraph();
        if (p && !p.classList.contains('page-break')) {
            p.classList.add('revision');
            p.style.setProperty('--rev-color', appSettings.authorColor || '#ef4444');
            p.setAttribute('data-author', appSettings.authorName || 'Writer');
            p.setAttribute('data-rev-color', appSettings.authorColor || '#ef4444');
        }
    }
    triggerBackup();
    updateStats();

    // Debounce scenes list update in background
    clearTimeout(window.scenesUpdateTimeout);
    window.scenesUpdateTimeout = setTimeout(() => {
        if (typeof buildScenesList === 'function' && document.getElementById('sidebar-scenes-view') && document.getElementById('sidebar-scenes-view').style.display === 'flex') {
            buildScenesList();
        }
    }, 2000);
});

const backupModal = document.getElementById('backup-modal');

let autoSaveTimer = null;
function startAutoSaveInterval() {
    clearInterval(autoSaveTimer);
    const minutes = parseInt(appSettings.autoSaveInterval, 10);
    if (!isNaN(minutes) && minutes > 0) {
        autoSaveTimer = setInterval(() => {
            triggerBackup();
        }, minutes * 60 * 1000);
    }
}

document.getElementById('auto-save-interval').addEventListener('change', (e) => {
    appSettings.autoSaveInterval = parseInt(e.target.value, 10);
    saveSettings();
    startAutoSaveInterval();
});

document.getElementById('max-backup-limit').addEventListener('change', (e) => {
    appSettings.maxBackupLimit = parseInt(e.target.value, 10) || 5;
    saveSettings();
});

document.getElementById('btn-select-cloud-dir').addEventListener('click', async () => {
    if (window.pywebview) {
        const folderPath = await window.pywebview.api.choose_directory();
        if (folderPath && folderPath !== "None") {
            appSettings.cloudDir = folderPath;
            applySettingsToUI();
            saveSettings();
            triggerBackup();
        }
    } else {
        alert("Folder picker requires running through the Python app wrapper.");
    }
});

document.getElementById('btn-select-local-dir').addEventListener('click', async () => {
    if (window.pywebview) {
        const folderPath = await window.pywebview.api.choose_directory();
        if (folderPath && folderPath !== "None") {
            appSettings.localDir = folderPath;
            applySettingsToUI();
            saveSettings();
            triggerBackup();
        }
    } else {
        alert("Folder picker requires running through the Python app wrapper.");
    }
});

document.getElementById('btn-external-backups').addEventListener('click', () => {
    backupModal.style.display = 'flex';
});
document.getElementById('file-menu-backups').addEventListener('click', () => {
    backupModal.style.display = 'flex';
});
document.getElementById('btn-close-modal').addEventListener('click', () => {
    backupModal.style.display = 'none';
});

const btnTriggerBackupNow = document.getElementById('btn-trigger-backup-now');
if (btnTriggerBackupNow) {
    btnTriggerBackupNow.addEventListener('click', () => {
        triggerBackup();
        btnTriggerBackupNow.textContent = 'Triggered!';
        setTimeout(() => btnTriggerBackupNow.textContent = 'Backup Now', 2000);
    });
}

// Hotkeys Modal Logic
const hotkeysModal = document.getElementById('hotkeys-modal');

document.getElementById('menu-edit-hotkeys').addEventListener('click', () => {
    document.querySelectorAll('.hotkey-input').forEach(input => {
        const action = input.getAttribute('data-action');
        if (appSettings.hotkeys && appSettings.hotkeys[action]) {
            input.value = appSettings.hotkeys[action];
        }
    });
    hotkeysModal.style.display = 'flex';
});

document.getElementById('btn-close-hotkeys').addEventListener('click', () => {
    hotkeysModal.style.display = 'none';
});

document.getElementById('btn-save-hotkeys').addEventListener('click', () => {
    document.querySelectorAll('.hotkey-input').forEach(input => {
        const action = input.getAttribute('data-action');
        appSettings.hotkeys[action] = input.value;
    });
    saveSettings();
    updateHotkeyDisplay();
    hotkeysModal.style.display = 'none';
});

document.querySelectorAll('.hotkey-input').forEach(input => {
    input.addEventListener('keydown', (e) => {
        e.preventDefault();
        const keyStr = getHotkeyString(e);
        if (keyStr !== 'ctrl' && keyStr !== 'alt' && keyStr !== 'shift') input.value = keyStr;
    });
});

// Author Profile Modal Logic
const authorProfileModal = document.getElementById('author-profile-modal');
const authorNameInput = document.getElementById('author-name-input');
const authorColorInput = document.getElementById('author-color-input');

document.getElementById('menu-author-profile').addEventListener('click', () => {
    authorNameInput.value = appSettings.authorName || 'Writer';
    authorColorInput.value = appSettings.authorColor || '#ef4444';
    authorProfileModal.style.display = 'flex';
});

document.getElementById('btn-close-author').addEventListener('click', () => {
    authorProfileModal.style.display = 'none';
});

document.getElementById('btn-save-author').addEventListener('click', () => {
    appSettings.authorName = authorNameInput.value.trim() || 'Writer';
    appSettings.authorColor = authorColorInput.value || '#ef4444';
    saveSettings();
    authorProfileModal.style.display = 'none';
});

// --- Format Colors Modal Logic ---
const formatColorsModal = document.getElementById('format-colors-modal');
document.getElementById('menu-format-colors').addEventListener('click', () => {
    const colors = appSettings.elementColors || {};
    // Default to the appropriate black/white depending on light/dark mode if no color is set
    const defHex = appSettings.darkMode ? '#e2e8f0' : '#111111';
    document.querySelectorAll('.format-color-picker').forEach(picker => {
        const el = picker.getAttribute('data-element');
        picker.value = colors[el] || defHex;
    });
    formatColorsModal.style.display = 'flex';
});

document.getElementById('btn-close-colors').addEventListener('click', () => {
    formatColorsModal.style.display = 'none';
});

document.getElementById('btn-save-colors').addEventListener('click', () => {
    if (!appSettings.elementColors) appSettings.elementColors = {};
    document.querySelectorAll('.format-color-picker').forEach(picker => {
        const el = picker.getAttribute('data-element');
        appSettings.elementColors[el] = picker.value;
    });
    saveSettings();
    applySettingsToUI();
    formatColorsModal.style.display = 'none';
});

document.getElementById('btn-reset-colors').addEventListener('click', () => {
    appSettings.elementColors = {};
    saveSettings();
    applySettingsToUI();
    formatColorsModal.style.display = 'none';
});

const docList = document.getElementById('project-documents-list');

function rebuildDocumentSidebar() {
    docList.innerHTML = '';
    Object.keys(appSettings.projectDocuments).forEach(docName => {
        const div = document.createElement('div');
        div.className = `sidebar-item ${docName === currentDocument ? 'active' : ''}`;
        div.dataset.docname = docName;
        div.innerHTML = `<span class="sidebar-icon">📄</span> ${docName}`;
        docList.appendChild(div);
    });

    const addBtn = document.createElement('div');
    addBtn.className = 'sidebar-item';
    addBtn.id = 'add-document-btn';
    addBtn.innerHTML = '<span class="sidebar-icon">➕</span> Add Page';
    docList.appendChild(addBtn);
}

docList.addEventListener('click', (e) => {
    const item = e.target.closest('.sidebar-item');
    if (!item) return;

    if (item.id === 'add-document-btn') {
        const name = prompt("Enter new page name:");
        if (name && !appSettings.projectDocuments[name]) {
            appSettings.projectDocuments[name] = '<p class="action">&#8203;</p>';
            saveSettings();
            rebuildDocumentSidebar();
        }
    } else if (item.dataset.docname) {
        saveCurrentDocument();
        currentDocument = item.dataset.docname;
        rebuildDocumentSidebar();
        loadCurrentDocument();
    }
});

// Universal Export Integration
function handleExport(format) {
    if (currentDocument === 'Revision Notes') {
        alert("Cannot export Revision Notes directly. Please switch to a script document before exporting.");
        return;
    }

    if (window.pywebview) {
        const lines = Array.from(editor.querySelectorAll('p')).map(p => {
            let type = getLineType(p);
            let text = p.textContent;
            if (['scene-heading', 'character', 'transition', 'shot'].includes(type)) {
                text = text.toUpperCase();
            }
            return {
                type: type,
                text: text,
                revision: p.classList.contains('revision'),
                revColor: p.getAttribute('data-rev-color') || '#ef4444'
            };
        });

        // Extract Title Page lines if content exists
        let titleLines = [];
        const titleHtml = appSettings.projectDocuments['Title Page'];
        if (titleHtml) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = titleHtml;
            titleLines = Array.from(tempDiv.querySelectorAll('p')).map(p => {
                let align = 'C';
                if (p.classList.contains('align-left')) align = 'L';
                if (p.classList.contains('align-right')) align = 'R';

                return {
                    type: getLineType(p),
                    text: p.textContent,
                    align: align,
                    revision: p.classList.contains('revision'),
                    revColor: p.getAttribute('data-rev-color') || '#ef4444'
                };
            });
        }

        syncDot.style.backgroundColor = '#f59e0b';
        syncText.textContent = `Generating ${format.toUpperCase()}...`;
        const projectName = appSettings.projectName || "Untitled Project";

        // Pass export options including the title page to the Python backend
        const exportConfig = {
            titleLines: titleLines,
            showPageNumbers: appSettings.showPageNumbers,
            startPageNumber: 2
        };

        let apiCall;
        if (format === 'pdf') apiCall = window.pywebview.api.export_pdf(lines, projectName, exportConfig);
        else if (format === 'fdx') apiCall = window.pywebview.api.export_fdx(lines, projectName, exportConfig);
        else if (format === 'fountain') apiCall = window.pywebview.api.export_writersduet(lines, projectName, exportConfig);

        apiCall.then(response => {
            if (response.includes('Error') || response.includes('Missing')) {
                syncDot.style.backgroundColor = '#ef4444';
                alert(response);
            } else {
                syncDot.style.backgroundColor = '#10b981';
            }
            syncText.textContent = response;
        });
    } else {
        alert("Export requires running the Python app wrapper (reelscript.pyw).");
    }
}
document.getElementById('export-pdf-sidebar-btn').addEventListener('click', () => handleExport('pdf'));
document.getElementById('file-menu-export-pdf').addEventListener('click', () => handleExport('pdf'));
document.getElementById('file-menu-export-fdx').addEventListener('click', () => handleExport('fdx'));
document.getElementById('file-menu-export-wd').addEventListener('click', () => handleExport('fountain'));

// Print Integration
document.getElementById('file-menu-print').addEventListener('click', () => {
    window.print();
});

// MASTER GLOBAL HOTKEY INTERCEPTOR (CAPTURE PHASE)
document.addEventListener('keydown', async (e) => {
    if (e.key === 'Escape' && appSettings.isFocusMode) {
        e.preventDefault();
        toggleFocusMode();
        return;
    }

    // Do not interfere if user is currently binding keys in the Hotkey Window
    const hModal = document.getElementById('hotkeys-modal');
    if (hModal && hModal.style.display === 'flex') return;

    const hotkeyStr = getHotkeyString(e);
    if (!hotkeyStr || hotkeyStr === 'ctrl' || hotkeyStr === 'alt' || hotkeyStr === 'shift') return;

    let matchedAction = null;
    for (const [action, keyCombo] of Object.entries(appSettings.hotkeys || {})) {
        if (hotkeyStr === keyCombo && keyCombo !== '') {
            matchedAction = action;
            break;
        }
    }

    if (matchedAction) {
        e.preventDefault();
        e.stopPropagation();

        const p = getCurrentParagraph();
        const lineTypes = ['scene-heading', 'action', 'character', 'parenthetical', 'dialogue', 'transition', 'shot'];

        if (lineTypes.includes(matchedAction)) {
            if (p) setLineType(matchedAction, p);
        } else {
            switch (matchedAction) {
                case 'page-break': if (p) insertPageBreak(); break;
                case 'bold': document.execCommand('bold'); updateMiniToolbarState(); break;
                case 'italic': document.execCommand('italic'); updateMiniToolbarState(); break;
                case 'underline': document.execCommand('underline'); updateMiniToolbarState(); break;
                case 'strikethrough': document.execCommand('strikeThrough'); break;
                case 'toggle-case': toggleCase(); break;
                case 'undo': document.execCommand('undo'); triggerBackup(); updateStats(); break;
                case 'redo': document.execCommand('redo'); triggerBackup(); updateStats(); break;
                case 'cut': document.execCommand('cut'); triggerBackup(); updateStats(); break;
                case 'copy': document.execCommand('copy'); break;
                case 'paste':
                    try {
                        let text = await navigator.clipboard.readText();
                        text = text.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
                        if (text.includes('\n')) {
                            const html = processImportedText(text, true);
                            document.execCommand('insertHTML', false, html);
                        } else {
                            document.execCommand('insertText', false, text);
                        }
                        triggerBackup(); updateStats();
                    } catch (err) { document.execCommand('paste'); }
                    break;
                case 'select-all': document.execCommand('selectAll'); break;
                case 'add-revision':
                    if (p && currentDocument !== 'Revision Notes') {
                        p.classList.add('revision');
                        p.style.setProperty('--rev-color', appSettings.authorColor || '#ef4444');
                        p.setAttribute('data-author', appSettings.authorName || 'Writer');
                        p.setAttribute('data-rev-color', appSettings.authorColor || '#ef4444');
                        triggerBackup();
                    }
                    break;
                case 'remove-revision':
                    if (p) {
                        p.classList.remove('revision');
                        p.style.removeProperty('--rev-color');
                        p.removeAttribute('data-author');
                        p.removeAttribute('data-rev-color');
                        triggerBackup();
                    }
                    break;
                case 'find-replace': openFindReplace(); break;
                case 'print': window.print(); break;
                case 'open-project': handleOpenProject(); break;
                case 'save-project': handleSave(); break;
                case 'manage-backups': backupModal.style.display = 'flex'; break;
                case 'focus-mode': toggleFocusMode(); break;
                case 'toggle-menu': toggleMenuBar(); break;
            }
        }
    }
}, true); // Fire during capture-phase so we catch shortcuts before the editor eats them!

// File Import Handling
async function handleImport() {
    if (window.pywebview) {
        const fileInfo = await window.pywebview.api.open_file_dialog();
        if (!fileInfo) return;
        if (fileInfo.error) {
            alert("Error reading file: " + fileInfo.error);
            return;
        }

        // Decode base64 file data securely from Python
        const byteCharacters = atob(fileInfo.data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const ext = fileInfo.ext;

        if (ext === 'pdf') {
            const pdf = await pdfjsLib.getDocument(byteArray).promise;
            let titlePageText = "";
            let fullText = "";
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const content = await page.getTextContent();
                let lastY = -1;
                let pageText = '';
                for (let item of content.items) {
                    if (lastY !== -1) {
                        const yDiff = Math.abs(lastY - item.transform[5]);
                        if (yDiff > 16) { // Detect standard double-space breaks
                            pageText += '\n\n';
                        } else if (yDiff > 4) {
                            pageText += '\n';
                        }
                    }
                    if (lastY === -1 || Math.abs(lastY - item.transform[5]) > 4) {
                        const spaces = Math.max(0, Math.floor(item.transform[4] / 6));
                        pageText += ' '.repeat(spaces);
                    }
                    pageText += item.str;
                    lastY = item.transform[5];
                }
                if (i === 1 && pdf.numPages > 1) {
                    titlePageText = pageText;
                } else {
                    fullText += pageText + (i < pdf.numPages ? "\n\n" : "");
                }
            }
            if (titlePageText) {
                appSettings.projectDocuments['Title Page'] = processImportedText(titlePageText, true);
                appSettings.projectDocuments['Default Document'] = processImportedText(fullText, true);
                currentDocument = 'Default Document';
                saveSettings();
                rebuildDocumentSidebar();
                loadCurrentDocument();
            } else {
                processImportedText(fullText);
            }
        } else {
            const text = new TextDecoder().decode(byteArray);
            const sanitizedText = text.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
            ext === 'html' ? (editor.innerHTML = sanitizedText, triggerBackup()) : processImportedText(sanitizedText);
        }
    } else {
        document.getElementById('file-import').click();
    }
}
document.getElementById('import-btn').addEventListener('click', handleImport);
document.getElementById('file-menu-import').addEventListener('click', handleImport);

// Configure PDF.js worker for background parsing
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

function processImportedText(content, returnHtmlOnly = false) {
    // Normalize smart quotes (slanted apostrophes/quotes) to standard straight quotes
    content = content.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');

    const lines = content.split(/\r?\n/);
    const targetElement = returnHtmlOnly ? document.createElement('div') : editor;
    if (!returnHtmlOnly) targetElement.innerHTML = '';

    let previousType = '';
    let previousSpaces = 0;
    let blankLineBefore = false;

    for (let i = 0; i < lines.length; i++) {
        const rawLine = lines[i];
        const trimmed = rawLine.trim();

        // Register empty space to map element associations, but let CSS handle physical margins
        if (!trimmed) {
            blankLineBefore = true;
            continue;
        }

        // Skip literal 'SCENE x' lines entirely on import
        if (/^SCENE\b/i.test(trimmed)) {
            continue;
        }

        // Skip standalone page numbers (e.g. "1.", "2.", "45", "- 2 -", "Page 2")
        if (/^\d+\s*\.?$/.test(trimmed) || /^-\s*\d+\s*-$/.test(trimmed) || /^page\s*\d+\.?$/i.test(trimmed)) {
            continue;
        }

        // Skip redundant page breaks
        if (trimmed.startsWith('===')) {
            continue;
        }

        let type = 'action';
        let isAllCaps = (trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed));
        const leadingSpaces = rawLine.length - rawLine.trimStart().length;

        // Fountain-style Heuristic Ruleset
        if (/^(INT\.|EXT\.|INT\/EXT\.|I\/E\.|INT |EXT )/i.test(trimmed)) {
            type = 'scene-heading';
        } else if (isAllCaps && (trimmed.endsWith(' TO:') || trimmed === 'FADE IN:' || trimmed === 'FADE OUT.')) {
            type = 'transition';
        } else if (isAllCaps && (leadingSpaces > 10 || blankLineBefore) && trimmed.length < 45 && !trimmed.startsWith('(') && previousType !== 'character') {
            type = 'character';
        } else if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
            type = 'parenthetical';
        } else if (previousType === 'character' || previousType === 'parenthetical') {
            type = 'dialogue';
        } else if (previousType === 'dialogue' && !blankLineBefore) {
            // If the indent suddenly decreases back to the left, it's an action line that missed a blank line
            if (leadingSpaces < previousSpaces - 5) {
                type = 'action';
            } else {
                type = 'dialogue';
            }
        }

        if (!blankLineBefore && type === previousType && (type === 'action' || type === 'dialogue')) {
            const lastNode = targetElement.lastChild;
            if (lastNode && lastNode.className === type) {
                lastNode.textContent += ' ' + trimmed;
                continue;
            }
        }

        const p = document.createElement('p');
        p.className = type; p.textContent = trimmed;
        targetElement.appendChild(p);

        previousType = type;
        previousSpaces = leadingSpaces;
        blankLineBefore = false;
    }

    if (targetElement.innerHTML === '') {
        const p = document.createElement('p');
        p.className = 'action';
        p.innerHTML = '&#8203;';
        targetElement.appendChild(p);
    }

    if (returnHtmlOnly) {
        return targetElement.innerHTML;
    }

    triggerBackup();
    updateStats();
}

document.getElementById('file-import').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const ext = file.name.split('.').pop().toLowerCase();

    if (ext === 'pdf') {
        const reader = new FileReader();
        reader.onload = async function () {
            const typedarray = new Uint8Array(this.result);
            const pdf = await pdfjsLib.getDocument(typedarray).promise;
            let titlePageText = "";
            let fullText = "";
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const content = await page.getTextContent();

                let lastY = -1;
                let pageText = '';

                // Map X/Y coordinate positions into visual formatting approximations
                for (let item of content.items) {
                    if (lastY !== -1) {
                        const yDiff = Math.abs(lastY - item.transform[5]);
                        if (yDiff > 16) { // Detect standard double-space breaks
                            pageText += '\n\n';
                        } else if (yDiff > 4) {
                            pageText += '\n';
                        }
                    }
                    if (lastY === -1 || Math.abs(lastY - item.transform[5]) > 4) {
                        const spaces = Math.max(0, Math.floor(item.transform[4] / 6));
                        pageText += ' '.repeat(spaces);
                    }
                    pageText += item.str;
                    lastY = item.transform[5];
                }
                if (i === 1 && pdf.numPages > 1) {
                    titlePageText = pageText;
                } else {
                    fullText += pageText + (i < pdf.numPages ? "\n\n" : "");
                }
            }
            if (titlePageText) {
                appSettings.projectDocuments['Title Page'] = processImportedText(titlePageText, true);
                appSettings.projectDocuments['Default Document'] = processImportedText(fullText, true);
                currentDocument = 'Default Document';
                saveSettings();
                rebuildDocumentSidebar();
                loadCurrentDocument();
            } else {
                processImportedText(fullText);
            }
        };
        reader.readAsArrayBuffer(file);
    } else {
        const reader = new FileReader();
        reader.onload = (event) => {
            const sanitizedText = event.target.result.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
            if (ext === 'html') {
                editor.innerHTML = sanitizedText;
                triggerBackup();
            } else {
                processImportedText(sanitizedText);
            }
        };
        reader.readAsText(file);
    }
});

// --- Custom Context Menu Implementation ---
const contextMenu = document.getElementById('context-menu');
const spellContainer = document.getElementById('spell-suggestions-container');

function getWordUnderCursor(x, y) {
    let range;
    if (document.caretRangeFromPoint) {
        range = document.caretRangeFromPoint(x, y);
    } else if (document.caretPositionFromPoint) {
        const pos = document.caretPositionFromPoint(x, y);
        if (pos) {
            range = document.createRange();
            range.setStart(pos.offsetNode, pos.offset);
            range.collapse(true);
        }
    }

    if (range && range.startContainer.nodeType === Node.TEXT_NODE) {
        const text = range.startContainer.textContent;
        let start = range.startOffset;
        let end = range.startOffset;

        while (start > 0 && /[\w']/.test(text[start - 1])) start--;
        while (end < text.length && /[\w']/.test(text[end])) end++;

        if (start < end) {
            const word = text.slice(start, end);
            return { word, node: range.startContainer, start, end };
        }
    }
    return null;
}

editor.addEventListener('contextmenu', async (e) => {
    e.preventDefault(); // Suppress the default browser right-click menu

    let wordObj = null;
    const sel = window.getSelection();
    let insideSelection = false;

    if (!sel.isCollapsed && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const rects = range.getClientRects();
        for (let r of rects) {
            if (e.clientX >= r.left && e.clientX <= r.right &&
                e.clientY >= r.top && e.clientY <= r.bottom) {
                insideSelection = true;
                break;
            }
        }
    }

    if (!insideSelection) {
        wordObj = getWordUnderCursor(e.clientX, e.clientY);
    }

    let targetNode = e.target;
    if (targetNode.nodeType === Node.TEXT_NODE) targetNode = targetNode.parentNode;
    const revisionNode = targetNode.closest ? targetNode.closest('.revision') : null;

    const revContainer = document.getElementById('revision-menu-container');
    if (revContainer) {
        if (revisionNode) {
            revContainer.style.display = 'block';
            revContainer.targetNode = revisionNode;
        } else {
            revContainer.style.display = 'none';
            revContainer.targetNode = null;
        }
    }

    if (spellContainer) {
        spellContainer.style.display = 'none';
        spellContainer.innerHTML = '';

        if (wordObj && window.pywebview) {
            const result = await window.pywebview.api.get_spell_suggestions(wordObj.word);
            spellContainer.style.display = 'block';

            if (result && result.error) {
                const item = document.createElement('div');
                item.className = 'context-menu-item';
                item.style.color = '#f59e0b';
                item.textContent = result.error;
                spellContainer.appendChild(item);
            } else if (result && result.misspelled) {
                if (result.suggestions && result.suggestions.length > 0) {
                    result.suggestions.forEach(sugg => {
                        const item = document.createElement('div');
                        item.className = 'context-menu-item';
                        item.style.fontWeight = 'bold';
                        item.textContent = sugg;
                        item.onmousedown = (ev) => {
                            ev.preventDefault();
                            const selRange = document.createRange();
                            selRange.setStart(wordObj.node, wordObj.start);
                            selRange.setEnd(wordObj.node, wordObj.end);
                            const sel = window.getSelection();
                            sel.removeAllRanges();
                            sel.addRange(selRange);

                            document.execCommand('insertText', false, sugg);
                            contextMenu.style.display = 'none';
                            triggerBackup(); updateStats();
                        };
                        spellContainer.appendChild(item);
                    });
                } else {
                    const item = document.createElement('div');
                    item.className = 'context-menu-item';
                    item.style.color = 'var(--text-muted)';
                    item.textContent = '(No spelling suggestions)';
                    spellContainer.appendChild(item);
                }
            }

            // Always allow adding the hovered word to the dictionary, even if spelled correctly
            const addDictBtn = document.createElement('div');
            addDictBtn.className = 'context-menu-item';
            addDictBtn.style.fontStyle = 'italic';
            addDictBtn.textContent = `Add "${wordObj.word}" to dictionary`;
            addDictBtn.onmousedown = async (ev) => {
                ev.preventDefault();
                await window.pywebview.api.add_to_dictionary(wordObj.word);
                contextMenu.style.display = 'none';

                if (wordObj && wordObj.node) {
                    const selRange = document.createRange();
                    selRange.setStart(wordObj.node, wordObj.start);
                    selRange.setEnd(wordObj.node, wordObj.end);
                    const sel = window.getSelection();
                    sel.removeAllRanges();
                    sel.addRange(selRange);

                    // Wrap the word to instantly remove the browser's native red squiggly line
                    document.execCommand('insertHTML', false, `<span spellcheck="false">${wordObj.word}</span>`);
                    triggerBackup();
                    updateStats();
                }

                syncDot.style.backgroundColor = '#10b981';
                syncText.textContent = `Added "${wordObj.word}" to dictionary`;
            };
            spellContainer.appendChild(addDictBtn);

            const divider = document.createElement('div');
            divider.className = 'dropdown-divider';
            spellContainer.appendChild(divider);
        }
    }

    contextMenu.style.display = 'block';

    // Prevent the menu from clipping off the edges of the screen
    let x = e.clientX;
    let y = e.clientY;
    if (x + contextMenu.offsetWidth > window.innerWidth) x = window.innerWidth - contextMenu.offsetWidth;
    if (y + contextMenu.offsetHeight > window.innerHeight) y = window.innerHeight - contextMenu.offsetHeight;

    contextMenu.style.top = `${y}px`;
    contextMenu.style.left = `${x}px`;
});

// --- AI Suggestion Draggable Popup Logic ---
// 1. Create the modal dynamically
const aiSuggModal = document.createElement('div');
aiSuggModal.id = 'ai-suggestion-modal';
aiSuggModal.innerHTML = `
    <div id="ai-suggestion-header">
        <span>💡 AI Suggestions</span>
        <div>
            <button id="btn-copy-ai-suggestion" title="Copy to clipboard" style="margin-right: 8px;">📋</button>
            <button id="btn-close-ai-suggestion">&times;</button>
        </div>
    </div>
    <div id="ai-suggestion-content">Loading suggestions...</div>
`;
document.body.appendChild(aiSuggModal);

const aiSuggHeader = document.getElementById('ai-suggestion-header');
const aiSuggContent = document.getElementById('ai-suggestion-content');
const closeAiSuggBtn = document.getElementById('btn-close-ai-suggestion');
const copyAiSuggBtn = document.getElementById('btn-copy-ai-suggestion');

closeAiSuggBtn.addEventListener('click', () => aiSuggModal.style.display = 'none');

copyAiSuggBtn.addEventListener('click', async () => {
    try {
        // Use innerText to grab the visible text and preserve line breaks
        await navigator.clipboard.writeText(aiSuggContent.innerText);
        copyAiSuggBtn.textContent = '✅';
        setTimeout(() => copyAiSuggBtn.textContent = '📋', 2000);
    } catch (err) {
        console.error("Failed to copy!", err);
    }
});

// Make the modal draggable
let isAiSuggDragging = false;
let aiSuggOffsetX = 0, aiSuggOffsetY = 0;

aiSuggHeader.addEventListener('mousedown', (e) => {
    isAiSuggDragging = true;
    const rect = aiSuggModal.getBoundingClientRect();
    aiSuggOffsetX = e.clientX - rect.left;
    aiSuggOffsetY = e.clientY - rect.top;
    aiSuggModal.style.transform = 'none'; // Clear center transform for absolute positioning
});
document.addEventListener('mousemove', (e) => {
    if (isAiSuggDragging) {
        aiSuggModal.style.left = (e.clientX - aiSuggOffsetX) + 'px';
        aiSuggModal.style.top = (e.clientY - aiSuggOffsetY) + 'px';
    }
});
document.addEventListener('mouseup', () => {
    if (isAiSuggDragging) {
        isAiSuggDragging = false;
        // Save the coordinates so it remembers where you left it
        if (!appSettings.aiSuggPos) appSettings.aiSuggPos = {};
        appSettings.aiSuggPos.left = aiSuggModal.style.left;
        appSettings.aiSuggPos.top = aiSuggModal.style.top;
        saveSettings();
    }
});

let currentSuggestionRange = null;

function openAiSuggestionModal(selectedText) {
    aiSuggModal.style.display = 'flex';
    if (appSettings.aiSuggPos && appSettings.aiSuggPos.left) {
        aiSuggModal.style.transform = 'none';
        aiSuggModal.style.left = appSettings.aiSuggPos.left;
        aiSuggModal.style.top = appSettings.aiSuggPos.top;
    }
    aiSuggContent.innerHTML = "<em>Analyzing text and generating suggestions...</em>";
    if (window.pywebview) {
        window.pywebview.api.get_ai_suggestions(selectedText).then(suggestions => {
            if (!suggestions || suggestions.startsWith("Error")) {
                aiSuggContent.innerHTML = suggestions || "No suggestions available.";
                return;
            }

            aiSuggContent.innerHTML = '';

            // Split by the new delimiter, fallback to double-newlines if AI forgets the rule
            let parts = suggestions.split('|||').map(s => s.trim()).filter(s => s.length > 0);
            if (parts.length === 1 && !suggestions.includes('|||')) {
                parts = suggestions.split(/\n\n+/).map(s => s.trim()).filter(s => s.length > 0);
            }

            parts.forEach((part, index) => {
                const div = document.createElement('div');
                div.style.marginBottom = '15px';
                div.style.paddingBottom = '15px';
                if (index < parts.length - 1) div.style.borderBottom = '1px solid #36424e';

                // Clean up any AI numbering (e.g. "1. ", "Option 1: ")
                const cleanText = part.replace(/^(\*?\*?Option\s*\d+:?\*?\*?|\d+\.)\s*/i, '').trim();

                const textSpan = document.createElement('span');
                textSpan.innerHTML = cleanText.replace(/\n/g, '<br>');
                textSpan.style.display = 'block';
                textSpan.style.marginBottom = '10px';

                const applyBtn = document.createElement('button');
                applyBtn.className = 'modal-btn';
                applyBtn.style.padding = '4px 8px';
                applyBtn.style.fontSize = '11px';
                applyBtn.style.backgroundColor = '#1b8adb';
                applyBtn.textContent = '✨ Apply this suggestion';

                applyBtn.addEventListener('click', () => applyAiSuggestion(cleanText));

                div.appendChild(textSpan);
                div.appendChild(applyBtn);
                aiSuggContent.appendChild(div);
            });
        });
    } else { aiSuggContent.innerHTML = "<em>Python backend is required for AI features.</em>"; }
}

// 2. Inject "Suggestion" button into the main formatting toolbar
const formatToolbar = document.querySelector('.format-toolbar');
if (formatToolbar) {
    const suggBtn = document.createElement('button');
    suggBtn.className = 'tool-btn';
    suggBtn.id = 'btn-top-ai-suggestion';
    suggBtn.innerHTML = `<span class="tool-icon">💡</span><span class="tool-label">Suggest</span>`;
    formatToolbar.appendChild(suggBtn);

    suggBtn.addEventListener('click', async () => {
        const sel = window.getSelection();
        if (sel.isCollapsed || !editor.contains(sel.anchorNode)) {
            alert("Please highlight some text in the editor to get suggestions.");
            return;
        }
        if (sel.rangeCount > 0) {
            currentSuggestionRange = sel.getRangeAt(0).cloneRange();
        }

        openAiSuggestionModal(sel.toString().trim());
    });

    // Inject "Analyze Scene" button next to it
    const analyzeSceneBtn = document.createElement('button');
    analyzeSceneBtn.className = 'tool-btn';
    analyzeSceneBtn.id = 'btn-top-ai-analyze-scene';
    analyzeSceneBtn.innerHTML = `<span class="tool-icon">🎬</span><span class="tool-label">Scene AI</span>`;
    formatToolbar.appendChild(analyzeSceneBtn);

    analyzeSceneBtn.addEventListener('click', async () => {
        if (!window.pywebview) {
            alert("AI Analysis requires running through the Python app wrapper.");
            return;
        }
        syncDot.style.backgroundColor = '#f59e0b';
        syncText.textContent = "Analyzing scene with AI...";

        const paragraphs = Array.from(editor.querySelectorAll('p'));
        const currentP = getCurrentParagraph();
        let currentIndex = currentP ? paragraphs.indexOf(currentP) : 0;
        if (currentIndex === -1) currentIndex = 0;

        let startIndex = 0;
        for (let i = currentIndex; i >= 0; i--) {
            if (paragraphs[i].classList.contains('scene-heading')) { startIndex = i; break; }
        }
        let endIndex = paragraphs.length;
        for (let i = startIndex + 1; i < paragraphs.length; i++) {
            if (paragraphs[i].classList.contains('scene-heading')) { endIndex = i; break; }
        }

        const sceneName = paragraphs[startIndex] ? paragraphs[startIndex].textContent.toUpperCase() : 'UNTITLED SCENE';
        window.currentAiReportName = (appSettings.projectName || 'Untitled Project') + ' - ' + sceneName;

        // We send empty strings for outside elements so absolute line numbers stay identical for the Python script!
        const sceneParagraphs = paragraphs.map((p, index) => (index >= startIndex && index < endIndex) ? p.textContent : "");
        const result = await window.pywebview.api.analyze_script(sceneParagraphs);

        syncDot.style.backgroundColor = '#10b981';
        syncText.textContent = "Scene analysis complete";

        const formattedResult = result.replace(/Line#(\d+)/gi, '<a href="#" onclick="scrollToLine($1); return false;" style="color: #3b82f6; text-decoration: underline;">Line#$1</a>');
        aiAnalysisContent.innerHTML = `<div style="margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #36424e;"><strong>🎬 Scene Analysis</strong></div>` + formattedResult;
        aiReportSidebar.style.display = 'flex';
    });
}

// 3. Update the old Context Menu "Auto-Fix" to act as a Suggestion trigger instead
const ctxAiFix = document.getElementById('ctx-ai-fix');
if (ctxAiFix) {
    ctxAiFix.textContent = 'Get AI Suggestion';
    ctxAiFix.addEventListener('mousedown', async (e) => {
        e.preventDefault();
        contextMenu.style.display = 'none';

        const sel = window.getSelection();
        if (sel.isCollapsed || !editor.contains(sel.anchorNode)) return;

        if (sel.rangeCount > 0) {
            currentSuggestionRange = sel.getRangeAt(0).cloneRange();
        }
        openAiSuggestionModal(sel.toString());
    });
}

// Executes the replacement smoothly
function applyAiSuggestion(textToInsert) {
    if (currentSuggestionRange) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(currentSuggestionRange);
        document.execCommand('insertText', false, textToInsert);
        aiSuggModal.style.display = 'none';
        triggerBackup();
        updateStats();
    }
}

// Hide menu on outside click
document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('#context-menu')) {
        contextMenu.style.display = 'none';
    }
});

// Execute standard clipboard commands. 
// We use `mousedown` instead of `click` to prevent the editor from losing cursor focus before the command fires!
['cut', 'copy', 'selectAll', 'undo', 'redo'].forEach(action => {
    const dashAction = action.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);

    const ctxBtn = document.getElementById(`ctx-${dashAction}`);
    if (ctxBtn) {
        ctxBtn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            document.execCommand(action);
            contextMenu.style.display = 'none';
            triggerBackup(); updateStats();
        });
    }

    const editBtn = document.getElementById(`edit-${dashAction}`);
    if (editBtn) {
        editBtn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            document.execCommand(action);
            triggerBackup(); updateStats();
        });
    }
});

const ctxRevApprove = document.getElementById('ctx-rev-approve');
if (ctxRevApprove) {
    ctxRevApprove.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const revContainer = document.getElementById('revision-menu-container');
        const node = revContainer.targetNode;
        if (node) {
            node.classList.remove('revision');
            node.style.removeProperty('--rev-color');
            node.removeAttribute('data-author');
            node.removeAttribute('data-rev-color');
            triggerBackup();
            updateStats();
        }
        contextMenu.style.display = 'none';
    });
}

const ctxRevNote = document.getElementById('ctx-rev-note');
if (ctxRevNote) {
    ctxRevNote.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const revContainer = document.getElementById('revision-menu-container');
        const node = revContainer.targetNode;
        if (node) {
            let lineText = node.textContent.replace(/\u200B/g, '').replace(/\*/g, '').trim();
            const originalType = getLineType(node) || 'action';

            if (['scene-heading', 'character', 'transition', 'shot'].includes(originalType)) {
                lineText = lineText.toUpperCase();
            }

            const author = appSettings.authorName || 'Writer';
            const newEntry = `<p class="${originalType}">${lineText}</p><p class="note">----&gt; ${author}</p><p class="action">&#8203;</p>`;

            saveCurrentDocument(); // Flush current document state

            if (!appSettings.projectDocuments['Revision Notes']) {
                appSettings.projectDocuments['Revision Notes'] = '<p class="action">&#8203;</p>';
            }
            appSettings.projectDocuments['Revision Notes'] += newEntry;
            currentDocument = 'Revision Notes';

            rebuildDocumentSidebar();
            loadCurrentDocument();

            // Scroll safely down to view the new note
            setTimeout(() => {
                editor.scrollTop = editor.scrollHeight;
                const lastP = editor.lastElementChild;
                if (lastP) {
                    const range = document.createRange();
                    const sel = window.getSelection();
                    range.setStart(lastP, lastP.childNodes.length);
                    range.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(range);
                    lastP.focus();
                }
            }, 50);
            triggerBackup();
        }
        contextMenu.style.display = 'none';
    });
}

const handlePaste = async (e) => {
    e.preventDefault();
    try {
        let text = await navigator.clipboard.readText();
        text = text.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
        if (text.includes('\n')) {
            const html = processImportedText(text, true);
            document.execCommand('insertHTML', false, html);
        } else {
            document.execCommand('insertText', false, text); // Insert as pure plain text
        }
    } catch (err) { document.execCommand('paste'); }
    if (contextMenu) contextMenu.style.display = 'none';
    triggerBackup(); updateStats();
};

document.getElementById('ctx-paste').addEventListener('mousedown', handlePaste);

const editPasteBtn = document.getElementById('edit-paste');
if (editPasteBtn) {
    editPasteBtn.addEventListener('mousedown', handlePaste);
}

// Intercept all native pasting (Ctrl+V and native Right-Click -> Paste) to force plain text
editor.addEventListener('paste', (e) => {
    e.preventDefault();
    let text = (e.clipboardData || window.clipboardData).getData('text');
    text = text.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
    if (text.includes('\n')) {
        const html = processImportedText(text, true);
        document.execCommand('insertHTML', false, html);
    } else {
        document.execCommand('insertText', false, text);
    }
    triggerBackup();
    updateStats();
});

const editPageBreakBtn = document.getElementById('edit-page-break');
if (editPageBreakBtn) {
    editPageBreakBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        insertPageBreak();
        document.querySelectorAll('.dropdown').forEach(m => m.classList.remove('open'));
    });
}

// --- Share Menu Logic ---
async function executeCloudLoad() {
    syncDot.style.backgroundColor = '#f59e0b';
    syncText.textContent = 'Loading latest from cloud...';

    const projectName = appSettings.projectName || "Untitled Project";
    const result = await window.pywebview.api.load_latest_cloud(appSettings.sharedFolderRoot, projectName);

    if (result.error) {
        alert(result.error);
        syncDot.style.backgroundColor = '#ef4444';
        syncText.textContent = 'Cloud load failed';
    } else if (result.not_found) {
        syncDot.style.backgroundColor = '#ef4444';
        syncText.textContent = 'Cloud file not found';
        if (confirm(`${result.message}\n\nWould you like to save this current project as the latest instead?`)) {
            document.getElementById('share-save-latest').click();
        }
    } else if (result.data) {
        try {
            const parsed = JSON.parse(result.data);
            if (parsed['Private Pad'] !== undefined) {
                parsed['Revision Notes'] = parsed['Private Pad'];
                delete parsed['Private Pad'];
            }
            appSettings.projectDocuments = parsed;
            currentDocument = Object.keys(parsed)[0] || 'Default Document';
            appSettings.currentProjectFile = result.filepath;

            saveSettings();
            initializeEnvironment();
            addToRecent(result.filepath);

            syncDot.style.backgroundColor = '#10b981';
            syncText.textContent = 'Loaded from cloud';
            alert("Successfully loaded the latest project from the cloud.");
        } catch (e) {
            alert("Invalid project file.");
            syncDot.style.backgroundColor = '#ef4444';
            syncText.textContent = 'Cloud load failed';
        }
    }
}

const shareLoadLatest = document.getElementById('share-load-latest');
if (shareLoadLatest) {
    shareLoadLatest.addEventListener('click', async () => {
        if (!window.pywebview) {
            alert("This feature requires the Python backend.");
            return;
        }

        if (!appSettings.sharedFolderRoot) {
            alert("Please configure a Shared Folder root in 'Share -> Configure Shared Folder...' first.");
            return;
        }

        // Show the confirmation modal instead of loading immediately
        const confirmModal = document.getElementById('cloud-load-confirm-modal');
        if (confirmModal) {
            confirmModal.style.display = 'flex';
        }
    });
}

// Setup cloud load confirmation modal event handlers
const cloudLoadConfirmModal = document.getElementById('cloud-load-confirm-modal');
if (cloudLoadConfirmModal) {
    const btnSaveFirst = document.getElementById('btn-cloud-load-save-first');
    if (btnSaveFirst) {
        btnSaveFirst.addEventListener('click', async () => {
            cloudLoadConfirmModal.style.display = 'none';
            await handleSave();
            await executeCloudLoad();
        });
    }

    const btnWithoutSaving = document.getElementById('btn-cloud-load-without-saving');
    if (btnWithoutSaving) {
        btnWithoutSaving.addEventListener('click', async () => {
            cloudLoadConfirmModal.style.display = 'none';
            await executeCloudLoad();
        });
    }

    const btnCancel = document.getElementById('btn-cloud-load-cancel');
    if (btnCancel) {
        btnCancel.addEventListener('click', () => {
            cloudLoadConfirmModal.style.display = 'none';
        });
    }
}

const shareSaveLatest = document.getElementById('share-save-latest');
if (shareSaveLatest) {
    shareSaveLatest.addEventListener('click', async () => {
        if (!window.pywebview) {
            alert("This feature requires the Python backend.");
            return;
        }

        if (!appSettings.sharedFolderRoot) {
            alert("Please configure a Shared Folder root in 'Share -> Configure Shared Folder...' first.");
            return;
        }

        saveCurrentDocument();
        const projectData = JSON.stringify(appSettings.projectDocuments);
        const projectName = appSettings.projectName || "Untitled Project";

        syncDot.style.backgroundColor = '#f59e0b';
        syncText.textContent = 'Saving latest to cloud...';

        const result = await window.pywebview.api.save_latest_cloud(appSettings.sharedFolderRoot, projectName, projectData);

        if (result.error) {
            alert(result.error);
            syncDot.style.backgroundColor = '#ef4444';
            syncText.textContent = 'Cloud save failed';
        } else if (result.success) {
            appSettings.currentProjectFile = result.filepath;
            addToRecent(result.filepath);
            saveSettings();

            syncDot.style.backgroundColor = '#10b981';
            syncText.textContent = 'Saved to cloud';
            alert("Successfully saved the latest project to the cloud.");
        }
    });
}


// --- Changelog Modal Logic ---
const changelogModal = document.getElementById('changelog-modal');
if (changelogModal) {
    const menuChangelog = document.getElementById('menu-view-changelog');
    if (menuChangelog) {
        menuChangelog.addEventListener('click', async () => {
            if (!window.pywebview) {
                alert("Changelog information requires the Python backend.");
                return;
            }

            try {
                const verInfo = await window.pywebview.api.get_version_info();
                if (verInfo) {
                    const versionTitle = document.getElementById('changelog-version-title');
                    if (versionTitle) {
                        versionTitle.textContent = verInfo.version || '2.5';
                    }

                    const contentArea = document.getElementById('changelog-content');
                    if (contentArea) {
                        contentArea.innerHTML = '';
                        if (verInfo.changelog && verInfo.changelog.length > 0) {
                            const ul = document.createElement('ul');
                            ul.style.paddingLeft = '20px';
                            ul.style.margin = '0';
                            verInfo.changelog.forEach(item => {
                                const li = document.createElement('li');
                                li.style.marginBottom = '8px';
                                li.textContent = item;
                                ul.appendChild(li);
                            });
                            contentArea.appendChild(ul);
                        } else {
                            contentArea.innerHTML = '<em style="color: var(--text-muted);">No recent updates listed.</em>';
                        }
                    }
                }
                changelogModal.style.display = 'flex';
            } catch (e) {
                alert("Failed to load changelog.");
            }
        });
    }

    const btnCloseChangelog = document.getElementById('btn-close-changelog');
    if (btnCloseChangelog) {
        btnCloseChangelog.addEventListener('click', () => {
            changelogModal.style.display = 'none';
        });
    }
}

document.getElementById('share-gdrive').addEventListener('click', () => {
    const root = appSettings.sharedFolderRoot;
    if (!root) {
        alert("No shared folder root configured.\n\nGo to Share → Configure Shared Folder to set one.");
        return;
    }
    const safeName = (appSettings.projectName || "Untitled Project").replace(/[\\/:*?"<>|]/g, '');
    const projectFolder = root + '\\\\' + safeName;
    if (window.pywebview) {
        window.pywebview.api.open_url(projectFolder);
    } else {
        alert("Requires the Python backend.");
    }
});

document.getElementById('share-configure').addEventListener('click', async () => {
    if (window.pywebview) {
        const folder = await window.pywebview.api.choose_directory();
        if (folder) {
            appSettings.sharedFolderRoot = folder;
            saveSettings();
            alert("Shared root folder updated successfully!");
        }
    } else {
        alert("Native directory selection requires the Python app wrapper.");
    }
});

// --- GitHub Update Check ---
const menuCheckGithubUpdates = document.getElementById('menu-check-github-updates');
if (menuCheckGithubUpdates) {
    menuCheckGithubUpdates.addEventListener('click', async () => {
        const modal = document.getElementById('github-update-modal');
        const checkingDiv = document.getElementById('github-update-checking');
        const resultDiv = document.getElementById('github-update-result');
        const bodyDiv = document.getElementById('github-update-body');
        const githubBtn = document.getElementById('btn-goto-github');

        // Reset and show modal
        checkingDiv.style.display = 'block';
        resultDiv.style.display = 'none';
        githubBtn.style.display = 'none';
        modal.style.display = 'flex';

        try {
            let result;
            if (window.pywebview) {
                result = await window.pywebview.api.check_for_github_updates();
            } else {
                bodyDiv.innerHTML = `<p style="color: var(--text-muted); font-size: 13px;">Update checking requires the desktop app.</p>`;
                checkingDiv.style.display = 'none';
                resultDiv.style.display = 'block';
                return;
            }

            checkingDiv.style.display = 'none';
            resultDiv.style.display = 'block';

            if (result.error) {
                bodyDiv.innerHTML = `<p style="color: #ef4444; font-size: 13px;">⚠️ Could not reach GitHub: ${result.error}</p><p style="font-size: 12px; color: var(--text-muted); margin-top: 8px;">Check your internet connection and try again.</p>`;
            } else if (result.update_available) {
                const changelogHtml = result.changelog && result.changelog.length
                    ? `<ul style="margin: 10px 0 0 0; padding-left: 18px; font-size: 12px; color: var(--text-muted);">` +
                      result.changelog.map(c => `<li style="margin-bottom: 4px;">${c}</li>`).join('') +
                      `</ul>`
                    : '';
                bodyDiv.innerHTML = `
                    <div style="background: #0d1b2a; border: 1px solid #1b8adb; border-radius: 6px; padding: 14px; margin-bottom: 12px;">
                        <p style="font-size: 14px; font-weight: bold; color: #10b981; margin: 0 0 6px 0;">✅ Update Available!</p>
                        <p style="font-size: 12px; color: var(--text-muted); margin: 0;">Your version: <strong style="color:white;">${result.local_version}</strong> &nbsp;→&nbsp; Latest: <strong style="color: #10b981;">${result.remote_version}</strong></p>
                        ${result.last_updated ? `<p style="font-size: 11px; color: var(--text-muted); margin: 4px 0 0 0;">Released: ${result.last_updated}</p>` : ''}
                    </div>
                    ${changelogHtml ? `<p style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px;">What's new:</p>${changelogHtml}` : ''}`;
                githubBtn.style.display = 'block';
            } else {
                bodyDiv.innerHTML = `
                    <div style="text-align: center; padding: 10px 0;">
                        <p style="font-size: 24px; margin: 0;">✅</p>
                        <p style="font-size: 14px; font-weight: bold; color: #10b981; margin: 8px 0 4px 0;">You're up to date!</p>
                        <p style="font-size: 12px; color: var(--text-muted);">ReelScript ${result.local_version} is the latest version.</p>
                    </div>`;
            }
        } catch (e) {
            checkingDiv.style.display = 'none';
            resultDiv.style.display = 'block';
            bodyDiv.innerHTML = `<p style="color: #ef4444; font-size: 13px;">Unexpected error: ${e.message}</p>`;
        }
    });
}

document.getElementById('btn-close-github-update')?.addEventListener('click', () => {
    document.getElementById('github-update-modal').style.display = 'none';
});

// --- API Key Menu Logic ---
const setApiKeyBtn = document.getElementById('menu-set-api-key');
if (setApiKeyBtn) {
    setApiKeyBtn.addEventListener('click', () => {
        const currentKey = appSettings.geminiApiKey || '';
        const newKey = prompt("Enter your Gemini API Key:\n(You can get a free one from Google AI Studio)", currentKey);
        if (newKey !== null) {
            appSettings.geminiApiKey = newKey.trim();
            saveSettings();
            if (window.pywebview) window.pywebview.api.set_api_key(appSettings.geminiApiKey);
            alert("API Key updated successfully!");
        }
    });
}

// --- View Menu Logic ---
function toggleFocusMode() {
    appSettings.isFocusMode = !appSettings.isFocusMode;
    applySettingsToUI();
    saveSettings();
}
document.getElementById('view-toggle-focus').addEventListener('click', toggleFocusMode);
const exitFocusBtn = document.getElementById('exit-focus-mode-btn');
if (exitFocusBtn) {
    exitFocusBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (appSettings.isFocusMode) toggleFocusMode();
    });
}

function togglePageNumbers() {
    appSettings.showPageNumbers = !appSettings.showPageNumbers;
    applySettingsToUI();
    saveSettings();
    updateStats(); // Force overlay refresh instantly
}
const pageNumbersBtn = document.getElementById('view-toggle-page-numbers');
if (pageNumbersBtn) {
    pageNumbersBtn.addEventListener('click', togglePageNumbers);
}

function toggleMenuBar() {
    appSettings.showMenuBar = !appSettings.showMenuBar;
    applySettingsToUI();
    saveSettings();
}

function toggleFormatBtns() {
    appSettings.showFormatBtns = !appSettings.showFormatBtns;
    applySettingsToUI();
    saveSettings();
}
const formatBtnsBtn = document.getElementById('view-toggle-format-btns');
if (formatBtnsBtn) {
    formatBtnsBtn.addEventListener('click', toggleFormatBtns);
}

function toggleWordCount() {
    appSettings.showWordCount = !appSettings.showWordCount;
    applySettingsToUI();
    saveSettings();
}
const wordCountBtn = document.getElementById('view-toggle-word-count');
if (wordCountBtn) {
    wordCountBtn.addEventListener('click', toggleWordCount);
}

function toggleColorCodes() {
    appSettings.showColorCodes = !appSettings.showColorCodes;
    applySettingsToUI();
    saveSettings();
}
const colorCodesBtn = document.getElementById('view-toggle-color-codes');
if (colorCodesBtn) {
    colorCodesBtn.addEventListener('click', toggleColorCodes);
}

function toggleSceneNumbers() {
    appSettings.showSceneNumbers = !appSettings.showSceneNumbers;
    applySettingsToUI();
    saveSettings();
}
const sceneNumbersBtn = document.getElementById('view-toggle-scene-numbers');
if (sceneNumbersBtn) {
    sceneNumbersBtn.addEventListener('click', toggleSceneNumbers);
}

function toggleDialogueFilter() {
    appSettings.filterDialogue = !appSettings.filterDialogue;
    if (appSettings.filterDialogue) appSettings.filterNonDialogue = false; // Mutually exclusive
    applySettingsToUI();
    saveSettings();
}
const filterDialogueBtn = document.getElementById('tools-filter-dialogue');
if (filterDialogueBtn) {
    filterDialogueBtn.addEventListener('click', toggleDialogueFilter);
}

function toggleNonDialogueFilter() {
    appSettings.filterNonDialogue = !appSettings.filterNonDialogue;
    if (appSettings.filterNonDialogue) appSettings.filterDialogue = false; // Mutually exclusive
    applySettingsToUI();
    saveSettings();
}
const filterNonDialogueBtn = document.getElementById('tools-filter-non-dialogue');
if (filterNonDialogueBtn) {
    filterNonDialogueBtn.addEventListener('click', toggleNonDialogueFilter);
}

// --- Clean Spacing Logic ---
function cleanExtraSpacing() {
    if (currentDocument === 'Title Page') {
        alert("Clean Spacing is disabled on the Title Page to protect your customized vertical alignment layout.");
        return;
    }

    const paragraphs = Array.from(editor.querySelectorAll('p'));
    if (paragraphs.length === 0) return;

    function isEmptyParagraph(p) {
        if (p.classList.contains('page-break')) return false;
        const text = p.textContent.replace(/[\u200B\s]/g, '');
        return text === '';
    }

    function cleanTextNodeSpaces(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            node.nodeValue = node.nodeValue.replace(/ {2,}/g, ' ');
        } else {
            for (let child of node.childNodes) {
                cleanTextNodeSpaces(child);
            }
        }
    }

    let removedCount = 0;
    let textCleanedCount = 0;

    paragraphs.forEach(p => {
        if (isEmptyParagraph(p)) {
            if (paragraphs.length - removedCount > 1) {
                p.remove();
                removedCount++;
            } else {
                p.innerHTML = '&#8203;';
            }
        } else {
            cleanTextNodeSpaces(p);
            textCleanedCount++;
        }
    });

    saveCurrentDocument();
    updateStats();
    triggerBackup();

    alert(`Spacing cleaned up successfully!\n- Removed ${removedCount} empty spacing line(s).\n- Standardized spacing in ${textCleanedCount} text block(s).`);
}

const cleanSpacesBtn = document.getElementById('tools-clean-spaces');
if (cleanSpacesBtn) {
    cleanSpacesBtn.addEventListener('click', cleanExtraSpacing);
}

// --- Cut Double Parentheses Logic ---
// The .parenthetical CSS already injects ( ) via ::before/::after.
// This tool removes any manually-typed leading ( and trailing ) from those lines.
const cutDoubleParensBtn = document.getElementById('tools-cut-double-parens');
if (cutDoubleParensBtn) {
    cutDoubleParensBtn.addEventListener('click', () => {
        const paragraphs = Array.from(editor.querySelectorAll('p.parenthetical'));
        if (paragraphs.length === 0) {
            alert('No parenthetical lines found in the current document.');
            return;
        }

        let fixedCount = 0;
        paragraphs.forEach(p => {
            // Collect all text content, stripping zero-width spaces
            let text = p.textContent.replace(/\u200B/g, '');
            let changed = false;

            // Strip one leading ( and one trailing ) if both are present
            if (text.startsWith('(') && text.endsWith(')')) {
                text = text.slice(1, -1);
                changed = true;
            }

            if (changed) {
                // Preserve any child formatting nodes (bold/italic spans) if possible,
                // otherwise fall back to plain text replacement.
                if (p.childNodes.length === 1 && p.childNodes[0].nodeType === Node.TEXT_NODE) {
                    p.textContent = text || '\u200B';
                } else {
                    // Walk child nodes and strip the leading ( from the first text node
                    // and the trailing ) from the last text node
                    const firstText = findFirstTextNode(p);
                    const lastText = findLastTextNode(p);
                    if (firstText && lastText) {
                        if (firstText === lastText) {
                            firstText.nodeValue = firstText.nodeValue.replace(/^\(/, '').replace(/\)$/, '');
                        } else {
                            firstText.nodeValue = firstText.nodeValue.replace(/^\(/, '');
                            lastText.nodeValue = lastText.nodeValue.replace(/\)$/, '');
                        }
                    }
                }
                fixedCount++;
            }
        });

        if (fixedCount > 0) {
            triggerBackup();
            updateStats();
            alert(`Fixed ${fixedCount} parenthetical line(s) — manual ( ) brackets removed.`);
        } else {
            alert('No double parentheses found. All parenthetical lines look clean!');
        }
    });
}

function findFirstTextNode(node) {
    for (let child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE && child.nodeValue.replace(/\u200B/g, '') !== '') return child;
        const found = findFirstTextNode(child);
        if (found) return found;
    }
    return null;
}

function findLastTextNode(node) {
    const children = Array.from(node.childNodes);
    for (let i = children.length - 1; i >= 0; i--) {
        const child = children[i];
        if (child.nodeType === Node.TEXT_NODE && child.nodeValue.replace(/\u200B/g, '') !== '') return child;
        const found = findLastTextNode(child);
        if (found) return found;
    }
    return null;
}

// --- Fix Char Names Tool: batch-uppercase character names across action & scene lines ---
function batchProcessTextNodes(p, names, isParenthetical) {
    let changed = false;
    function processNode(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            let val = node.nodeValue;
            if (isParenthetical) {
                const lowered = val.toLowerCase();
                if (lowered !== val) { val = lowered; changed = true; }
            }
            names.forEach(name => {
                const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                val = val.replace(new RegExp('\\b' + escaped + '\\b', 'gi'), match => {
                    if (match === name) return match;
                    changed = true;
                    return name;
                });
            });
            if (val !== node.nodeValue) node.nodeValue = val;
        } else {
            node.childNodes.forEach(processNode);
        }
    }
    processNode(p);
    return changed;
}

const fixCharNamesBtn = document.getElementById('tools-fix-char-names');
if (fixCharNamesBtn) {
    fixCharNamesBtn.addEventListener('click', () => {
        invalidateCharNameCache();
        const names = getCharNameTable();
        if (names.size === 0) {
            alert('No character names found in the document.\nAdd character-type lines first.');
            return;
        }

        let fixedCount = 0;
        editor.querySelectorAll('p.action, p.scene-heading').forEach(p => {
            if (batchProcessTextNodes(p, names, false)) fixedCount++;
        });

        if (fixedCount > 0) {
            triggerBackup();
            updateStats();
            alert(`Fixed character name casing in ${fixedCount} line(s).`);
        } else {
            alert('All character names in action and scene lines are already correctly capitalized!');
        }
    });
}

const fixParenthsBtn = document.getElementById('tools-fix-parenths');
if (fixParenthsBtn) {
    fixParenthsBtn.addEventListener('click', () => {
        invalidateCharNameCache();
        const names = getCharNameTable(); // May be empty — lowercase still applies

        const paragraphs = Array.from(editor.querySelectorAll('p.parenthetical'));
        if (paragraphs.length === 0) {
            alert('No parenthetical lines found in the current document.');
            return;
        }

        let fixedCount = 0;
        paragraphs.forEach(p => {
            if (batchProcessTextNodes(p, names, true)) fixedCount++;
        });

        if (fixedCount > 0) {
            triggerBackup();
            updateStats();
            alert(`Formatted ${fixedCount} parenthetical line(s) — lowercase applied, character names uppercased.`);
        } else {
            alert('All parenthetical lines are already correctly formatted!');
        }
    });
}


const charFilterModal = document.getElementById('char-filter-modal');
const charFilterList = document.getElementById('char-filter-list');
const charFilterSpeakingOnlyCb = document.getElementById('char-filter-speaking-only');

function populateCharFilterList() {
    const charElements = Array.from(editor.querySelectorAll('p.character'));
    const uniqueChars = new Set();
    const speakingOnly = charFilterSpeakingOnlyCb ? charFilterSpeakingOnlyCb.checked : false;

    charElements.forEach(p => {
        // Extract base name, ignoring things like (V.O.) or (CONT'D)
        let name = p.textContent.replace(/\(.*?\)/g, '').trim();
        if (name) {
            if (speakingOnly) {
                let next = p.nextElementSibling;
                let hasDialogue = false;
                while (next && (next.classList.contains('parenthetical') || next.classList.contains('dialogue'))) {
                    if (next.classList.contains('dialogue')) {
                        hasDialogue = true;
                        break;
                    }
                    next = next.nextElementSibling;
                }
                if (hasDialogue) uniqueChars.add(name);
            } else {
                uniqueChars.add(name);
            }
        }
    });

    // Save currently selected characters to prevent reset when toggling checkbox
    const currentlySelected = Array.from(charFilterList.querySelectorAll('.char-filter-cb:checked')).map(cb => cb.value);

    charFilterList.innerHTML = '';
    if (uniqueChars.size === 0) {
        charFilterList.innerHTML = '<div style="color: var(--text-muted); font-size: 12px; text-align: center;">No characters found in document.</div>';
    } else {
        Array.from(uniqueChars).sort().forEach(charName => {
            const label = document.createElement('label');
            label.style.display = 'flex';
            label.style.alignItems = 'center';
            label.style.gap = '8px';
            label.style.fontSize = '13px';
            label.style.cursor = 'pointer';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = charName;
            checkbox.className = 'char-filter-cb';
            if (currentlySelected.includes(charName)) {
                checkbox.checked = true;
            }

            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(charName));
            charFilterList.appendChild(label);
        });
    }
}

if (charFilterSpeakingOnlyCb) {
    charFilterSpeakingOnlyCb.addEventListener('change', populateCharFilterList);
}

document.getElementById('tools-char-filter').addEventListener('click', () => {
    populateCharFilterList();
    charFilterModal.style.display = 'flex';
});

document.getElementById('btn-close-char-filter').addEventListener('click', () => {
    charFilterModal.style.display = 'none';
});

function applyCharacterFilter() {
    const checkboxes = document.querySelectorAll('.char-filter-cb:checked');
    const selectedChars = Array.from(checkboxes).map(cb => cb.value);

    if (selectedChars.length === 0) {
        alert("Please select at least one character.");
        return;
    }

    let keepCurrentBlock = false;
    const allParagraphs = editor.querySelectorAll('p');

    allParagraphs.forEach(p => {
        const type = getLineType(p);

        if (type === 'character') {
            const baseName = p.textContent.replace(/\(.*?\)/g, '').trim();
            keepCurrentBlock = selectedChars.includes(baseName);
            if (keepCurrentBlock) p.classList.remove('char-filtered-hidden');
            else p.classList.add('char-filtered-hidden');
        } else if (type === 'parenthetical' || type === 'dialogue' || type === 'dual') {
            if (keepCurrentBlock) p.classList.remove('char-filtered-hidden');
            else p.classList.add('char-filtered-hidden');
        } else {
            keepCurrentBlock = false;
            p.classList.add('char-filtered-hidden');
        }
    });

    document.body.classList.add('character-filter-active');
    charFilterModal.style.display = 'none';
}

function clearCharacterFilter() {
    document.body.classList.remove('character-filter-active');
    editor.querySelectorAll('.char-filtered-hidden').forEach(p => p.classList.remove('char-filtered-hidden'));
    charFilterModal.style.display = 'none';
}

document.getElementById('btn-apply-char-filter').addEventListener('click', applyCharacterFilter);
document.getElementById('btn-clear-char-filter').addEventListener('click', clearCharacterFilter);
const exitCharFilterBtn = document.getElementById('exit-char-filter-btn');
if (exitCharFilterBtn) {
    exitCharFilterBtn.addEventListener('click', clearCharacterFilter);
}

// --- Rename Character Logic ---
const renameCharModal = document.getElementById('rename-char-modal');
const renameCharOldSelect = document.getElementById('rename-char-old');
const renameCharNewInput = document.getElementById('rename-char-new');

document.getElementById('tools-rename-character').addEventListener('click', () => {
    const charElements = Array.from(editor.querySelectorAll('p.character'));
    const uniqueChars = new Set();

    charElements.forEach(p => {
        let name = p.textContent.replace(/\(.*?\)/g, '').trim();
        if (name) uniqueChars.add(name);
    });

    renameCharOldSelect.innerHTML = '';
    if (uniqueChars.size === 0) {
        const opt = document.createElement('option');
        opt.textContent = "No characters found";
        opt.disabled = true;
        renameCharOldSelect.appendChild(opt);
    } else {
        Array.from(uniqueChars).sort().forEach(charName => {
            const opt = document.createElement('option');
            opt.value = charName;
            opt.textContent = charName;
            renameCharOldSelect.appendChild(opt);
        });
    }

    renameCharNewInput.value = '';
    renameCharModal.style.display = 'flex';
});

document.getElementById('btn-close-rename-char').addEventListener('click', () => {
    renameCharModal.style.display = 'none';
});

document.getElementById('btn-apply-rename').addEventListener('click', () => {
    const oldName = renameCharOldSelect.value;
    const newName = renameCharNewInput.value.trim().toUpperCase();
    const replaceAll = document.getElementById('rename-char-all-lines').checked;

    if (!oldName || !newName) {
        alert("Please provide a valid new name.");
        return;
    }

    let charCount = 0;
    let otherCount = 0;

    // Escape regex characters (e.g., if the character's name is "DR. SMITH")
    const escapedOldName = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedOldName}\\b`, 'gi');

    editor.querySelectorAll('p').forEach(p => {
        const type = getLineType(p);

        if (type === 'character') {
            // Targets base name (prevents destroying extensions like " (V.O.)")
            const baseName = p.textContent.replace(/\(.*?\)/g, '').trim();
            if (baseName === oldName) {
                p.textContent = p.textContent.replace(oldName, newName);
                charCount++;
            }
        } else if (replaceAll && (type === 'action' || type === 'dialogue')) {
            // Smart-case replacement across the document
            if (regex.test(p.textContent)) {
                p.textContent = p.textContent.replace(regex, (match) => {
                    if (match === match.toUpperCase()) return newName;
                    if (match === match.toLowerCase()) return newName.toLowerCase();
                    return newName.charAt(0).toUpperCase() + newName.slice(1).toLowerCase();
                });
                otherCount++;
            }
        }
    });

    if (charCount > 0 || otherCount > 0) {
        triggerBackup();
        updateStats();
    }

    renameCharModal.style.display = 'none';
    alert(`Successfully renamed ${charCount} character heading(s) and ${otherCount} line reference(s).`);
});

// --- Find & Replace Logic ---
const findReplaceModal = document.getElementById('find-replace-modal');
const findInput = document.getElementById('find-input');
const replaceInput = document.getElementById('replace-input');
const matchCaseCb = document.getElementById('find-match-case');

function openFindReplace() {
    document.querySelectorAll('.dropdown').forEach(m => m.classList.remove('open'));
    findReplaceModal.style.display = 'flex';

    // Pre-populate 'find' field if user has text selected
    const sel = window.getSelection();
    if (!sel.isCollapsed && editor.contains(sel.anchorNode)) {
        findInput.value = sel.toString();
    }
    findInput.focus();
}
document.getElementById('edit-find-replace').addEventListener('click', openFindReplace);

function doFindNext(wrap = true) {
    const text = findInput.value;
    if (!text) return false;
    const matchCase = matchCaseCb.checked;

    // window.find(string, caseSensitive, backwards, wrapAround, wholeWord, searchInFrames, showDialog)
    const found = window.find(text, matchCase, false, wrap, false, false, false);
    if (found) {
        const sel = window.getSelection();
        if (sel.rangeCount > 0) {
            const node = sel.getRangeAt(0).startContainer.parentNode;
            if (node && node.scrollIntoView) node.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    } else if (wrap) {
        alert(`No matches found for "${text}".`);
    }
    return found;
}
document.getElementById('btn-find-next').addEventListener('click', () => doFindNext(true));

document.getElementById('btn-replace').addEventListener('click', () => {
    const findText = findInput.value;
    const replaceText = replaceInput.value;
    if (!findText) return;

    const sel = window.getSelection();
    if (!sel.isCollapsed && editor.contains(sel.anchorNode)) {
        const selText = sel.toString();
        const matchCase = matchCaseCb.checked;

        // Ensure current selection matches what we're looking for before replacing
        if ((matchCase && selText === findText) || (!matchCase && selText.toLowerCase() === findText.toLowerCase())) {
            document.execCommand('insertText', false, replaceText);
            triggerBackup();
            updateStats();
        }
    }
    doFindNext(true); // Automatically advance to next match
});

document.getElementById('btn-replace-all').addEventListener('click', () => {
    const findText = findInput.value;
    const replaceText = replaceInput.value;
    if (!findText) return;

    let count = 0;

    // Jump cursor to the start of the editor to search entire document cleanly
    const sel = window.getSelection();
    sel.removeAllRanges();
    const range = document.createRange();
    range.setStart(editor, 0);
    range.collapse(true);
    sel.addRange(range);

    // Loop Find/Replace until no more matches
    while (doFindNext(false)) { // wrap=false to avoid infinite loop
        document.execCommand('insertText', false, replaceText);
        count++;
    }

    if (count > 0) {
        triggerBackup();
        updateStats();
        alert(`Replaced ${count} occurrence(s).`);
    } else {
        alert(`No matches found for "${findText}".`);
    }
});

// Make Find & Replace Modal Draggable
const frModalContent = document.getElementById('find-replace-content');
const frModalHeader = document.getElementById('find-replace-header');
let isFrDragging = false;
let frDragOffsetX = 0, frDragOffsetY = 0;

if (frModalHeader && frModalContent) {
    frModalHeader.addEventListener('mousedown', (e) => {
        isFrDragging = true;
        const rect = frModalContent.getBoundingClientRect();
        frDragOffsetX = e.clientX - rect.left;
        frDragOffsetY = e.clientY - rect.top;
        frModalContent.style.right = 'auto';
        frModalContent.style.bottom = 'auto';
    });
    document.addEventListener('mousemove', (e) => {
        if (isFrDragging) {
            frModalContent.style.left = (e.clientX - frDragOffsetX) + 'px';
            frModalContent.style.top = (e.clientY - frDragOffsetY) + 'px';
        }
    });
    document.addEventListener('mouseup', () => isFrDragging = false);
}

// --- Customize Menu Logic ---
document.getElementById('menu-toggle-darkmode').addEventListener('click', () => {
    appSettings.darkMode = !appSettings.darkMode;
    applySettingsToUI();
    saveSettings();
});

// --- Document-Wide Spell Check Logic ---
let currentMisspellings = [];
let currentSpellIndex = 0;
let currentSpellRange = null;

document.getElementById('tools-check-spelling').addEventListener('click', async () => {
    if (!window.pywebview) {
        alert("Spell check requires running through the Python app wrapper.");
        return;
    }
    syncDot.style.backgroundColor = '#f59e0b';
    syncText.textContent = "Checking document...";

    const text = editor.innerText;
    const result = await window.pywebview.api.check_document_spelling(text);

    syncDot.style.backgroundColor = '#10b981';
    syncText.textContent = "Check complete";

    if (result.error) { alert(result.error); return; }

    currentMisspellings = result.misspelled;
    currentSpellIndex = 0;
    currentSpellRange = null;

    if (currentMisspellings.length > 0) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        const range = document.createRange();
        range.setStart(editor, 0);
        range.collapse(true);
        sel.addRange(range);
    }

    document.getElementById('spellcheck-modal').style.display = 'flex';
    processNextSpelling();
});

function processNextSpelling() {
    if (currentSpellIndex >= currentMisspellings.length) {
        document.getElementById('spellcheck-active').style.display = 'none';
        document.getElementById('spellcheck-complete').style.display = 'block';
        return;
    }

    const currentItem = currentMisspellings[currentSpellIndex];

    if (currentSpellRange) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        const r = currentSpellRange.cloneRange();
        r.collapse(false);
        sel.addRange(r);
    }

    const found = window.find(currentItem.word, false, false, false, true, false, false);

    if (found) {
        const sel = window.getSelection();
        if (sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
            currentSpellRange = sel.getRangeAt(0).cloneRange();

            document.getElementById('spellcheck-active').style.display = 'block';
            document.getElementById('spellcheck-complete').style.display = 'none';

            document.getElementById('spellcheck-word').textContent = currentItem.word;

            const suggSelect = document.getElementById('spellcheck-suggestions');
            const customCorrection = document.getElementById('spellcheck-custom-correction');
            suggSelect.innerHTML = '';
            customCorrection.value = '';

            if (currentItem.suggestions.length > 0) {
                currentItem.suggestions.forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = opt.textContent = s;
                    suggSelect.appendChild(opt);
                });
                suggSelect.selectedIndex = 0;
                customCorrection.value = suggSelect.value;
            } else {
                const opt = document.createElement('option');
                opt.value = ""; opt.textContent = "(No suggestions)"; opt.disabled = true;
                suggSelect.appendChild(opt);
            }

            const node = sel.getRangeAt(0).startContainer.parentNode;
            if (node && node.scrollIntoView) node.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }
    }

    currentSpellIndex++;
    currentSpellRange = null;
    if (currentSpellIndex < currentMisspellings.length) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        const range = document.createRange();
        range.setStart(editor, 0);
        range.collapse(true);
        sel.addRange(range);
    }
    processNextSpelling();
}

document.getElementById('spellcheck-suggestions').addEventListener('change', (e) => {
    document.getElementById('spellcheck-custom-correction').value = e.target.value;
});

document.getElementById('btn-spell-ignore').addEventListener('click', () => { processNextSpelling(); });
document.getElementById('btn-spell-next').addEventListener('click', () => {
    currentSpellIndex++;
    currentSpellRange = null;
    if (currentSpellIndex < currentMisspellings.length) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        const range = document.createRange();
        range.setStart(editor, 0);
        range.collapse(true);
        sel.addRange(range);
    }
    processNextSpelling();
});
document.getElementById('btn-spell-add').addEventListener('click', async () => {
    const currentWord = currentMisspellings[currentSpellIndex].word;
    await window.pywebview.api.add_to_dictionary(currentWord);

    if (currentSpellRange) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(currentSpellRange);
        document.execCommand('insertHTML', false, `<span spellcheck="false">${currentWord}</span>`);
        triggerBackup();
        updateStats();
    }

    currentSpellIndex++;
    currentSpellRange = null;
    if (currentSpellIndex < currentMisspellings.length) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        const range = document.createRange();
        range.setStart(editor, 0);
        range.collapse(true);
        sel.addRange(range);
    }
    processNextSpelling();
});
document.getElementById('btn-spell-change').addEventListener('click', () => {
    const replacement = document.getElementById('spellcheck-custom-correction').value.trim();
    if (replacement && currentSpellRange) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(currentSpellRange);
        document.execCommand('insertText', false, replacement);
        triggerBackup();
        updateStats();
        currentSpellRange = sel.getRangeAt(0).cloneRange();
    }
    processNextSpelling();
});

// --- Draggable Spellcheck Modal ---
const spellModalContent = document.getElementById('spellcheck-content');
const spellModalHeader = document.getElementById('spellcheck-header');

let isSpellDragging = false;
let spellDragOffsetX = 0;
let spellDragOffsetY = 0;

if (spellModalHeader && spellModalContent) {
    spellModalHeader.addEventListener('mousedown', (e) => {
        isSpellDragging = true;
        const rect = spellModalContent.getBoundingClientRect();
        spellDragOffsetX = e.clientX - rect.left;
        spellDragOffsetY = e.clientY - rect.top;

        spellModalContent.style.right = 'auto';
        spellModalContent.style.bottom = 'auto';
    });

    document.addEventListener('mousemove', (e) => {
        if (isSpellDragging) {
            spellModalContent.style.left = (e.clientX - spellDragOffsetX) + 'px';
            spellModalContent.style.top = (e.clientY - spellDragOffsetY) + 'px';
        }
    });

    document.addEventListener('mouseup', () => {
        isSpellDragging = false;
    });
}

// --- Mini Toolbar Logic ---
function updateMiniToolbarState() {
    ['bold', 'italic', 'underline'].forEach(style => {
        const btn = document.getElementById(`mini-${style}`);
        if (document.queryCommandState(style)) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    const p = getCurrentParagraph();
    document.getElementById('mini-align-left').classList.remove('active');
    document.getElementById('mini-align-center').classList.remove('active');
    document.getElementById('mini-align-right').classList.remove('active');
    if (p) {
        if (p.classList.contains('align-center')) {
            document.getElementById('mini-align-center').classList.add('active');
        } else if (p.classList.contains('align-right')) {
            document.getElementById('mini-align-right').classList.add('active');
        } else if (p.classList.contains('align-left')) {
            document.getElementById('mini-align-left').classList.add('active');
        } else {
            if (currentDocument === 'Title Page') {
                document.getElementById('mini-align-center').classList.add('active');
            } else {
                document.getElementById('mini-align-left').classList.add('active');
            }
        }
    }
}

['bold', 'italic', 'underline'].forEach(style => {
    document.getElementById(`mini-${style}`).addEventListener('mousedown', e => {
        e.preventDefault();
        document.execCommand(style);
    });
});

// --- Toggle Case Logic ---
function toggleCase() {
    const sel = window.getSelection();
    if (!sel.isCollapsed && editor.contains(sel.anchorNode)) {
        const text = sel.toString();
        const newText = text === text.toUpperCase()
            ? text.toLowerCase().replace(/(^\s*[a-z]|[.!?]\s*[a-z])/g, c => c.toUpperCase())
            : text.toUpperCase();
        document.execCommand('insertText', false, newText);
        triggerBackup();
        updateStats();
    }
}

const caseToggleBtn = document.getElementById('mini-case-toggle');
if (caseToggleBtn) {
    caseToggleBtn.addEventListener('mousedown', e => {
        e.preventDefault();
        toggleCase();
    });
}

['left', 'center', 'right'].forEach(align => {
    document.getElementById(`mini-align-${align}`).addEventListener('mousedown', e => {
        e.preventDefault();
        const p = getCurrentParagraph();
        if (p) {
            p.classList.remove('align-center', 'align-right', 'align-left');
            if (align !== 'left' || currentDocument === 'Title Page') {
                p.classList.add(`align-${align}`);
            }
            updateMiniToolbarState();
            triggerBackup();
        }
    });
});

// --- Revisions and Snapshots Logic ---
document.getElementById('rev-toggle-mode').addEventListener('click', () => {
    appSettings.isRevisionMode = !appSettings.isRevisionMode;
    document.getElementById('rev-mode-check').style.visibility = appSettings.isRevisionMode ? 'visible' : 'hidden';
    saveSettings();
});

document.getElementById('rev-clear-marks').addEventListener('click', () => {
    if (confirm("Are you sure you want to clear all revision asterisks from the current document?")) {
        editor.querySelectorAll('.revision').forEach(el => el.classList.remove('revision'));
        triggerBackup();
    }
});

const snapshotsModal = document.getElementById('snapshots-modal');
const snapshotsList = document.getElementById('snapshots-list');

document.getElementById('rev-manage-snapshots').addEventListener('click', () => {
    renderSnapshotsList();
    snapshotsModal.style.display = 'flex';
});

document.getElementById('btn-close-snapshots').addEventListener('click', () => {
    snapshotsModal.style.display = 'none';
});

document.getElementById('btn-create-snapshot').addEventListener('click', () => {
    const nameInput = document.getElementById('snapshot-name-input');
    const name = nameInput.value.trim() || 'Untitled Snapshot';

    saveCurrentDocument(); // Flush memory to state before copying
    if (!appSettings.snapshots) appSettings.snapshots = [];

    appSettings.snapshots.push({
        id: Date.now(),
        name: name,
        date: new Date().toLocaleString(),
        projectName: appSettings.projectName || 'Untitled Project',
        documents: JSON.parse(JSON.stringify(appSettings.projectDocuments))
    });

    nameInput.value = '';
    saveSettings();
    renderSnapshotsList();
});

function renderSnapshotsList() {
    if (!appSettings.snapshots) appSettings.snapshots = [];
    snapshotsList.innerHTML = '';

    const currentProjectName = appSettings.projectName || 'Untitled Project';
    const projectSnapshots = appSettings.snapshots.filter(snap =>
        (snap.projectName || 'Untitled Project') === currentProjectName
    );

    if (projectSnapshots.length === 0) {
        snapshotsList.innerHTML = '<p style="text-align:center; margin-top:20px; font-size: 11px;">No snapshots created yet for this project.</p>';
        return;
    }

    [...projectSnapshots].reverse().forEach(snap => {
        const div = document.createElement('div');
        div.className = 'hotkey-row';
        div.style.padding = '8px';
        div.style.borderBottom = '1px solid #36424e';

        div.innerHTML = `
            <div style="flex:1;">
                <div style="font-weight:bold; font-size:13px;">${snap.name}</div>
                <div style="font-size:10px; color:var(--text-muted);">${snap.date}</div>
            </div>
            <div style="display:flex; gap:5px;">
                <button class="modal-btn" onclick="restoreSnapshot(${snap.id})" style="background-color:#f59e0b; padding:4px 8px; font-size:10px;">Restore</button>
                <button class="modal-btn" onclick="if(confirm('Delete this snapshot?')) { appSettings.snapshots = appSettings.snapshots.filter(s => s.id !== ${snap.id}); saveSettings(); renderSnapshotsList(); }" style="background-color:#ef4444; padding:4px 8px; font-size:10px;">Delete</button>
            </div>
        `;
        snapshotsList.appendChild(div);
    });
}

window.restoreSnapshot = (id) => {
    const snap = appSettings.snapshots.find(s => s.id === id);
    if (snap && confirm(`Restore "${snap.name}"? This will overwrite your current project state.`)) {
        appSettings.projectDocuments = JSON.parse(JSON.stringify(snap.documents));
        currentDocument = Object.keys(appSettings.projectDocuments)[0] || 'Default Document';
        rebuildDocumentSidebar(); loadCurrentDocument(); saveSettings();
        snapshotsModal.style.display = 'none';
    }
};

// --- Sidebar Navigation & Scenes List Logic ---
const navProjectBtn = document.getElementById('nav-project-btn');
const navScenesBtn = document.getElementById('nav-scenes-btn');
const navNotesBtn = document.getElementById('nav-notes-btn');
const sidebarProjectView = document.getElementById('sidebar-project-view');
const sidebarScenesView = document.getElementById('sidebar-scenes-view');
const sidebarNotesView = document.getElementById('sidebar-notes-view');

if (navProjectBtn && navScenesBtn && navNotesBtn) {
    navProjectBtn.addEventListener('click', () => {
        navProjectBtn.classList.add('active');
        navScenesBtn.classList.remove('active');
        navNotesBtn.classList.remove('active');
        sidebarProjectView.style.display = 'flex';
        sidebarScenesView.style.display = 'none';
        sidebarNotesView.style.display = 'none';
    });

    navScenesBtn.addEventListener('click', () => {
        navScenesBtn.classList.add('active');
        navProjectBtn.classList.remove('active');
        navNotesBtn.classList.remove('active');
        sidebarProjectView.style.display = 'none';
        sidebarScenesView.style.display = 'flex';
        sidebarNotesView.style.display = 'none';
        buildScenesList();
    });

    navNotesBtn.addEventListener('click', () => {
        navNotesBtn.classList.add('active');
        navProjectBtn.classList.remove('active');
        navScenesBtn.classList.remove('active');
        sidebarProjectView.style.display = 'none';
        sidebarScenesView.style.display = 'none';
        sidebarNotesView.style.display = 'flex';
    });
}

const localNotesArea = document.getElementById('local-notes-area');
if (localNotesArea) {
    localNotesArea.value = localStorage.getItem('reelscript_local_notes') || '';
    localNotesArea.addEventListener('input', () => {
        localStorage.setItem('reelscript_local_notes', localNotesArea.value);
    });
}

// --- Scene List Context Menu Logic ---
const sceneContextMenu = document.createElement('div');
sceneContextMenu.id = 'scene-context-menu';
sceneContextMenu.className = 'context-menu';
sceneContextMenu.innerHTML = `<div id="ctx-ai-scene-check" class="context-menu-item">🎬 AI Check Scene</div>`;
document.body.appendChild(sceneContextMenu);

document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('#scene-context-menu')) {
        sceneContextMenu.style.display = 'none';
    }
});

document.getElementById('ctx-ai-scene-check').addEventListener('mousedown', async (e) => {
    e.preventDefault();
    sceneContextMenu.style.display = 'none';
    const scene = sceneContextMenu.targetScene;
    if (!scene) return;

    if (!window.pywebview) {
        alert("AI Analysis requires running through the Python app wrapper.");
        return;
    }

    syncDot.style.backgroundColor = '#f59e0b';
    syncText.textContent = "Analyzing scene with AI...";

    const paragraphs = Array.from(editor.querySelectorAll('p'));
    const startIndex = paragraphs.indexOf(scene);
    if (startIndex === -1) return;

    window.currentAiReportName = (appSettings.projectName || 'Untitled Project') + ' - ' + (scene.textContent || 'Untitled Scene').toUpperCase();

    let endIndex = paragraphs.length;
    for (let i = startIndex + 1; i < paragraphs.length; i++) {
        if (paragraphs[i].classList.contains('scene-heading')) { endIndex = i; break; }
    }

    const sceneParagraphs = paragraphs.map((p, index) => (index >= startIndex && index < endIndex) ? p.textContent : "");
    const result = await window.pywebview.api.analyze_script(sceneParagraphs);

    syncDot.style.backgroundColor = '#10b981';
    syncText.textContent = "Scene analysis complete";

    const formattedResult = result.replace(/Line#(\d+)/gi, '<a href="#" onclick="scrollToLine($1); return false;" style="color: #3b82f6; text-decoration: underline;">Line#$1</a>');
    document.getElementById('ai-analysis-content').innerHTML = `<div style="margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #36424e;"><strong>🎬 Scene Analysis: ${(scene.textContent || 'Untitled Scene').toUpperCase()}</strong></div>` + formattedResult;
    document.getElementById('ai-report-sidebar').style.display = 'flex';
});

window.buildScenesList = function () {
    const scenesList = document.getElementById('scenes-list');
    if (!scenesList) return;

    const scrollPos = scenesList.scrollTop;
    scenesList.innerHTML = '';

    const scenes = editor.querySelectorAll('p.scene-heading');
    if (scenes.length === 0) {
        scenesList.innerHTML = '<div style="padding: 15px; color: var(--text-muted); font-size: 11px; text-align: center;">No scenes found in the current document.</div>';
        return;
    }

    scenes.forEach((scene, index) => {
        if (!scene.id) scene.id = 'scene-' + index + '-' + Date.now();

        const div = document.createElement('div');
        div.className = 'sidebar-item';
        div.style.fontSize = '11px';
        div.style.padding = '8px 15px';
        div.style.whiteSpace = 'nowrap';
        div.style.overflow = 'hidden';
        div.style.textOverflow = 'ellipsis';
        div.style.display = 'block';
        div.dataset.sceneIndex = index; // Tag for active-scene matching
        div.innerHTML = `<span style="font-size: 12px; margin-right: 8px;">🎬</span> <span style="font-weight: bold; color: #3b82f6; margin-right: 6px;">${index + 1}.</span> ${(scene.textContent || 'Untitled Scene').toUpperCase()}`;

        div.addEventListener('click', () => {
            // 1. Scroll the script down to the specific element
            scene.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // 2. Temporarily highlight the line in blue so the user can easily spot it
            const originalBg = scene.style.backgroundColor;
            const originalTrans = scene.style.transition;
            scene.style.transition = 'none';
            scene.style.backgroundColor = '#3b82f644';
            setTimeout(() => {
                scene.style.transition = 'background-color 1s ease';
                scene.style.backgroundColor = originalBg;
                setTimeout(() => scene.style.transition = originalTrans, 1000);
            }, 500);

            // 3. Move the typing cursor caret explicitly to the start of the scene
            const sel = window.getSelection();
            const range = document.createRange();
            range.setStart(scene, 0);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
            editor.focus();
        });

        div.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            sceneContextMenu.targetScene = scene;
            sceneContextMenu.style.display = 'block';

            let x = e.clientX;
            let y = e.clientY;
            if (x + sceneContextMenu.offsetWidth > window.innerWidth) x = window.innerWidth - sceneContextMenu.offsetWidth;
            if (y + sceneContextMenu.offsetHeight > window.innerHeight) y = window.innerHeight - sceneContextMenu.offsetHeight;

            sceneContextMenu.style.top = `${y}px`;
            sceneContextMenu.style.left = `${x}px`;
        });

        scenesList.appendChild(div);
    });

    // Maintain exact scroll position so the list doesn't jump while the user is typing
    scenesList.scrollTop = scrollPos;

    // Highlight whichever scene the cursor is currently inside
    highlightCurrentSceneInSidebar();
};

// Highlights the scene item in the sidebar that matches the cursor's current position
function highlightCurrentSceneInSidebar() {
    const scenesList = document.getElementById('scenes-list');
    const scenesView = document.getElementById('sidebar-scenes-view');
    if (!scenesList || !scenesView || scenesView.style.display === 'none') return;

    // Walk backward from the current paragraph to find the enclosing scene-heading
    const currentP = getCurrentParagraph();
    const allSceneHeadings = Array.from(editor.querySelectorAll('p.scene-heading'));
    if (allSceneHeadings.length === 0) return;

    let activeIndex = -1;
    if (currentP) {
        const allParagraphs = Array.from(editor.querySelectorAll('p'));
        let idx = allParagraphs.indexOf(currentP);
        // Walk backward to find the nearest scene-heading at or before the cursor
        while (idx >= 0) {
            if (allParagraphs[idx].classList.contains('scene-heading')) {
                activeIndex = allSceneHeadings.indexOf(allParagraphs[idx]);
                break;
            }
            idx--;
        }
    }

    // Update active class on sidebar items
    const sidebarItems = scenesList.querySelectorAll('.sidebar-item[data-scene-index]');
    sidebarItems.forEach(item => {
        const itemIndex = parseInt(item.dataset.sceneIndex, 10);
        if (itemIndex === activeIndex) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
}

// --- AI Script Analysis Logic ---
const aiReportSidebar = document.getElementById('ai-report-sidebar');
const aiAnalysisContent = document.getElementById('ai-analysis-content');

document.getElementById('reports-ai-analysis').addEventListener('click', async () => {
    if (!window.pywebview) {
        alert("AI Analysis requires running through the Python app wrapper.");
        return;
    }
    syncDot.style.backgroundColor = '#f59e0b';
    syncText.textContent = "Analyzing script with AI...";

    window.currentAiReportName = appSettings.projectName || 'Untitled Project';

    // Send array of paragraphs to Python
    const paragraphs = Array.from(editor.querySelectorAll('p')).map(p => p.textContent);
    const result = await window.pywebview.api.analyze_script(paragraphs);

    syncDot.style.backgroundColor = '#10b981';
    syncText.textContent = "Analysis complete";

    // Format Line#X as clickable links to scroll the editor
    const formattedResult = result.replace(/Line#(\d+)/gi, '<a href="#" onclick="scrollToLine($1); return false;" style="color: #3b82f6; text-decoration: underline;">Line#$1</a>');

    aiAnalysisContent.innerHTML = formattedResult;
    aiReportSidebar.style.display = 'flex';
});

document.getElementById('btn-close-ai-sidebar').addEventListener('click', () => {
    aiReportSidebar.style.display = 'none';
});

document.getElementById('btn-export-ai-report').addEventListener('click', async () => {
    const content = aiAnalysisContent.innerText;
    if (!content) return;

    const exportName = window.currentAiReportName || appSettings.projectName || 'Untitled Project';

    if (window.pywebview) {
        const response = await window.pywebview.api.export_ai_report(content, exportName);
        if (!response.includes('cancelled')) alert(response);
    } else {
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = exportName + '_AI_Report.txt';
        a.click();
        URL.revokeObjectURL(url);
    }
});

window.scrollToLine = function (lineNum) {
    const index = parseInt(lineNum, 10) - 1;
    const paragraphs = editor.querySelectorAll('p');
    if (index >= 0 && index < paragraphs.length) {
        const p = paragraphs[index];
        p.scrollIntoView({ behavior: 'smooth', block: 'center' });

        const originalBg = p.style.backgroundColor;
        const originalTrans = p.style.transition;
        p.style.transition = 'none';
        p.style.backgroundColor = '#f59e0b55';
        setTimeout(() => {
            p.style.transition = 'background-color 1s ease';
            p.style.backgroundColor = originalBg;
            setTimeout(() => p.style.transition = originalTrans, 1000);
        }, 500);
    }
};

// ============================================================
//  REPORTS: Document Statistics
// ============================================================

function statRow(label, value, highlight) {
    return `<div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background:#1a232c; border-radius:6px; border-left: 3px solid ${highlight || '#36424e'};">
        <span style="font-size:13px; color:var(--text-muted);">${label}</span>
        <span style="font-size:14px; font-weight:bold; color:white;">${value}</span>
    </div>`;
}

document.getElementById('reports-doc-stats')?.addEventListener('click', openDocStats);
document.getElementById('reports-check-format')?.addEventListener('click', openCheckFormat);

function openDocStats() {
    const paras = Array.from(editor.querySelectorAll('p'));
    const pageHeightPixels = 11 * 96;
    const pages = Math.max(1, Math.ceil(editor.scrollHeight / pageHeightPixels));

    // Count by element type
    const counts = { 'scene-heading':0, action:0, character:0, dialogue:0, parenthetical:0, transition:0, shot:0, other:0 };
    const charDialogueCounts = {};
    let lastChar = null;
    let totalWords = 0;
    let dialogueWords = 0;
    let actionWords = 0;

    paras.forEach(p => {
        const type = Array.from(p.classList).find(c => counts[c] !== undefined) || 'other';
        const text = p.textContent.replace(/\u200B/g, '').trim();
        if (!text) return;

        counts[type] = (counts[type] || 0) + 1;
        const wc = text.split(/\s+/).filter(w => w.length > 0).length;
        totalWords += wc;

        if (type === 'character') {
            lastChar = text.replace(/\(.*?\)/g, '').trim();
        } else if (type === 'dialogue') {
            dialogueWords += wc;
            if (lastChar) {
                charDialogueCounts[lastChar] = (charDialogueCounts[lastChar] || 0) + 1;
            }
        } else if (type === 'action') {
            actionWords += wc;
            lastChar = null;
        } else {
            lastChar = null;
        }
    });

    const uniqueChars = Object.keys(charDialogueCounts).length;
    const readMinutes = Math.max(1, Math.round(pages));
    const topChars = Object.entries(charDialogueCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6);

    const topCharHtml = topChars.length
        ? `<div style="background:#1a232c; border-radius:6px; padding:10px 12px;">
            <p style="font-size:11px; color:var(--text-muted); margin:0 0 8px 0; text-transform:uppercase; letter-spacing:0.05em;">Dialogue Lines per Character</p>
            ${topChars.map(([name, ct]) => {
                const maxCt = topChars[0][1];
                const pct = Math.round((ct / maxCt) * 100);
                return `<div style="margin-bottom:6px;">
                    <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:2px;">
                        <span style="color:white;">${name}</span><span style="color:#10b981;">${ct}</span>
                    </div>
                    <div style="background:#0d1b2a; border-radius:3px; height:4px;">
                        <div style="background:#1b8adb; width:${pct}%; height:4px; border-radius:3px;"></div>
                    </div>
                </div>`;
            }).join('')}
          </div>`
        : '';

    document.getElementById('doc-stats-body').innerHTML = `
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
            ${statRow('Total Words', totalWords.toLocaleString(), '#1b8adb')}
            ${statRow('Pages', pages, '#1b8adb')}
            ${statRow('Scenes', counts['scene-heading'], '#f59e0b')}
            ${statRow('Speaking Characters', uniqueChars, '#f59e0b')}
            ${statRow('Dialogue Lines', counts['dialogue'], '#10b981')}
            ${statRow('Action Lines', counts['action'], '#10b981')}
            ${statRow('Transitions', counts['transition'], '#36424e')}
            ${statRow('Est. Read Time', `~${readMinutes} min`, '#8b5cf6')}
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:2px;">
            ${statRow('Dialogue Words', dialogueWords.toLocaleString(), '#36424e')}
            ${statRow('Action Words', actionWords.toLocaleString(), '#36424e')}
        </div>
        ${topCharHtml}`;

    document.getElementById('doc-stats-modal').style.display = 'flex';
}

document.getElementById('btn-close-doc-stats').addEventListener('click', () => {
    document.getElementById('doc-stats-modal').style.display = 'none';
});


// ============================================================
//  REPORTS: Check Formatting
// ============================================================

function openCheckFormat() {
    const paras = Array.from(editor.querySelectorAll('p'));
    const issues = [];

    function addIssue(lineNum, severity, rule, detail, para) {
        issues.push({ lineNum, severity, rule, detail, para });
    }

    const SCENE_PREFIXES = /^(INT\.|EXT\.|INT\/EXT\.|I\/E\.|INTERIOR|EXTERIOR)/i;
    const VALID_TRANSITIONS = /TO:$|FADE IN:|FADE OUT\.|SMASH CUT:|MATCH CUT:|CUT TO BLACK\./i;

    let lineNum = 0;
    let prevType = null;
    let consecutiveActionLines = 0;

    paras.forEach((p, idx) => {
        const text = p.textContent.replace(/\u200B/g, '').trim();
        if (!text) { prevType = null; return; }
        lineNum++;

        const type = ['scene-heading','action','character','dialogue','parenthetical','transition','shot']
            .find(t => p.classList.contains(t)) || 'other';

        // Rule 1 – Dialogue without a character line above it
        if (type === 'dialogue' && prevType !== 'character' && prevType !== 'parenthetical' && prevType !== 'dialogue') {
            addIssue(lineNum, 'error', 'Orphaned Dialogue', `Dialogue line has no Character name above it.`, p);
        }

        // Rule 2 – Character name not in ALL CAPS
        if (type === 'character') {
            const name = text.replace(/\(.*?\)/g, '').trim();
            if (name !== name.toUpperCase()) {
                addIssue(lineNum, 'warning', 'Character Not Uppercase', `"${name}" — character names must be ALL CAPS.`, p);
            }
        }

        // Rule 3 – Scene heading not starting with INT./EXT.
        if (type === 'scene-heading' && !SCENE_PREFIXES.test(text)) {
            addIssue(lineNum, 'warning', 'Scene Heading Format', `"${text.slice(0,40)}" — should start with INT. or EXT.`, p);
        }

        // Rule 4 – Parenthetical not following character or dialogue
        if (type === 'parenthetical' && prevType !== 'character' && prevType !== 'dialogue') {
            addIssue(lineNum, 'error', 'Orphaned Parenthetical', `Parenthetical not inside dialogue.`, p);
        }

        // Rule 5 – Consecutive character lines (forgot to add dialogue)
        if (type === 'character' && prevType === 'character') {
            addIssue(lineNum, 'error', 'Missing Dialogue', `Character line follows another character line — missing dialogue?`, p);
        }

        // Rule 6 – Very long unbroken action block (> 8 consecutive action lines)
        if (type === 'action') {
            consecutiveActionLines++;
            if (consecutiveActionLines === 9) {
                addIssue(lineNum, 'info', 'Long Action Block', `9+ consecutive action lines — consider breaking up the block.`, p);
            }
        } else {
            consecutiveActionLines = 0;
        }

        // Rule 7 – Transition not in ALL CAPS
        if (type === 'transition' && text !== text.toUpperCase()) {
            addIssue(lineNum, 'warning', 'Transition Not Uppercase', `"${text}" — transitions should be ALL CAPS.`, p);
        }

        // Rule 8 – Transition doesn't match common patterns (info only)
        if (type === 'transition' && !VALID_TRANSITIONS.test(text)) {
            addIssue(lineNum, 'info', 'Unusual Transition', `"${text}" — doesn't match standard transition formats.`, p);
        }

        prevType = type;
    });

    const errors   = issues.filter(i => i.severity === 'error').length;
    const warnings = issues.filter(i => i.severity === 'warning').length;
    const infos    = issues.filter(i => i.severity === 'info').length;

    const severityStyle = { error: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };
    const severityIcon  = { error: '🔴', warning: '🟡', info: '🔵' };

    const summaryEl = document.getElementById('check-format-summary');
    if (issues.length === 0) {
        summaryEl.innerHTML = `<span style="color:#10b981; font-weight:bold;">✅ No formatting issues found — script looks great!</span>`;
    } else {
        summaryEl.innerHTML =
            `Found <strong style="color:#ef4444;">${errors} error${errors !== 1 ? 's' : ''}</strong>, ` +
            `<strong style="color:#f59e0b;">${warnings} warning${warnings !== 1 ? 's' : ''}</strong>, ` +
            `<strong style="color:#3b82f6;">${infos} note${infos !== 1 ? 's' : ''}</strong>.`;
    }

    const counterEl = document.getElementById('check-format-issue-counter');
    if (counterEl) {
        counterEl.textContent = issues.length === 0 ? '' : `${issues.length} issue${issues.length !== 1 ? 's' : ''}`;
    }

    const bodyEl = document.getElementById('check-format-body');
    if (issues.length === 0) {
        bodyEl.innerHTML = `<div style="text-align:center; padding:30px; color:var(--text-muted); font-size:13px;">Nothing to report.</div>`;
    } else {
        bodyEl.innerHTML = issues.map(issue =>
            `<div style="display:flex; gap:10px; align-items:flex-start; background:#1a232c; border-left:3px solid ${severityStyle[issue.severity]}; border-radius:4px; padding:8px 10px;">
                <span style="font-size:14px; flex-shrink:0;">${severityIcon[issue.severity]}</span>
                <div style="flex:1; min-width:0;">
                    <div style="display:flex; gap:8px; align-items:baseline; flex-wrap:wrap;">
                        <span style="font-size:12px; font-weight:bold; color:${severityStyle[issue.severity]};">${issue.rule}</span>
                        <a href="#" onclick="scrollToLine(${issue.lineNum}); return false;"
                           style="font-size:11px; color:#3b82f6; text-decoration:underline; flex-shrink:0;">Line #${issue.lineNum}</a>
                    </div>
                    <div style="font-size:12px; color:var(--text-muted); margin-top:2px; word-break:break-word;">${issue.detail}</div>
                </div>
            </div>`
        ).join('');
    }

    document.getElementById('check-format-modal').style.display = 'flex';
}

document.getElementById('btn-close-check-format').addEventListener('click', () => {
    document.getElementById('check-format-modal').style.display = 'none';
});

// --- Draggable Check Formatting Panel ---
const checkFormatContent = document.getElementById('check-format-content');
const checkFormatHeader  = document.getElementById('check-format-header');

let isCheckFormatDragging = false;
let cfDragOffsetX = 0, cfDragOffsetY = 0;

if (checkFormatHeader && checkFormatContent) {
    checkFormatHeader.addEventListener('mousedown', (e) => {
        isCheckFormatDragging = true;
        const rect = checkFormatContent.getBoundingClientRect();
        cfDragOffsetX = e.clientX - rect.left;
        cfDragOffsetY = e.clientY - rect.top;
        checkFormatContent.style.right = 'auto';
        checkFormatContent.style.bottom = 'auto';
    });

    document.addEventListener('mousemove', (e) => {
        if (isCheckFormatDragging) {
            checkFormatContent.style.left = (e.clientX - cfDragOffsetX) + 'px';
            checkFormatContent.style.top  = (e.clientY - cfDragOffsetY) + 'px';
        }
    });

    document.addEventListener('mouseup', () => {
        isCheckFormatDragging = false;
    });
}

