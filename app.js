// --- 1. 全局变量和数据预处理 ---

const MAX_PIECES = 18;
// 棋盘总格子数
const TOTAL_SLOTS = 232;

const pieceSynergyMap = {};
synergyData.forEach(synergy => {
    synergy.pieces.forEach(pieceName => {
        if (pieceMasterData[pieceName]) {
            if (!pieceSynergyMap[pieceName]) {
                pieceSynergyMap[pieceName] = [];
            }
            pieceSynergyMap[pieceName].push(synergy.id);
        } else {
            console.warn(`数据警告: 羁绊 "${synergy.name}" 中的棋子 "${pieceName}" 不存在。`);
        }
    });
});

const pieceData = Object.keys(pieceMasterData).map((pieceName, index) => {
    const masterInfo = pieceMasterData[pieceName];
    const synergies = pieceSynergyMap[pieceName] || [];
    
    return {
        id: String(index + 1),
        name: pieceName,
        quality: masterInfo.quality,
        img: masterInfo.img,
        jiban: synergies.join(','),
        jineng: masterInfo.jineng || "暂无技能描述",
        // --- 新增字段 ---
        attackType: masterInfo.attackType || "",  // 内功/外功
        rangeType: masterInfo.rangeType || "",    // 近战/远程
        utilityType: masterInfo.utilityType || "" // 破盾/增益等
    };
});

let draggedPieceInfo = null; 
let dragOriginSlot = null;

// --- V43 筛选相关变量 ---
let activeFilterTags = new Set();
const filterCategories = {
    attackType: ["内功", "外功", "无攻击"],
    rangeType: ["单体", "范围"],
    utilityType: ["破盾", "控制", "增益", "驱散", "核心", "金币"]
};

let pieceCountEl, synergyTooltip, pieceTooltip, pieceList, messageBox, middlePanel;
let messageTimer;

// --- 2. 页面初始化 ---

document.addEventListener('DOMContentLoaded', () => {
    
    pieceCountEl = document.getElementById('piece-count');
    synergyTooltip = document.getElementById('synergy-tooltip');
    pieceTooltip = document.getElementById('piece-tooltip'); // 获取棋子悬浮窗元素
    pieceList = document.getElementById('piece-list');
    messageBox = document.getElementById('message-box');
    middlePanel = document.getElementById('middle-panel'); 
    startBeijingClock();
    initTouchSupport();

    // --- V43: 初始化筛选器 UI ---
    initFilterControls();

    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            const footerCredits = document.getElementById('footer-credits-wrapper');
            if (footerCredits) {
                // 只有当点击 "金" 选项卡时才显示，其他情况(紫/蓝/筛选)都隐藏
                if (tab.dataset.quality === '金') {
                    footerCredits.style.display = 'block';
                } else {
                    footerCredits.style.display = 'none';
                }
            }




            // V43: 切换筛选面板显示逻辑
            const filterPanel = document.getElementById('filter-options');
            if (tab.dataset.quality === 'filter') {
                filterPanel.style.display = 'block';
                populatePieceList('filter');
            } else {
                filterPanel.style.display = 'none';
                populatePieceList(tab.dataset.quality);
            }
        });
    });
    
    // 默认触发点击第一个标签(金)
    document.querySelector('.tab-btn[data-quality="金"]').click();
    
    initFormation(); 
    updateSynergies();

    document.getElementById('clear-board-btn').addEventListener('click', clearBoard);
    document.getElementById('export-btn').addEventListener('click', exportLayout);
    document.getElementById('import-btn').addEventListener('click', () => importLayout()); 
    document.getElementById('toggle-bg-btn').addEventListener('click', toggleBackgroundTheme);

    // --- V40: 便利贴折叠逻辑 ---
    const noteWrapper = document.getElementById('stickyNote');
    const toggleBtn = document.getElementById('toggleNoteBtn');

    if (noteWrapper && toggleBtn) {
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isCollapsed = noteWrapper.classList.toggle('collapsed');
            toggleBtn.textContent = isCollapsed ? '➕' : '➖';
        });
        
        const handle = document.getElementById('notesHandle');
        if(handle) {
            handle.addEventListener('dblclick', (e) => {
                if(e.target !== toggleBtn) toggleBtn.click();
            });
        }
    }

    // V39: 初始化便利贴 - 拖拽 + 全向缩放
    const stickyNote = document.getElementById("stickyNote");
    const notesHandle = document.getElementById("notesHandle");
    if (stickyNote && notesHandle) {
        makeDraggable(stickyNote, notesHandle);
        makeResizable(stickyNote);
    }
});

// --- 3. 核心功能函数 ---

// --- V43: 动态生成筛选按钮 ---
function initFilterControls() {
    const container = document.getElementById('filter-options');
    container.innerHTML = '';

    // 映射分类显示名称
    const categoryMap = { 
        attackType: "输出", 
        rangeType: "范围", 
        utilityType: "功能" 
    };

    for (const [key, label] of Object.entries(categoryMap)) {
        // 检查数据中实际存在的标签，避免显示无用的空按钮
        const availableTags = new Set();
        pieceData.forEach(p => {
            if (p[key]) availableTags.add(p[key]);
        });
        // 按预设顺序排序
        const sortedTags = filterCategories[key].filter(t => availableTags.has(t));
        
        if (sortedTags.length > 0) {
            const groupDiv = document.createElement('div');
            groupDiv.className = 'filter-group';
            
            const labelSpan = document.createElement('span');
            labelSpan.className = 'filter-label';
            labelSpan.textContent = label + ":";
            groupDiv.appendChild(labelSpan);

            sortedTags.forEach(tag => {
                const btn = document.createElement('button');
                btn.className = 'filter-tag-btn';
                btn.textContent = tag;
                btn.onclick = () => toggleFilterTag(tag, btn);
                groupDiv.appendChild(btn);
            });
            container.appendChild(groupDiv);
        }
    }
}

function toggleFilterTag(tag, btnElement) {
    if (activeFilterTags.has(tag)) {
        activeFilterTags.delete(tag);
        btnElement.classList.remove('active');
    } else {
        activeFilterTags.add(tag);
        btnElement.classList.add('active');
    }
    // 实时刷新列表
    populatePieceList('filter');
}

// --- V39: 全向缩放逻辑 ---
function makeResizable(div) {
    const resizers = div.querySelectorAll('.resizer');
    const minW = 180;
    const minH = 150;
    
    let original_width = 0;
    let original_height = 0;
    let original_x = 0;
    let original_y = 0;
    let original_mouse_x = 0;
    let original_mouse_y = 0;
    
    for (let i = 0; i < resizers.length; i++) {
        const currentResizer = resizers[i];
        currentResizer.addEventListener('mousedown', function(e) {
            e.preventDefault();
            e.stopPropagation(); 
            
            original_width = parseFloat(getComputedStyle(div, null).getPropertyValue('width').replace('px', ''));
            original_height = parseFloat(getComputedStyle(div, null).getPropertyValue('height').replace('px', ''));
            original_x = div.getBoundingClientRect().left;
            original_y = div.getBoundingClientRect().top;
            original_mouse_x = e.pageX;
            original_mouse_y = e.pageY;
            
            const isT = currentResizer.classList.contains('resizer-t') || currentResizer.classList.contains('resizer-tl') || currentResizer.classList.contains('resizer-tr');
            const isB = currentResizer.classList.contains('resizer-b') || currentResizer.classList.contains('resizer-bl') || currentResizer.classList.contains('resizer-br');
            const isL = currentResizer.classList.contains('resizer-l') || currentResizer.classList.contains('resizer-tl') || currentResizer.classList.contains('resizer-bl');
            const isR = currentResizer.classList.contains('resizer-r') || currentResizer.classList.contains('resizer-tr') || currentResizer.classList.contains('resizer-br');
            
            window.addEventListener('mousemove', resize);
            window.addEventListener('mouseup', stopResize);
            
            function resize(e) {
                if (isR) {
                    const width = original_width + (e.pageX - original_mouse_x);
                    if (width > minW) div.style.width = width + 'px';
                }
                else if (isL) {
                    const width = original_width - (e.pageX - original_mouse_x);
                    if (width > minW) {
                        div.style.width = width + 'px';
                        div.style.left = (original_x + (e.pageX - original_mouse_x) - div.offsetParent.getBoundingClientRect().left) + 'px';
                    }
                }
                if (isB) {
                    const height = original_height + (e.pageY - original_mouse_y);
                    if (height > minH) div.style.height = height + 'px';
                }
                else if (isT) {
                    const height = original_height - (e.pageY - original_mouse_y);
                    if (height > minH) {
                        div.style.height = height + 'px';
                        div.style.top = (original_y + (e.pageY - original_mouse_y) - div.offsetParent.getBoundingClientRect().top) + 'px';
                    }
                }
            }
            
            function stopResize() {
                window.removeEventListener('mousemove', resize);
                window.removeEventListener('mouseup', stopResize);
            }
        });
    }
}

function makeDraggable(element, handle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    handle.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
        e = e || window.event;
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }
    function elementDrag(e) {
        e = e || window.event;
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        element.style.top = (element.offsetTop - pos2) + "px";
        element.style.left = (element.offsetLeft - pos1) + "px";
        element.style.bottom = 'auto';
        element.style.right = 'auto';
    }
    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
    }
}

function formatDoc(cmd, value) {
    document.execCommand(cmd, false, value);
    const notes = document.querySelector('.board-notes');
    if(notes) notes.focus();
}

// --- V43: 重构 populatePieceList 支持筛选模式 ---
function populatePieceList(quality = '金') {
    pieceList.innerHTML = '';
    
    // 模式1: 普通按品质展示
    if (quality !== 'filter') {
        pieceList.className = ''; // 恢复 Grid 布局
        const filteredPieces = pieceData.filter(p => p.quality === quality);
        sortAndRenderPieces(filteredPieces, pieceList);
    } 
    // 模式2: 筛选模式
    else {
        pieceList.className = 'filter-mode'; // 切换为 Block 布局以支持标题
        
        // 筛选逻辑：AND (必须包含所有选中的标签)
        let resultPieces = pieceData.filter(p => {
            if (activeFilterTags.size === 0) return true;
            const pieceTags = [p.attackType, p.rangeType, p.utilityType];
            for (const tag of activeFilterTags) {
                if (!pieceTags.includes(tag)) return false;
            }
            return true;
        });

        if (resultPieces.length === 0) {
            pieceList.innerHTML = '<div style="text-align:center; color:#999; padding:20px;">无符合条件的棋子</div>';
            return;
        }

        // 分组渲染：金 -> 紫 -> 蓝
        const qualityGroups = ['金', '紫', '蓝'];
        qualityGroups.forEach(q => {
            const piecesInGroup = resultPieces.filter(p => p.quality === q);
            if (piecesInGroup.length > 0) {
                // 创建标题
                const header = document.createElement('div');
                header.className = 'group-header';
                header.style.borderColor = getQualityColor(q); // 使用对应颜色的下划线
                // 文字颜色稍微深一点
                header.style.color = '#495057';
                header.textContent = `${q} (${piecesInGroup.length})`;
                pieceList.appendChild(header);

                // 创建网格容器
                const gridDiv = document.createElement('div');
                gridDiv.className = 'group-grid';
                pieceList.appendChild(gridDiv);

                sortAndRenderPieces(piecesInGroup, gridDiv);
            }
        });
    }
}

// 通用排序和渲染逻辑
function sortAndRenderPieces(pieces, container) {
    pieces.sort((a, b) => {
        const synergyA = a.jiban.split(',')[0] || 'zzzz';
        const synergyB = b.jiban.split(',')[0] || 'zzzz';
        if (synergyA !== synergyB) {
            return synergyA.localeCompare(synergyB, 'zh-Hans-CN');
        }
        return a.name.localeCompare(b.name, 'zh-Hans-CN');
    });
    
    for (const piece of pieces) {
        const pieceEl = createPieceElement(piece); 
        
        pieceEl.addEventListener('dragstart', (e) => {
            hidePieceTooltip(); 
            draggedPieceInfo = { type: 'new', key: piece.id };
            e.dataTransfer.setData('text/plain', piece.id);
            dragOriginSlot = null;
        });

        pieceEl.addEventListener('mouseenter', (e) => showPieceTooltip(piece, e));
        pieceEl.addEventListener('mousemove', movePieceTooltip);
        pieceEl.addEventListener('mouseleave', hidePieceTooltip);
        
        container.appendChild(pieceEl);
    }
}

// --- V41: 更新后的棋子技能悬浮窗函数 (带胶囊标签) ---
function showPieceTooltip(piece, e) {
    // 格式化技能描述中的换行符
    const formattedSkill = piece.jineng.replace(/\n/g, '<br>');
    
    // 1. 生成名字后面的羁绊胶囊
    const synergies = piece.jiban ? piece.jiban.split(',') : [];
    const synergyTags = synergies.map(s => `<span class="tag-synergy">${s}</span>`).join('');

    // 2. 生成三个特性胶囊
    let tagsHtml = '<div class="piece-tags-container">';
    
    // 蓝色：内/外功
    if (piece.attackType) {
        tagsHtml += `<span class="piece-tag tag-blue">${piece.attackType}</span>`;
    }
    // 红色：近战/远程
    if (piece.rangeType) {
        tagsHtml += `<span class="piece-tag tag-red">${piece.rangeType}</span>`;
    }
    // 金色：功能
    if (piece.utilityType) {
        tagsHtml += `<span class="piece-tag tag-gold">${piece.utilityType}</span>`;
    }
    tagsHtml += '</div>';

    // 如果三个都没填，就不显示容器
    if (!piece.attackType && !piece.rangeType && !piece.utilityType) {
        tagsHtml = ''; 
    }

    const html = `
        <h4 style="color: ${getQualityColor(piece.quality)}">
            ${piece.name}${synergyTags}
        </h4>
        ${tagsHtml}
        <div class="piece-tooltip-skill">
            ${formattedSkill}
        </div>
    `;
    
    pieceTooltip.innerHTML = html;
    pieceTooltip.style.display = 'block';
    movePieceTooltip(e);
}


function movePieceTooltip(e) {
    const rect = pieceTooltip.getBoundingClientRect();
    const wrapper = document.getElementById('page-wrapper').getBoundingClientRect();
    
    // 默认显示在鼠标右下侧，+20px 偏移避免遮挡
    let x = e.pageX + 20;
    let y = e.pageY + 20;
    
    // 边界检测
    if (x + rect.width > wrapper.right) {
        x = e.pageX - rect.width - 20;
    }
    if (y + rect.height > wrapper.bottom) {
        y = e.pageY - rect.height - 10;
    }

    pieceTooltip.style.left = x + 'px';
    pieceTooltip.style.top = y + 'px';
}

function hidePieceTooltip() {
    pieceTooltip.style.display = 'none';
}

function getQualityColor(quality) {
    switch(quality) {
        case '金': return '#ffc107';
        case '紫': return '#bd69ff'; 
        case '蓝': return '#5ba4fc'; 
        default: return '#fff';
    }
}

function initFormation() {
    const container = document.getElementById('boardGridContainer');
    if (!container) return;
    
    container.innerHTML = '';
    
    const mainBoardConfig = {
        1: [8, 9, 12, 13],
        2: [8, 9, 12, 13],
        3: [8, 9, 12, 13],
        4: [1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 13, 14, 15, 16, 17, 18, 19, 20],
        5: [1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 13, 14, 15, 16, 17, 18, 19, 20],
        6: []
    };
    
    for (let row = 1; row <= 6; row++) {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'board-row';
        for (let col = 1; col <= 20; col++) {
            const isItem = mainBoardConfig[row] && mainBoardConfig[row].includes(col);
            const slot = createBoardSlot(row, col, 'main-board', isItem);
            rowDiv.appendChild(slot);
        }
        container.appendChild(rowDiv);
    }

    const triangleCols = [19, 18, 17, 16, 15, 14, 13];
    
    triangleCols.forEach((colCount, index) => {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'board-row';
        const currentRow = 7 + index;

        for (let col = 1; col <= colCount; col++) {
            const slot = createBoardSlot(currentRow, col, `triangle-${colCount}`, true);
            rowDiv.appendChild(slot);
        }
        container.appendChild(rowDiv);
    });

    setTimeout(() => {
        if(middlePanel) middlePanel.scrollTop = 100;
    }, 100);
}

function createBoardSlot(row, col, tableId, isItem) {
    const slot = document.createElement('div');
    slot.className = 'board-slot';
    slot.dataset.row = row;
    slot.dataset.col = col;
    
    if (isItem) {
        slot.classList.add('item');
        const itemBg = document.createElement('div');
        itemBg.className = 'item-bg';
        slot.appendChild(itemBg);
        
        slot.addEventListener('dragover', (e) => { e.preventDefault(); slot.classList.add('drag-over'); });
        slot.addEventListener('dragleave', (e) => { slot.classList.remove('drag-over'); });
        slot.addEventListener('drop', handleDrop);
        
        slot.addEventListener('contextmenu', (e) => {
            e.preventDefault(); 
            const piece = slot.querySelector('.piece');
            const name = slot.querySelector('.piece-name-wrapper');
            if (piece) piece.remove();
            if (name) name.remove();
            updateSynergies();
        });
    }
    return slot;
}

document.getElementById('chessboard').addEventListener('dragstart', (e) => {
    if (e.target.classList.contains('piece')) {
        const piece = e.target;
        draggedPieceInfo = { type: 'move', key: piece.dataset.pieceKey };
        dragOriginSlot = piece.closest('.board-slot'); 
        e.dataTransfer.setData('text/plain', piece.dataset.pieceKey);
        setTimeout(() => {
            const pieceEl = dragOriginSlot.querySelector('.piece');
            const nameEl = dragOriginSlot.querySelector('.piece-name-wrapper');
            if(pieceEl) pieceEl.style.visibility = 'hidden';
            if(nameEl) nameEl.style.visibility = 'hidden';
        }, 0);
    }
});

document.addEventListener('dragend', (e) => {
    if (dragOriginSlot) {
        const pieceEl = dragOriginSlot.querySelector('.piece');
        const nameEl = dragOriginSlot.querySelector('.piece-name-wrapper');
        if(pieceEl) pieceEl.style.visibility = 'visible';
        if(nameEl) nameEl.style.visibility = 'visible';
    }
    document.querySelectorAll('.board-slot.drag-over').forEach(c => c.classList.remove('drag-over'));
    draggedPieceInfo = null;
    dragOriginSlot = null;
});

function createPieceElement(pieceInfo) {
    const el = document.createElement('div');
    el.draggable = true; 
    el.id = 'piece-' + pieceInfo.id + '-' + Date.now(); 
    el.classList.add('piece');
    if (pieceInfo.quality) el.classList.add('quality-' + pieceInfo.quality);
    el.dataset.pieceKey = pieceInfo.id;
    el.dataset.faction = pieceInfo.jiban;
    el.dataset.pieceName = pieceInfo.name;
    
    el.innerHTML = `
        <div class="piece-img-placeholder">${pieceInfo.name[0]}</div>
        <img class="piece-avatar" src="${pieceInfo.img}" alt="${pieceInfo.name}" draggable="false" onerror="this.style.display='none';">
        <div class="piece-name">${pieceInfo.name}</div>
    `;
    return el;
}

function createBoardPieceElements(pieceInfo) {
    const pieceEl = document.createElement('div');
    pieceEl.draggable = true;
    pieceEl.classList.add('piece');
    if (pieceInfo.quality) pieceEl.classList.add('quality-' + pieceInfo.quality);
    pieceEl.dataset.pieceKey = pieceInfo.id;
    pieceEl.dataset.faction = pieceInfo.jiban;
    pieceEl.dataset.pieceName = pieceInfo.name;

    pieceEl.innerHTML = `
        <div class="piece-img-placeholder">${pieceInfo.name[0]}</div>
        <img class="piece-avatar" src="${pieceInfo.img}" alt="${pieceInfo.name}" draggable="false" onerror="this.style.display='none';">
    `;

    const nameEl = document.createElement('div');
    nameEl.className = 'piece-name-wrapper';
    nameEl.innerHTML = `<div class="piece-name">${pieceInfo.name}</div>`;
    return { pieceEl, nameEl };
}

function handleDrop(e) {
    e.preventDefault();
    const targetSlot = e.target.closest('.board-slot.item'); 
    if (!targetSlot || !draggedPieceInfo) {
        if(dragOriginSlot) {
             const p = dragOriginSlot.querySelector('.piece');
             const n = dragOriginSlot.querySelector('.piece-name-wrapper');
             if(p) p.style.visibility = 'visible';
             if(n) n.style.visibility = 'visible';
        }
        return; 
    }
    targetSlot.classList.remove('drag-over');
    const pieceInfo = pieceData.find(p => p.id === draggedPieceInfo.key);
    const existingPiece = targetSlot.querySelector('.piece');
    const existingName = targetSlot.querySelector('.piece-name-wrapper');
    
    if (draggedPieceInfo.type === 'new' && !existingPiece) {
        const piecesOnBoard = document.querySelectorAll('#chessboard .piece').length;
        if (piecesOnBoard >= MAX_PIECES) {
            showMessage("人口已达上限 (18)！");
            return;
        }
    }
    const { pieceEl: newPieceEl, nameEl: newNameEl } = createBoardPieceElements(pieceInfo); 

    if (existingPiece) {
        if (draggedPieceInfo.type === 'move') {
            const draggedPiece = dragOriginSlot.querySelector('.piece');
            const draggedName = dragOriginSlot.querySelector('.piece-name-wrapper');
            if (draggedPiece) draggedPiece.style.visibility = 'visible';
            if (draggedName) draggedName.style.visibility = 'visible';
            targetSlot.appendChild(draggedPiece);
            if(draggedName) targetSlot.appendChild(draggedName);
            dragOriginSlot.appendChild(existingPiece);
            if(existingName) dragOriginSlot.appendChild(existingName);
        } else {
            targetSlot.innerHTML = '<div class="item-bg"></div>';
            targetSlot.appendChild(newPieceEl);
            targetSlot.appendChild(newNameEl);
        }
    } else {
        targetSlot.innerHTML = '<div class="item-bg"></div>';
        if (draggedPieceInfo.type === 'move') {
            const draggedPiece = dragOriginSlot.querySelector('.piece');
            const draggedName = dragOriginSlot.querySelector('.piece-name-wrapper');
            if (draggedPiece) draggedPiece.style.visibility = 'visible';
            if (draggedName) draggedName.style.visibility = 'visible';
            targetSlot.appendChild(draggedPiece);
            if(draggedName) targetSlot.appendChild(draggedName);
        } else {
            targetSlot.appendChild(newPieceEl);
            targetSlot.appendChild(newNameEl);
        }
    }
    updateSynergies();
}

function updateSynergies() {
    const piecesOnBoard = document.querySelectorAll('#chessboard .piece');
    const count = piecesOnBoard.length;
    pieceCountEl.textContent = `(${count}/${MAX_PIECES})`;
    pieceCountEl.classList.toggle('full', count >= MAX_PIECES);

    const synergyList = document.getElementById('synergy-list');
    synergyList.innerHTML = ''; 

    const uniquePieceNames = new Set();
    piecesOnBoard.forEach(p => uniquePieceNames.add(p.dataset.pieceName));
    
    const factionCounts = {};
    uniquePieceNames.forEach(name => {
        (pieceSynergyMap[name] || []).forEach(synId => {
            factionCounts[synId] = (factionCounts[synId] || 0) + 1;
        });
    });

    let synergiesWithState = synergyData.map(syn => ({
        ...syn,
        count: factionCounts[syn.id] || 0,
        isActivated: (factionCounts[syn.id] || 0) >= syn.requiredCount
    }));

    synergiesWithState.sort((a, b) => {
        if (a.isActivated !== b.isActivated) return b.isActivated - a.isActivated;
        return b.count - a.count;
    });
    
    synergiesWithState.forEach(synergy => {
        const li = document.createElement('li');
        li.className = `synergy-item ${synergy.isActivated ? 'active' : ''} ${synergy.count >= synergy.pieces.length ? 'active-max' : ''}`;
        li.innerHTML = `
            <div class="synergy-item-info">${synergy.name} (${synergy.count}/${synergy.requiredCount})</div>
            <button class="add-synergy-btn" data-synergy-id="${synergy.id}">+</button>
        `;
        li.addEventListener('mouseenter', (e) => {
            showSynergyTooltip(synergy, uniquePieceNames, e);
            highlightSynergyPieces(synergy, true); 
        });
        li.addEventListener('mouseleave', () => {
            hideSynergyTooltip();
            highlightSynergyPieces(synergy, false); 
        });
        li.addEventListener('mousemove', moveSynergyTooltip);
        li.querySelector('.add-synergy-btn').addEventListener('click', (e) => {
            e.stopPropagation(); 
            addMissingSynergyPieces(synergy, uniquePieceNames);
        });
        synergyList.appendChild(li);
    });
}

function addMissingSynergyPieces(synergy, uniquePieceNamesOnBoard) {
    const currentCount = document.querySelectorAll('#chessboard .piece').length;
    const missingNames = synergy.pieces.filter(p => !uniquePieceNamesOnBoard.has(p));
    if (missingNames.length === 0) return showMessage("该羁绊棋子已全部在场！", "success");
    if (currentCount + missingNames.length > MAX_PIECES) return showMessage("人口不足！");
    const emptySlots = Array.from(document.querySelectorAll('#chessboard .board-slot.item')).filter(slot => !slot.querySelector('.piece'));
    if (emptySlots.length < missingNames.length) return showMessage("棋盘空格不足！");
    missingNames.forEach((name, i) => {
        const info = pieceData.find(p => p.name === name);
        if (info && emptySlots[i]) {
            const { pieceEl, nameEl } = createBoardPieceElements(info);
            emptySlots[i].appendChild(pieceEl);
            emptySlots[i].appendChild(nameEl);
        }
    });
    updateSynergies();
}

function highlightSynergyPieces(synergy, isHighlighting) {
    const names = new Set(synergy.pieces);
    document.querySelectorAll('#chessboard .piece').forEach(p => {
        if (names.has(p.dataset.pieceName)) {
            p.classList.toggle('piece-highlight', isHighlighting);
        }
    });
}

// --- V42 更新: 羁绊悬浮窗现在显示头像和激活状态 ---
function showSynergyTooltip(synergy, uniqueNames, e) {
    const piecesHtml = synergy.pieces.map(name => {
        const isPresent = uniqueNames.has(name);
        // 从全局 pieceData 中查找图片信息
        const pieceInfo = pieceData.find(p => p.name === name);
        const imgUrl = pieceInfo ? pieceInfo.img : '';
        const qualityClass = pieceInfo ? `quality-${pieceInfo.quality}` : '';

        return `
            <div class="synergy-tooltip-item ${isPresent ? 'active' : 'missing'}">
                <div class="synergy-tooltip-img-wrapper ${qualityClass}">
                    <img src="${imgUrl}" class="synergy-tooltip-img" onerror="this.style.display='none'">
                </div>
                <span class="synergy-tooltip-name">${name}</span>
            </div>
        `;
    }).join('');

    synergyTooltip.innerHTML = `
        <h4>${synergy.name}</h4>
        <div class="synergy-desc">${synergy.desc}</div>
        <div class="synergy-pieces-list">
            ${piecesHtml}
        </div>
    `;
    synergyTooltip.style.display = 'block';
    moveSynergyTooltip(e);
}

function hideSynergyTooltip() { synergyTooltip.style.display = 'none'; }

function moveSynergyTooltip(e) {
    const rect = synergyTooltip.getBoundingClientRect();
    const wrapper = document.getElementById('page-wrapper').getBoundingClientRect();
    let x = e.pageX + 15, y = e.pageY + 15;
    if (x + rect.width > wrapper.right) x = e.pageX - rect.width - 15;
    if (y + rect.height > wrapper.bottom) y = e.pageY - rect.height - 15;
    synergyTooltip.style.left = x + 'px'; synergyTooltip.style.top = y + 'px';
}

function showMessage(text, type = 'error') {
    clearTimeout(messageTimer);
    messageBox.textContent = text;
    messageBox.className = type === 'success' ? 'success' : '';
    messageBox.style.display = 'block';
    messageBox.style.opacity = '0'; messageBox.style.top = '-50px';
    requestAnimationFrame(() => {
        messageBox.style.top = '20px'; messageBox.style.opacity = '1';
    });
    messageTimer = setTimeout(() => {
        messageBox.style.top = '-50px'; messageBox.style.opacity = '0';
        setTimeout(() => messageBox.style.display = 'none', 300);
    }, 2500);
}

function clearBoard() {
    document.querySelectorAll('#chessboard .board-slot.item').forEach(s => s.innerHTML = '<div class="item-bg"></div>');
    const notes = document.querySelector('.board-notes');
    if(notes) notes.innerText = '';
    updateSynergies();
}

function exportLayout() {
    const allSlots = Array.from(document.querySelectorAll('.board-grid-container .board-slot'));
    if (allSlots.length !== TOTAL_SLOTS) return showMessage(`导出失败！格子数异常 (${allSlots.length})`);
    let result = [], zeroCount = 0;
    allSlots.forEach(slot => {
        const piece = slot.querySelector('.piece');
        const id = piece ? piece.dataset.pieceKey : "0";
        if (id === "0") zeroCount++;
        else {
            if (zeroCount > 0) { result.push(`z${zeroCount}`); zeroCount = 0; }
            result.push(id);
        }
    });
    if (zeroCount > 0) result.push(`z${zeroCount}`);
    const str = result.join(',');
    navigator.clipboard.writeText(str).then(() => showMessage("布局代码已复制！", "success")).catch(() => showMessage("复制失败"));
}

function importLayout(str) {
    const val = str || document.getElementById('import-input').value;
    if (!val) return showMessage("请输入布局代码");
    let ids = [];
    try {
        val.split(',').forEach(item => {
            if (item.startsWith('z')) {
                for(let i=0; i<parseInt(item.substring(1)); i++) ids.push("0");
            } else if (item) ids.push(item);
        });
    } catch(e) { return showMessage("代码格式错误"); }
    if (ids.length !== TOTAL_SLOTS) return showMessage(`代码无效 (长度 ${ids.length}/${TOTAL_SLOTS})`);
    clearBoard();
    const allSlots = Array.from(document.querySelectorAll('.board-grid-container .board-slot'));
    let placed = 0;
    ids.forEach((id, i) => {
        if (id !== "0" && placed < MAX_PIECES) {
            const info = pieceData.find(p => p.id === id);
            const slot = allSlots[i];
            if (info && slot && slot.classList.contains('item')) {
                const { pieceEl, nameEl } = createBoardPieceElements(info);
                slot.appendChild(pieceEl); slot.appendChild(nameEl);
                placed++;
            }
        }
    });
    updateSynergies();
    document.getElementById('import-input').value = '';
    if(!str) showMessage("布局导入成功！", "success");
}

const themes = ['theme-green', 'theme-dark', 'theme-blue'];
let currentThemeIndex = 0;
function toggleBackgroundTheme() {
    const el = document.getElementById('chessboard');
    el.classList.remove(themes[currentThemeIndex]);
    currentThemeIndex = (currentThemeIndex + 1) % themes.length;
    el.classList.add(themes[currentThemeIndex]);
}

// --- 顶部时钟功能 ---
function startBeijingClock() {
    const timeEl = document.querySelector('.clock-time');
    const tipsEl = document.querySelector('.clock-tips');
    if (!timeEl || !tipsEl) return;

    function update() {
        // 获取当前时间，并强制转换为北京时间 (UTC+8)
        const now = new Date();
        // 转换时区逻辑：无论用户在哪，都显示北京时间
        // 方法：获取UTC时间 -> 加上8小时偏移
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        const beijingTime = new Date(utc + (3600000 * 8));

        const hours = beijingTime.getHours();
        const minutes = beijingTime.getMinutes();
        const seconds = beijingTime.getSeconds();

        // 补零函数
        const pad = (n) => n < 10 ? '0' + n : n;
        
        // 更新时间显示
        timeEl.textContent = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

        // 更新温馨提示
        let msg = "";
        let isLate = false;

        if (hours >= 5 && hours < 9) msg = "☀️ 早安！一日之计在于晨";
        else if (hours >= 9 && hours < 12) msg = "☕ 加油！向着最强阵容进发";
        else if (hours >= 12 && hours < 14) msg = "🍱 午休时间，记得吃饭哦";
        else if (hours >= 14 && hours < 18) msg = "🍵 下午好，喝杯茶提提神";
        else if (hours >= 18 && hours < 23) msg = "🌙 晚上好，塔防模拟启动！";
        else if (hours >= 23 || hours < 2) {
            msg = "🥱 夜深了，注意保护肝脏...";
            isLate = true;
        } else {
            msg = "🛌 还不睡？头发要掉光啦！";
            isLate = true;
        }

        tipsEl.textContent = msg;
        
        // 如果是深夜，添加红色警告样式
        if (isLate) tipsEl.classList.add('late-night');
        else tipsEl.classList.remove('late-night');
    }

    update(); // 立即执行一次
    setInterval(update, 1000); // 每秒刷新
}


// --- 移动端适配：自动缩放棋盘 ---

// --- 移动端适配：自动缩放棋盘 ---
function autoScaleBoard() {
    const board = document.getElementById('chessboard');
    const wrapper = document.getElementById('page-wrapper');
    
    // 获取当前容器的可用宽度
    const availableWidth = wrapper.clientWidth;

    // 【关键修改】如果是手机/竖屏 (宽度小于 768px)，禁止 JS 缩放
    // 我们改用 CSS 的滚动条来处理，这样棋子不会太小
    if (availableWidth < 768) {
        board.style.transform = 'none';
        board.parentElement.style.height = 'auto';
        board.style.marginBottom = '0';
        return; // 直接结束，不执行下面的缩放逻辑
    }

    // --- 以下是电脑端的逻辑 (保持不变) ---
    const originalBoardWidth = 1080; 
    
    if (availableWidth < originalBoardWidth) {
        const scale = (availableWidth - 20) / originalBoardWidth;
        board.style.transform = `scale(${scale})`;
        const originalHeight = board.scrollHeight; 
        const newHeight = originalHeight * scale;
        board.parentElement.style.height = `${newHeight}px`;
        board.style.marginBottom = '0px'; 
    } else {
        board.style.transform = 'none';
        board.parentElement.style.height = 'auto';
    }
}

// 页面加载完成时计算一次
window.addEventListener('load', autoScaleBoard);

// 窗口大小改变（比如手机旋转）时重新计算
window.addEventListener('resize', autoScaleBoard);

// 这是一个防抖动优化，防止拖拽时频繁触发重绘（可选，但推荐）
let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(autoScaleBoard, 100);
});



// ==========================================
//   V45: 移动端触摸拖拽支持 (Touch Drag Polyfill)
// ==========================================

// 一个临时的浮动元素，用于跟随手指
let touchDragItem = null;
let touchDragInfo = null; // 存储 { key: '...', type: 'new'/'move', origin: slot }

// 初始化触摸监听 (在 DOMContentLoaded 里调用)
function initTouchSupport() {
    // 1. 监听棋子列表 (从侧边栏拖新棋子)
    document.getElementById('piece-list').addEventListener('touchstart', handleTouchStart, { passive: false });
    
    // 2. 监听棋盘 (移动已有的棋子)
    document.getElementById('chessboard').addEventListener('touchstart', handleTouchStart, { passive: false });

    // 全局移动和结束监听
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd, { passive: false });
}


function handleTouchStart(e) {
    // 找到被触摸的棋子元素
    const pieceEl = e.target.closest('.piece');
    if (!pieceEl) return;

    e.preventDefault(); // 防止屏幕滚动

    // 记录数据
    const pieceKey = pieceEl.dataset.pieceKey;
    const originSlot = pieceEl.closest('.board-slot');
    
    touchDragInfo = {
        key: pieceKey,
        type: originSlot ? 'move' : 'new', // 如果在格子里就是移动，否则是新上阵
        origin: originSlot,
        originalEl: pieceEl
    };

    // 创建一个浮动的“幽灵”棋子跟随手指
    createDragGhost(pieceEl, e.touches[0]);

    // 如果是移动棋盘上的棋子，暂时隐藏本体
    if (touchDragInfo.type === 'move') {
        pieceEl.style.opacity = '0.4';
    }
}

function createDragGhost(sourceEl, touch) {
    if (touchDragItem) touchDragItem.remove();

    touchDragItem = sourceEl.cloneNode(true);
    touchDragItem.style.position = 'fixed';
    touchDragItem.style.zIndex = '9999';
    touchDragItem.style.opacity = '0.8';
    touchDragItem.style.pointerEvents = 'none'; // 关键：让点击穿透它，这样 elementFromPoint 才能检测到下方的格子
    touchDragItem.style.width = '60px';
    touchDragItem.style.height = '60px';
    touchDragItem.style.transform = 'scale(1.2)'; // 稍微放大一点
    touchDragItem.style.left = (touch.clientX - 30) + 'px'; // 居中
    touchDragItem.style.top = (touch.clientY - 30) + 'px';
    
    // 移除一些可能干扰样式的类
    touchDragItem.style.margin = '0';
    
    document.body.appendChild(touchDragItem);
}

function handleTouchMove(e) {
    if (!touchDragItem || !touchDragInfo) return;
    e.preventDefault(); // 禁止滚动

    const touch = e.touches[0];
    touchDragItem.style.left = (touch.clientX - 30) + 'px';
    touchDragItem.style.top = (touch.clientY - 30) + 'px';
}

function handleTouchEnd(e) {
    if (!touchDragItem || !touchDragInfo) return;
    
    // 获取手指离开时的坐标
    const touch = e.changedTouches[0];
    const x = touch.clientX;
    const y = touch.clientY;

    // 检测坐标下方是否是格子
    // 注意：我们需要临时隐藏浮动元素，以防它挡住检测
    touchDragItem.style.display = 'none';
    const elementBelow = document.elementFromPoint(x, y);
    const targetSlot = elementBelow ? elementBelow.closest('.board-slot.item') : null;
    
    // 执行放置逻辑
    if (targetSlot) {
        // 模拟这一步需要复用原本的 handleDrop 逻辑，或者我们手动写一遍简化的
        executeTouchDrop(targetSlot);
    } else {
        // 没拖到格子里，如果是棋盘上的棋子，恢复显示
        if (touchDragInfo.type === 'move' && touchDragInfo.originalEl) {
            touchDragInfo.originalEl.style.opacity = '1';
        }
    }

    // 清理
    touchDragItem.remove();
    touchDragItem = null;
    touchDragInfo = null;
}

function executeTouchDrop(targetSlot) {
    // 为了复用你现有的 handleDrop 逻辑，我们伪造一个全局 draggedPieceInfo
    // 因为你的 handleDrop 依赖全局变量 draggedPieceInfo
    window.draggedPieceInfo = {
        key: touchDragInfo.key,
        type: touchDragInfo.type
    };
    window.dragOriginSlot = touchDragInfo.origin;

    // 伪造一个 Event 对象
    const mockEvent = {
        preventDefault: () => {},
        target: targetSlot,
        closest: () => targetSlot
    };

    // 调用你原本的 handleDrop 函数
    handleDrop(mockEvent);

    // 恢复原本棋子的透明度（如果 handleDrop 里没处理的话）
    if (touchDragInfo.originalEl) {
        touchDragInfo.originalEl.style.opacity = '1';
    }
}