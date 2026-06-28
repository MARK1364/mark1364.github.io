// State
let parts = [
    { id: '1', name: 'Bok Lewy', w: 2000, h: 600, qty: 1, rot: 'any' },
    { id: '2', name: 'Bok Prawy', w: 2000, h: 600, qty: 1, rot: 'any' },
    { id: '3', name: 'Wieniec Dolny', w: 800, h: 600, qty: 1, rot: 'any' },
    { id: '4', name: 'Wieniec Górny', w: 800, h: 600, qty: 1, rot: 'any' },
    { id: '5', name: 'Półka Wew', w: 764, h: 580, qty: 5, rot: 'any' },
    { id: '6', name: 'Szuflada Tył', w: 600, h: 150, qty: 6, rot: 'none' }
];

const NESTING_STORAGE_KEY = 'stolarnia_nesting_parts';

const partsListEl = document.getElementById('partsList');
const addPartBtn = document.getElementById('addPartBtn');
const runNestingBtn = document.getElementById('runNestingBtn');
const boardWInput = document.getElementById('boardW');
const boardHInput = document.getElementById('boardH');
const kerfInput = document.getElementById('kerf');
const optimizeModeInput = document.getElementById('optimizeMode');
const statusMsg = document.getElementById('statusMsg');
const boardsContainer = document.getElementById('boardsContainer');
const exportPdfBtn = document.getElementById('exportPdfBtn');

function init() {
    renderPartsList();
    addPartBtn.addEventListener('click', addPart);
    runNestingBtn.addEventListener('click', generateNesting);
    tryLoadImportedParts();
    window.addEventListener('message', onImportMessage);
}

function importParts(imported) {
    if (!Array.isArray(imported) || !imported.length) return false;
    parts = imported.map((p, i) => ({
        id: p.id || String(Date.now() + i),
        name: p.name || 'Formatka',
        w: parseInt(p.w, 10) || 0,
        h: parseInt(p.h, 10) || 0,
        qty: parseInt(p.qty, 10) || 1,
        rot: p.rot === 'none' ? 'none' : 'any'
    }));
    renderPartsList();
    boardsContainer.innerHTML = '';
    document.getElementById('boardsCountLabel').textContent = '0';
    document.getElementById('wasteLabel').textContent = '0%';
    exportPdfBtn.disabled = true;
    try { localStorage.removeItem(NESTING_STORAGE_KEY); } catch (_) {}
    showStatus(`Zaimportowano ${parts.length} pozycji z Antaro.`, 'success');
    return true;
}

function tryLoadImportedParts() {
    try {
        const raw = localStorage.getItem(NESTING_STORAGE_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        if (importParts(data)) {
            localStorage.removeItem(NESTING_STORAGE_KEY);
        }
    } catch (e) {
        console.warn('Import nesting:', e);
    }
}

function onImportMessage(event) {
    if (!event.data || event.data.type !== 'STOLARNIA_IMPORT_NESTING') return;
    importParts(event.data.parts);
}

function renderPartsList() {
    partsListEl.innerHTML = '';
    parts.forEach((part, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="text" value="${part.name}" onchange="updatePart(${index}, 'name', this.value)"></td>
            <td><input type="number" value="${part.w}" title="Szerokość" onchange="updatePart(${index}, 'w', this.value)"></td>
            <td><input type="number" value="${part.h}" title="Wysokość" onchange="updatePart(${index}, 'h', this.value)"></td>
            <td><input type="number" value="${part.qty}" title="Ilość" onchange="updatePart(${index}, 'qty', this.value)"></td>
            <td>
                <select onchange="updatePart(${index}, 'rot', this.value)" title="Dowolny kierunek pozwala obracać część o 90st">
                    <option value="any" ${part.rot === 'any' ? 'selected' : ''}>⟳ Dowolny</option>
                    <option value="none" ${part.rot === 'none' ? 'selected' : ''}>⛔ Zablokuj</option>
                </select>
            </td>
            <td><button class="btn-remove-row" onclick="removePart(${index})" title="Usuń">&times;</button></td>
        `;
        partsListEl.appendChild(tr);
    });
}

window.updatePart = function(index, field, value) {
    if (field === 'name' || field === 'rot') {
        parts[index][field] = value;
    } else {
        parts[index][field] = parseInt(value) || 0;
    }
};

window.removePart = function(index) {
    parts.splice(index, 1);
    renderPartsList();
};

function addPart() {
    parts.push({ id: Date.now().toString(), name: 'Nowa formatka', w: 500, h: 500, qty: 1, rot: 'any' });
    renderPartsList();
}

function showStatus(msg, type = '') {
    statusMsg.textContent = msg;
    statusMsg.className = 'status-msg ' + type;
}

class BinPacker {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.freeRects = [{ x: 0, y: 0, w: width, h: height }];
    }

    insert(w, h, canRotate) {
        let bestNode = null;
        let bestScore1 = Infinity;
        let bestScore2 = Infinity;
        let rotated = false;

        const tryFit = (fw, fh, isRotated, fr) => {
            if (fw <= fr.w && fh <= fr.h) {
                const leftoverW = fr.w - fw;
                const leftoverH = fr.h - fh;
                const shortSide = Math.min(leftoverW, leftoverH);
                const areaFit = fr.w * fr.h - fw * fh;

                if (shortSide < bestScore1 || (shortSide === bestScore1 && areaFit < bestScore2)) {
                    bestScore1 = shortSide;
                    bestScore2 = areaFit;
                    bestNode = { x: fr.x, y: fr.y, w: fw, h: fh };
                    rotated = isRotated;
                }
            }
        };

        for (let i = 0; i < this.freeRects.length; i++) {
            const fr = this.freeRects[i];
            tryFit(w, h, false, fr);
            if (canRotate) tryFit(h, w, true, fr);
        }

        if (!bestNode) return { node: null, rotated: false };

        let numRectsToProcess = this.freeRects.length;
        for (let i = 0; i < numRectsToProcess; i++) {
            if (this.splitFreeNode(this.freeRects[i], bestNode)) {
                this.freeRects.splice(i, 1);
                i--;
                numRectsToProcess--;
            }
        }

        this.pruneFreeList();
        return { node: bestNode, rotated };
    }

    splitFreeNode(freeNode, usedNode) {
        if (usedNode.x >= freeNode.x + freeNode.w || usedNode.x + usedNode.w <= freeNode.x ||
            usedNode.y >= freeNode.y + freeNode.h || usedNode.y + usedNode.h <= freeNode.y) {
            return false;
        }

        if (usedNode.x < freeNode.x + freeNode.w && usedNode.x + usedNode.w > freeNode.x) {
            if (usedNode.y > freeNode.y && usedNode.y < freeNode.y + freeNode.h) {
                const newNode = { ...freeNode };
                newNode.h = usedNode.y - newNode.y;
                this.freeRects.push(newNode);
            }
            if (usedNode.y + usedNode.h < freeNode.y + freeNode.h) {
                const newNode = { ...freeNode };
                newNode.y = usedNode.y + usedNode.h;
                newNode.h = freeNode.y + freeNode.h - (usedNode.y + usedNode.h);
                this.freeRects.push(newNode);
            }
        }

        if (usedNode.y < freeNode.y + freeNode.h && usedNode.y + usedNode.h > freeNode.y) {
            if (usedNode.x > freeNode.x && usedNode.x < freeNode.x + freeNode.w) {
                const newNode = { ...freeNode };
                newNode.w = usedNode.x - newNode.x;
                this.freeRects.push(newNode);
            }
            if (usedNode.x + usedNode.w < freeNode.x + freeNode.w) {
                const newNode = { ...freeNode };
                newNode.x = usedNode.x + usedNode.w;
                newNode.w = freeNode.x + freeNode.w - (usedNode.x + usedNode.w);
                this.freeRects.push(newNode);
            }
        }

        return true;
    }

    pruneFreeList() {
        for (let i = 0; i < this.freeRects.length; i++) {
            for (let j = i + 1; j < this.freeRects.length; j++) {
                if (this.isContainedIn(this.freeRects[i], this.freeRects[j])) {
                    this.freeRects.splice(i, 1);
                    i--;
                    break;
                }
                if (this.isContainedIn(this.freeRects[j], this.freeRects[i])) {
                    this.freeRects.splice(j, 1);
                    j--;
                }
            }
        }
    }

    isContainedIn(a, b) {
        return a.x >= b.x && a.y >= b.y &&
            a.x + a.w <= b.x + b.w &&
            a.y + a.h <= b.y + b.h;
    }
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function packRectsList(rectsList, boardW, boardH) {
    const boards = [];
    let currentRects = [...rectsList];
    let totalAreaUsed = 0;

    while (currentRects.length > 0) {
        const packer = new BinPacker(boardW, boardH);
        const layoutData = [];
        const notFitted = [];
        let areaOnThisBoard = 0;

        for (const rect of currentRects) {
            const result = packer.insert(rect.w, rect.h, rect.canRotate);
            const node = result.node;
            const rotated = result.rotated;

            if (node) {
                layoutData.push({
                    name: rect.originalName,
                    x: node.x,
                    y: node.y,
                    w: rotated ? rect.realH : rect.realW,
                    h: rotated ? rect.realW : rect.realH,
                    rotated
                });
                areaOnThisBoard += rect.w * rect.h;
                totalAreaUsed += rect.w * rect.h;
            } else {
                notFitted.push(rect);
            }
        }

        boards.push({ layout: layoutData, usedArea: areaOnThisBoard });
        currentRects = notFitted;
    }

    return { boards, totalAreaUsed };
}

function generateNesting() {
    const boardW = parseInt(boardWInput.value);
    const boardH = parseInt(boardHInput.value);
    const kerf = Math.max(0, parseInt(kerfInput.value) || 0);
    const mode = optimizeModeInput.value;

    const rects = [];
    parts.forEach(p => {
        for (let i = 0; i < p.qty; i++) {
            if (p.w <= 0 || p.h <= 0) continue;
            rects.push({
                originalName: p.name,
                w: p.w + kerf,
                h: p.h + kerf,
                realW: p.w,
                realH: p.h,
                canRotate: p.rot === 'any',
                area: (p.w + kerf) * (p.h + kerf)
            });
        }
    });

    if (rects.length === 0) {
        showStatus('Brak prawidłowych formatek do ułożenia.', 'error');
        return;
    }

    for (const r of rects) {
        const fitsDirect = r.w <= boardW && r.h <= boardH;
        const fitsRotated = r.canRotate && r.h <= boardW && r.w <= boardH;
        if (!fitsDirect && !fitsRotated) {
            showStatus(`Formatka "${r.originalName}" jest za duża na płytę!`, 'error');
            return;
        }
    }

    runNestingBtn.disabled = true;
    showStatus('Obliczanie trasy... Proszę czekać.', '');

    setTimeout(() => {
        let bestResult = null;
        let bestScore = Infinity;
        const iterations = mode === 'pro' ? 2000 : 1;
        const defaultSorted = [...rects].sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h));

        for (let i = 0; i < iterations; i++) {
            const testArr = defaultSorted.map(r => ({ ...r }));

            if (i === 1) {
                testArr.sort((a, b) => b.area - a.area);
            } else if (i === 2) {
                testArr.sort((a, b) => (b.w + b.h) - (a.w + a.h));
            } else if (i > 2) {
                shuffleArray(testArr);
                testArr.forEach(r => {
                    if (r.canRotate && Math.random() > 0.5) {
                        const tempW = r.w; r.w = r.h; r.h = tempW;
                        const tempRealW = r.realW; r.realW = r.realH; r.realH = tempRealW;
                    }
                });
            }

            const result = packRectsList(testArr, boardW, boardH);
            const lastBoardUsedArea = result.boards[result.boards.length - 1].usedArea;
            const score = result.boards.length * 100000000 + lastBoardUsedArea;

            if (score < bestScore) {
                bestScore = score;
                bestResult = result;
            }
        }

        drawBoards(bestResult.boards.map(b => b.layout), boardW, boardH);
        showStatus(mode === 'pro' ? 'Zaawansowana optymalizacja zakończona!' : 'Szybki rozkrój zakończony!', 'success');
        runNestingBtn.disabled = false;
    }, 50);
}

const SHEET_FILL = '#F8F6F2';
const SHEET_STROKE = '#000000';

function drawBoards(boards, boardW, boardH) {
    boardsContainer.innerHTML = '';
    const totalWasteArr = [];
    const strokeW = Math.max(3, Math.round(Math.min(boardW, boardH) * 0.0015));

    boards.forEach((layoutData, idx) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'board-wrapper';

        const title = document.createElement('div');
        title.className = 'board-title';
        title.textContent = `Arkusz nr ${idx + 1} · ${boardW} × ${boardH} mm`;
        wrapper.appendChild(title);

        const svgNS = 'http://www.w3.org/2000/svg';
        const svgEl = document.createElementNS(svgNS, 'svg');
        svgEl.setAttribute('viewBox', `0 0 ${boardW} ${boardH}`);
        svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        svgEl.setAttribute('class', 'nesting-svg');

        const bgRect = document.createElementNS(svgNS, 'rect');
        bgRect.setAttribute('x', String(strokeW / 2));
        bgRect.setAttribute('y', String(strokeW / 2));
        bgRect.setAttribute('width', String(boardW - strokeW));
        bgRect.setAttribute('height', String(boardH - strokeW));
        bgRect.setAttribute('fill', SHEET_FILL);
        bgRect.setAttribute('stroke', SHEET_STROKE);
        bgRect.setAttribute('stroke-width', String(strokeW));
        svgEl.appendChild(bgRect);

        let totalUsedArea = 0;

        layoutData.forEach(part => {
            const g = document.createElementNS(svgNS, 'g');
            totalUsedArea += part.w * part.h;

            const rect = document.createElementNS(svgNS, 'rect');
            rect.setAttribute('x', part.x);
            rect.setAttribute('y', part.y);
            rect.setAttribute('width', part.w);
            rect.setAttribute('height', part.h);
            rect.setAttribute('class', 'svg-part');

            const tooltip = document.createElementNS(svgNS, 'title');
            tooltip.textContent = `${part.name} [${part.w}x${part.h}]${part.rotated ? ' (Obrócona)' : ''}`;
            rect.appendChild(tooltip);

            const textName = document.createElementNS(svgNS, 'text');
            textName.setAttribute('x', part.x + part.w / 2);
            textName.setAttribute('y', part.y + part.h / 2 - 15);
            textName.setAttribute('class', 'svg-text');
            textName.textContent = part.name;

            const textDims = document.createElementNS(svgNS, 'text');
            textDims.setAttribute('x', part.x + part.w / 2);
            textDims.setAttribute('y', part.y + part.h / 2 + 15);
            textDims.setAttribute('class', 'svg-dims');
            textDims.textContent = `${part.w} x ${part.h}`;

            g.appendChild(rect);
            if (part.w > 120 && part.h > 80) {
                g.appendChild(textName);
                g.appendChild(textDims);
            }
            svgEl.appendChild(g);
        });

        totalWasteArr.push(100 - (totalUsedArea / (boardW * boardH)) * 100);
        wrapper.appendChild(svgEl);
        boardsContainer.appendChild(wrapper);
    });

    document.getElementById('boardsCountLabel').textContent = boards.length;
    const avgWaste = totalWasteArr.reduce((a, b) => a + b, 0) / boards.length;
    document.getElementById('wasteLabel').textContent = `${avgWaste.toFixed(1)}%`;
    exportPdfBtn.disabled = false;
}

exportPdfBtn.addEventListener('click', () => {
    const svgs = Array.from(document.querySelectorAll('.nesting-svg'));
    let combinedHTML = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:24px;background:#E8E4DD;font-family:sans-serif;color:#3D3A36;} h1{font-size:20px;} h2{font-size:16px;color:#6E6962;margin:24px 0 8px;} svg{display:block;width:100%;max-width:920px;height:auto;margin:0 auto 32px;}</style></head><body>';
    combinedHTML += '<h1>Wydruk rozkroju</h1>';

    svgs.forEach((svg, idx) => {
        combinedHTML += `<h2>Arkusz ${idx + 1}</h2>`;
        combinedHTML += new XMLSerializer().serializeToString(svg);
    });
    combinedHTML += '</body></html>';

    const blob = new Blob([combinedHTML], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rozkroj.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
});

init();
