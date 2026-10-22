class GridBuilder {
    constructor() {
        if (window.gridBuilder) {
            console.warn("GridBuilder уже запущен");
            return window.gridBuilder;
        }

        try {
            this._init();
        } catch (error) {
            this._abortConstruction(error);
            throw error;
        }

        // Флаг ставим только после успешной инициализации.
        // Если _init() упадёт — _abortConstruction() уберёт DOM,
        // и повторный запуск будет с чистого листа.
        window.gridBuilder = this;
    }

    _init() {
        this._injectStyles();

        this.state = {
            p1: null,
            p2: null,
            p3: null,
            cellW: 0,
            cellH: 0,
            rows: 0,
            cols: 0,
            visible: true,
            gridInvisible: false,
            commands: [],
            commandsRaw: null,
            commandsSaved: false,
            selection: null,
            overlayDisplay: "grid",
            savedGrids: [],
            activeGridId: null
        };
        this.state.savedGrids = this._loadSavedGrids();

        this.state.commandsRaw = this._loadCommands();
        if (this.state.commandsRaw !== null) {
            const parsed = this._parseCommands(this.state.commandsRaw);
            if (!parsed.error) {
                this.state.commands = parsed.commands;
                this.state.commandsSaved = true;
            } else {
                // Битые данные в LS — оставляем пустым, но не падаем.
                this.state.commandsRaw = null;
                console.warn("gb-commands повреждён, игнорируем:", parsed.error);
            }
        }

        this.mouse = { x: 0, y: 0 };
        this.player = null;
        this.previousDisplay = "";
        this.playerWasHidden = false;

        this.layers = { grid: null };
        this._layerHandlers = null;

        this._sendTimer = null;
        this._sendResolve = null;
        this._twitchQueue = Promise.resolve();
        this._destroyed = false;
        this._cellFadeTimer = null;          // ← NEW

        // NEW: прямые ссылки на ключевые узлы.
        this.colLabels = null;
        this.rowLabels = null;
        this.resizeMenu = null;
        this.savedGridsPanel = null;

        this.createOverlay();
        this.createInfo();
        this.createCommandsPanel();
        this.createSavedGridsPanel();
        this.createResizeMenu();
        this._bindPanelHover();

        this.hidePlayer();

        this.onMouseMove = this.onMouseMove.bind(this);
        this.onKeyDown = this.onKeyDown.bind(this);

        document.addEventListener("mousemove", this.onMouseMove);
        document.addEventListener("keydown", this.onKeyDown);

        this._onDocumentClick = this._onDocumentClick.bind(this);
        document.addEventListener("click", this._onDocumentClick);

        this.showInfo();
    }

    _abortConstruction(error) {
        console.error("GridBuilder: сбой инициализации", error);

        // Снимаем глобальные слушатели, если успели повесить.
        if (this.onMouseMove) {
            document.removeEventListener("mousemove", this.onMouseMove);
        }
        if (this.onKeyDown) {
            document.removeEventListener("keydown", this.onKeyDown);
        }
        if (this._onDocumentClick) {
            document.removeEventListener("click", this._onDocumentClick);
        }

        // Убираем созданные DOM-узлы.
        try { this.overlay?.remove(); } catch (_) { /* ignore */ }
        const style = document.getElementById("gb-styles");
        if (style) style.remove();

        // Возвращаем плеер, если успели его скрыть.
        try { this.restorePlayer(); } catch (_) { /* ignore */ }

        // На случай, если флаг успел проставиться (не должен, но
        // подстрахуемся — на будущее, если _init станет длиннее).
        if (window.gridBuilder === this) {
            delete window.gridBuilder;
        }
    }

    _bindPanelHover() {
        const panels = [
            this.commandsPanel,
            this.resizeMenu,
            this.savedGridsPanel
        ].filter(Boolean);

        let leaveTimer = null;

        this._panelEnterHandler = () => {
            clearTimeout(leaveTimer);
            clearTimeout(this._cellFadeTimer);
            this._cellFadeTimer = null;
            this._clearFadeTimers();

            if (this.state.selection?.type === 'cell') {
                this._showCellPinned();
            }
        };

        this._panelLeaveHandler = () => {
            clearTimeout(leaveTimer);
            leaveTimer = setTimeout(() => {
                if (!this.state.visible || !this.state.cols) return;

                if (!this.state.gridInvisible) {
                    this.startGridFadeTimer();
                    return;
                }

                if (this.state.selection?.type === 'cell') {
                    this._scheduleCellPinnedFade();
                }
            }, 100);
        };

        this._panelHoverPanels = panels;
        this._panelLeaveTimerRef = () => leaveTimer;

        panels.forEach(p => {
            p.addEventListener("mouseenter", this._panelEnterHandler);
            p.addEventListener("mouseleave", this._panelLeaveHandler);
        });
    }

    // Построение сетки
    createGrid() {
        const res = this._applyGeometry();
        if (res.error) return false;

        this.clearGrid();
        this.buildGridLayer();
        this.buildColLabels();
        this.buildRowLabels();
        this.createResizeMenu();
        //this._invalidateSelectedCoord();
        this._validateSelection();
        return true;
    }

    buildGridLayer() {
        const { p1, cellW, cellH, cols, rows } = this.state;

        const layer = document.createElement("div");
        layer.className = "grid-item grid-layer gb-layer";
        layer.style.left = p1.x + "px";
        layer.style.top = p1.y + "px";
        layer.style.width = (cols * cellW) + "px";
        layer.style.height = (rows * cellH) + "px";
        layer.style.backgroundSize = `${cellW}px ${cellH}px`;

        // Hover живёт отдельно от слоя — чтобы fade слоя его не утаскивал.
        const hover = document.createElement("div");
        hover.className = "gb-hover";
        hover.style.display = "none";
        hover.style.left = "0";
        hover.style.top = "0";
        this.overlay.appendChild(hover);
        this.hover = hover;

        // Оверлей выделенной клетки — постоянный, живёт отдельно от hover.
        this.cellPinned = document.createElement("div");
        this.cellPinned.className = "gb-cell-pinned";
        document.body.appendChild(this.cellPinned);

        // Индикаторы координаты у самой клетки.
        this.cellColLabel = document.createElement("div");
        this.cellColLabel.className = "gb-cell-col";
        document.body.appendChild(this.cellColLabel);

        this.cellRowLabel = document.createElement("div");
        this.cellRowLabel.className = "gb-cell-row";
        document.body.appendChild(this.cellRowLabel);

        // --- Обработчики сохраняем в this._layerHandlers ---
        const onMouseMove = (e) => {
            const rect = layer.getBoundingClientRect();
            const x = Math.floor((e.clientX - rect.left) / cellW);
            const y = Math.floor((e.clientY - rect.top) / cellH);

            if (x < 0 || y < 0 || x >= cols || y >= rows) {
                hover.style.display = "none";
                this._hideHover();
                return;
            }

            hover.style.display = "block";
            hover.style.left = (rect.left + x * cellW) + "px";
            hover.style.top = (rect.top + y * cellH) + "px";
            hover.style.width = cellW + "px";
            hover.style.height = cellH + "px";

            this._updateHover(
                x, y,
                rect.left + x * cellW,
                rect.top + y * cellH,
                cellW, cellH
            );
        };

        const onMouseLeave = () => {
            hover.style.display = "none";
            this._hideHover();
        };

        const onClick = (e) => {
            if (this.zone2.dataset.shown === "1") return;   // help открыт

            const rect = layer.getBoundingClientRect();
            const x = Math.floor((e.clientX - rect.left) / cellW);
            const y = Math.floor((e.clientY - rect.top) / cellH);

            if (x < 0 || y < 0 || x >= cols || y >= rows) return;

            const coord = `${this.cyr(x + 1)}${y + 1}`;
            const sel = this.state.selection;

            // 1. Выделена команда → отправляем с этой клеткой, выделение команды оставляем.
            if (sel?.type === 'command') {
                const command = this.state.commands[sel.index];
                if (command && command.cmd.includes("{coord}")) {
                    this.twitchSend(this._renderCommand(command.cmd, coord));
                }
                return;
            }

            // 2. Выделена клетка → toggle/переключение.
            if (sel?.type === 'cell') {
                if (sel.x === x && sel.y === y) {
                    this._setSelection(null);
                    this.info.textContent = "Выделение снято";
                } else {
                    this._setSelection({ type: 'cell', x, y, coord });
                    this.info.textContent = `Клетка ${coord} выделена`;
                    this._startFadeForSelection();
                }
                return;
            }

            // 3. Ничего не выделено → выделяем клетку.
            this._setSelection({ type: 'cell', x, y, coord });
            this.info.textContent = `Клетка ${coord} выделена`;
            this._startFadeForSelection();
        };

        this._layerHandlers = { onMouseMove, onMouseLeave, onClick };

        layer.addEventListener("mousemove", onMouseMove);
        layer.addEventListener("mouseleave", onMouseLeave);
        layer.addEventListener("click", onClick);

        this.overlay.appendChild(layer);
        this.layers.grid = layer;
    }

    buildColLabels() {
        const { p1, cellW, cols } = this.state;
        const show = cellW >= 14;
        this.colLabels = [];

        for (let x = 0; x < cols; x++) {
            const label = document.createElement("div");
            label.className = "grid-item col-label gb-col-label";
            label.style.left = (p1.x + x * cellW + cellW / 2) + "px";
            label.style.top = (p1.y - 20) + "px";
            label.style.display = show ? "block" : "none";
            label.textContent = this.cyr(x + 1);
            this.overlay.appendChild(label);
            this.colLabels.push(label);
        }
    }

    buildRowLabels() {
        const { p1, cellH, rows } = this.state;
        const show = cellH >= 14;
        this.rowLabels = [];

        for (let y = 0; y < rows; y++) {
            const label = document.createElement("div");
            label.className = "grid-item row-label gb-row-label";
            label.style.left = (p1.x - 8) + "px";
            label.style.top = (p1.y + y * cellH + cellH / 2) + "px";
            label.style.display = show ? "block" : "none";
            label.textContent = y + 1;
            this.overlay.appendChild(label);
            this.rowLabels.push(label);
        }
    }

    layoutGrid() {
        const { p1, cellW, cellH, cols, rows } = this.state;
        const layer = this.layers.grid;
        if (!layer) return;

        // Слой сетки.
        layer.style.left = p1.x + "px";
        layer.style.top = p1.y + "px";
        layer.style.width = (cols * cellW) + "px";
        layer.style.height = (rows * cellH) + "px";
        layer.style.backgroundSize = `${cellW}px ${cellH}px`;

        // Буквы сверху — по прямым ссылкам, без querySelectorAll.
        if (this.colLabels) {
            this.colLabels.forEach((el, x) => {
                el.style.left = (p1.x + x * cellW + cellW / 2) + "px";
                el.style.top = (p1.y - 20) + "px";
                el.style.display = cellW >= 14 ? "block" : "none";
            });
        }

        // Цифры слева — по прямым ссылкам.
        if (this.rowLabels) {
            this.rowLabels.forEach((el, y) => {
                el.style.left = (p1.x - 8) + "px";
                el.style.top = (p1.y + y * cellH + cellH / 2) + "px";
                el.style.display = cellH >= 14 ? "block" : "none";
            });
        }
        this._updateCellPinned();
    }

    _readLayoutVars() {
        const defaults = { col1: 165, col3: 180, col4: 80 };

        try {
            const saved = JSON.parse(
                localStorage.getItem("gb-layout") || "{}"
            );

            for (const key of Object.keys(defaults)) {
                const value = Number(saved[key]);

                if (Number.isFinite(value) && value >= 40 && value <= 400) {
                    defaults[key] = value;
                }
            }
        } catch (error) {
            console.warn("Не удалось прочитать настройки GridBuilder:", error);
        }

        return defaults;
    }

    _showZoneOutlines() {
        [
            { zone: this.zone1, label: "Команды", varName: "--gb-col1" },
            { zone: this.zone3, label: "Точки", varName: "--gb-col3" },
            { zone: this.zone4, label: "Сетки", varName: "--gb-col4" }
        ].forEach(({ zone, label, varName }) => {
            let outline = zone.querySelector(".gb-zone-outline");
            if (!outline) {
                outline = document.createElement("div");
                outline.className = "gb-zone-outline";
                zone.appendChild(outline);
            }
            outline.dataset.label = `${label} · ${this._readZoneWidth(varName)}`;
        });
    }

    _hideZoneOutlines() {
        [this.zone1, this.zone3, this.zone4].forEach(zone => {
            zone.querySelectorAll(".gb-zone-outline").forEach(el => el.remove());
        });
    }

    _updateZoneOutlineLabels() {
        const map = [
            { zone: this.zone1, label: "Команды", varName: "--gb-col1" },
            { zone: this.zone3, label: "Точки", varName: "--gb-col3" },
            { zone: this.zone4, label: "Сетки", varName: "--gb-col4" }
        ];
        map.forEach(({ zone, label, varName }) => {
            const outline = zone.querySelector(".gb-zone-outline");
            if (outline) outline.dataset.label = `${label} · ${this._readZoneWidth(varName)}`;
        });
    }

    _readZoneWidth(varName) {
        const v = getComputedStyle(this.overlay).getPropertyValue(varName).trim();
        return v || "—";
    }

    _safeSaveLayout(data) {
        try {
            localStorage.setItem("gb-layout", JSON.stringify(data));
        } catch (error) {
            console.warn("Не удалось сохранить настройки GridBuilder:", error);
        }
    }

    _loadSavedGrids() {
        try {
            const raw = localStorage.getItem("gb-saved-grids");
            if (!raw) return [];
            const data = JSON.parse(raw);
            if (!Array.isArray(data)) return [];

            // Мягкая валидация — битые слоты отбрасываем, а не роняем приложение.
            return data.filter(g =>
                g &&
                Number.isInteger(g.id) &&
                g.p1 && g.p2 && g.p3 &&
                Number.isFinite(g.p1.x) && Number.isFinite(g.p1.y) &&
                Number.isFinite(g.p2.x) && Number.isFinite(g.p2.y) &&
                Number.isFinite(g.p3.x) && Number.isFinite(g.p3.y)
            );
        } catch (e) {
            console.warn("Не удалось прочитать gb-saved-grids:", e);
            return [];
        }
    }

    _saveSavedGrids() {
        try {
            localStorage.setItem(
                "gb-saved-grids",
                JSON.stringify(this.state.savedGrids)
            );
        } catch (e) {
            console.warn("Не удалось сохранить gb-saved-grids:", e);
        }
    }

    _loadCommands() {
        try {
            const raw = localStorage.getItem("gb-commands");
            return raw === null ? null : raw;
        } catch (e) {
            console.warn("Не удалось прочитать gb-commands:", e);
            return null;
        }
    }

    _saveCommands(raw) {
        try {
            if (raw === null) localStorage.removeItem("gb-commands");
            else localStorage.setItem("gb-commands", raw);
        } catch (e) {
            console.warn("Не удалось сохранить gb-commands:", e);
        }
    }

    _fillStorageStats() {
        if (!this.zone2) return;

        const layout = localStorage.getItem("gb-layout");
        const grids = localStorage.getItem("gb-saved-grids");
        const cmds = localStorage.getItem("gb-commands");

        const el = (id) => this.zone2.querySelector("#gb-storage-" + id);

        const sizeStr = (s) => {
            if (s === null || s === undefined) return "—";
            return s.length > 1024 ? `${(s.length / 1024).toFixed(1)} КБ` : `${s.length} б`;
        };

        const layoutEl = el("layout");
        if (layoutEl) layoutEl.textContent = sizeStr(layout);

        const gridsEl = el("grids");
        if (gridsEl) {
            let n = 0;
            try { n = JSON.parse(grids || "[]").length; } catch { /* ignore */ }
            gridsEl.textContent = grids ? `${n} шт · ${sizeStr(grids)}` : "—";
        }

        const cmdsEl = el("commands");
        if (cmdsEl) {
            let count = 0;
            if (cmds) {
                const parsed = this._parseCommands(cmds);
                count = parsed.error ? 0 : parsed.commands.length;
            }
            cmdsEl.textContent = cmds
                ? `${count} ком. · ${sizeStr(cmds)}`
                : "—";
        }
    }

    _storageModal(mode) {
        const isExport = mode === "export";

        const data = {
            "gb-layout": localStorage.getItem("gb-layout"),
            "gb-saved-grids": localStorage.getItem("gb-saved-grids"),
            "gb-commands": localStorage.getItem("gb-commands")
        };
        const initial = isExport ? JSON.stringify(data, null, 2) : "";

        const wrap = document.createElement("div");
        wrap.className = "gb-storage-modal";
        wrap.innerHTML = `
        <div class="gb-storage-modal-box">
            <div class="gb-storage-modal-title">
                ${isExport ? "📤 Экспорт данных" : "📥 Импорт данных"}
            </div>
            <textarea class="gb-storage-modal-text"
                placeholder="${isExport ? "" : "Вставьте JSON из экспорта…"}"></textarea>
            <div class="gb-storage-modal-actions">
                <button type="button" class="gb-storage-btn"
                    data-modal-action="cancel">Отмена</button>
                <button type="button" class="gb-storage-btn"
                    data-modal-action="${isExport ? "copy" : "apply"}">
                    ${isExport ? "📋 Скопировать" : "Импортировать"}
                </button>
            </div>
        </div>
    `;
        document.body.appendChild(wrap);

        const textarea = wrap.querySelector(".gb-storage-modal-text");
        textarea.value = initial;
        textarea.focus();
        if (isExport) textarea.select();

        wrap.addEventListener("click", (e) => {
            if (e.target === wrap) { wrap.remove(); return; }

            const btn = e.target.closest("[data-modal-action]");
            if (!btn) return;
            const action = btn.dataset.modalAction;

            if (action === "cancel") { wrap.remove(); return; }

            if (action === "copy") {
                textarea.select();
                try {
                    if (navigator.clipboard?.writeText) {
                        navigator.clipboard.writeText(textarea.value);
                    } else {
                        document.execCommand("copy");
                    }
                    this.info.textContent = "JSON скопирован в буфер обмена";
                } catch {
                    this.info.textContent = "Скопируйте вручную (Ctrl+C)";
                }
                wrap.remove();
                return;
            }

            if (action === "apply") {
                let parsed;
                try { parsed = JSON.parse(textarea.value); }
                catch (err) {
                    alert("Невалидный JSON: " + err.message);
                    return;
                }

                for (const k of ["gb-layout", "gb-saved-grids", "gb-commands"]) {
                    if (!(k in parsed)) continue;
                    if (parsed[k] === null) localStorage.removeItem(k);
                    else localStorage.setItem(k, parsed[k]);
                }

                wrap.remove();

                if (confirm("Данные импортированы. Перезагрузить страницу, чтобы применить?")) {
                    location.reload();
                } else {
                    this._fillStorageStats();
                }
            }
        });
    }

    _clearStorage() {
        if (!confirm(
            "Удалить все данные GridBuilder из localStorage?\n\n" +
            "• Настройки панелей\n" +
            "• Сохранённые сетки\n" +
            "• Команды\n\n" +
            "Это действие необратимо. Рекомендуется сначала сделать экспорт."
        )) return;

        ["gb-layout", "gb-saved-grids", "gb-commands"].forEach(k => {
            try { localStorage.removeItem(k); } catch { /* ignore */ }
        });

        this.info.textContent = "localStorage очищен. Перезагрузите страницу.";
        this._fillStorageStats();
    }

    _clearFadeTimers() {
        clearTimeout(this.gridFadeTimer);
        this.gridFadeTimer = null;
        if (this.gridFadeFrame) {
            cancelAnimationFrame(this.gridFadeFrame);
            this.gridFadeFrame = null;
        }
    }

    _refreshPoints() {
        [1, 2, 3].forEach(n => {
            const p = this.state["p" + n];
            const marker = this.overlay.querySelector(".point-marker-" + n);
            if (p) {
                this.addPoint(p, n);
            } else if (marker) {
                marker.remove();
            }
        });
    }

    _updateHover(x, y, cellLeft, cellTop, cellW, cellH) {
        // Подсветка на линейке.
        if (this.colLabels) {
            this.colLabels.forEach((el, i) => el.classList.toggle("active", i === x));
        }
        if (this.rowLabels) {
            this.rowLabels.forEach((el, i) => el.classList.toggle("active", i === y));
        }

        // Буква — над клеткой, по центру.
        if (this.cellColLabel) {
            this.cellColLabel.textContent = this.cyr(x + 1);
            this.cellColLabel.style.display = "block";
            this.cellColLabel.style.left = (cellLeft + cellW / 2) + "px";
            this.cellColLabel.style.top = (cellTop - 20) + "px";
        }

        // Цифра — слева от клетки, по центру.
        if (this.cellRowLabel) {
            this.cellRowLabel.textContent = String(y + 1);
            this.cellRowLabel.style.display = "block";
            this.cellRowLabel.style.left = (cellLeft - 6) + "px";
            this.cellRowLabel.style.top = (cellTop + cellH / 2) + "px";
        }
    }

    _hideHover() {
        if (this.colLabels) this.colLabels.forEach(el => el.classList.remove("active"));
        if (this.rowLabels) this.rowLabels.forEach(el => el.classList.remove("active"));
        if (this.cellColLabel) this.cellColLabel.style.display = "none";
        if (this.cellRowLabel) this.cellRowLabel.style.display = "none";
    }

    _computeGeometry() {
        const { p1, p2, p3 } = this.state;
        if (!p1 || !p2 || !p3) return { error: "Не все точки заданы" };

        const cellW = p2.x - p1.x;
        const cellH = p2.y - p1.y;
        if (cellW < 1 || cellH < 1) return { error: "Ячейка слишком маленькая" };
        if (p2.x <= p1.x || p2.y <= p1.y) return { error: "Точка 2 должна быть правее и ниже точки 1" };
        if (p3.x <= p1.x || p3.y <= p1.y) return { error: "Точка 3 должна быть правее и ниже точки 1" };

        const cols = Math.floor((p3.x - p1.x) / cellW);
        const rows = Math.floor((p3.y - p1.y) / cellH);
        if (cols < 1 || rows < 1) return { error: "Слишком мало ячеек" };
        if (cols > 200 || rows > 200) return { error: `Слишком большая сетка (${cols}×${rows}). Максимум 200×200.` };

        return { cellW, cellH, cols, rows };
    }

    _applyGeometry() {
        const geo = this._computeGeometry();

        if (geo.error) {
            this.info.textContent = geo.error;
            return { error: geo.error };
        }

        const changed =
            geo.cols !== this.state.cols ||
            geo.rows !== this.state.rows ||
            geo.cellW !== this.state.cellW ||
            geo.cellH !== this.state.cellH;

        this.state.cellW = geo.cellW;
        this.state.cellH = geo.cellH;
        this.state.cols = geo.cols;
        this.state.rows = geo.rows;

        return { changed };
    }

    _movePoint(pointNumber, dx, dy) {
        if (this.zone2.dataset.shown === "1") return;   // help открыт — кнопки move не работают

        const point = this.state["p" + pointNumber];
        if (!point) return;

        const menu = this.resizeMenu;
        if (!menu) return;

        const stepInput = menu.querySelector("#grid-move-step");
        const step = Number(stepInput?.value);

        if (!Number.isFinite(step) || step <= 0) return;

        const oldPoint = { x: point.x, y: point.y };

        point.x += dx * step;
        point.y += dy * step;

        const res = this._applyGeometry();

        if (res.error) {
            // Откатываем координаты и сохраняем прежнюю геометрию.
            this.state["p" + pointNumber] = oldPoint;

            this.info.textContent = "Ход отменён: " + res.error;
            this._refreshPoints();
            this.updateResizeMenuValues(menu);
            this.startGridFadeTimer();
            return;
        }

        if (res.changed) {
            if (!this.createGrid()) {
                this.state["p" + pointNumber] = oldPoint;
                this._applyGeometry();
                this.createGrid();
            }
        } else {
            this.layoutGrid();
        }

        this._refreshPoints();

        const menuEl = this.resizeMenu;
        if (menuEl) this.updateResizeMenuValues(menuEl);

        if (this.state.activeGridId !== null) {
            this.updateActiveGrid();
        }

        this.startGridFadeTimer();
    }

    _finishGridSetup() {
        this._refreshPoints();
        this.setGridInvisible(false);
        this.startGridFadeTimer();
        this.updateSavedGridsPanel();
    }

    _parseCommands(text) {
        const commands = [];
        const errors = [];
        const lines = text.split(/\r?\n/);

        let pendingLabel = null;
        let pendingLineNo = -1;

        const flushPending = (nextLineNo) => {
            if (pendingLabel !== null) {
                errors.push(
                    `Строка ${pendingLineNo + 1}: label "${pendingLabel}" ` +
                    `без команды (строка ${nextLineNo} не начинается с "!")`
                );
                pendingLabel = null;
                pendingLineNo = -1;
            }
        };

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            if (line.includes("((") || line.includes("))")) {
                flushPending(i + 1);
                errors.push(`Строка ${i + 1}: старый формат ((label)(cmd)) не поддерживается`);
                continue;
            }

            const bangIdx = line.indexOf("!");

            // Строка начинается с "!" → это команда
            if (bangIdx === 0) {
                if (pendingLabel !== null) {
                    commands.push({ label: pendingLabel, cmd: line });
                    pendingLabel = null;
                    pendingLineNo = -1;
                } else {
                    commands.push({ label: line, cmd: line });
                }
                continue;
            }

            // "label !cmd" в одной строке
            if (bangIdx > 0) {
                flushPending(i + 1);
                commands.push({
                    label: line.slice(0, bangIdx).trim(),
                    cmd: line.slice(bangIdx).trim()
                });
                continue;
            }

            // Нет "!" → это label, ждём следующую строку
            flushPending(i + 1);
            pendingLabel = line;
            pendingLineNo = i;
        }

        flushPending(lines.length + 1);

        if (errors.length > 0) {
            return { commands: [], error: errors.join("; ") };
        }
        return { commands };
    }

    twitchSend(text) {
        if (!text || !text.trim()) return this._twitchQueue;
        this._twitchQueue = this._twitchQueue
            .then(() => {
                if (this._destroyed) return;
                return this._twitchSendInternal(text);
            })
            .catch(error => {
                console.warn("Twitch send error:", error);
            });

        return this._twitchQueue;
    }

    async _twitchSendInternal(text) {
        const box = document.querySelector(
            '[data-a-target="chat-input"][contenteditable="true"]'
        );
        if (!box) {
            console.log("Поле не найдено");
            return;
        }

        // Синхронизация со Slate/React: двойной rAF.
        const syncFrame = () => new Promise(resolve =>
            requestAnimationFrame(() => requestAnimationFrame(resolve))
        );

        const sleep = (ms) => new Promise(r => setTimeout(r, ms));

        const focusBox = () => {
            if (document.activeElement !== box) box.focus();
        };

        focusBox();

        // --- 1. Очистка старого содержимого ---
        if (box.textContent && box.textContent.length > 0) {
            const selection = window.getSelection();
            const clearRange = document.createRange();
            clearRange.selectNodeContents(box);
            selection.removeAllRanges();
            selection.addRange(clearRange);

            await syncFrame();

            const deleteEvent = new InputEvent("beforeinput", {
                bubbles: true,
                cancelable: true,
                composed: true,
                inputType: "deleteContentBackward",
                data: null
            });
            box.dispatchEvent(deleteEvent);

            if (!deleteEvent.defaultPrevented) {
                document.execCommand("delete", false, null);
            }

            await syncFrame();

            // Страховка, если Slate «съел» событие, но не очистил.
            if (box.textContent && box.textContent.length > 0) {
                const selection2 = window.getSelection();
                const fallbackRange = document.createRange();
                fallbackRange.selectNodeContents(box);
                selection2.removeAllRanges();
                selection2.addRange(fallbackRange);

                await syncFrame();

                const fallbackDelete = new InputEvent("beforeinput", {
                    bubbles: true,
                    cancelable: true,
                    composed: true,
                    inputType: "deleteContentBackward",
                    data: null
                });
                box.dispatchEvent(fallbackDelete);

                if (!fallbackDelete.defaultPrevented) {
                    document.execCommand("delete", false, null);
                }

                await syncFrame();
            }
        }

        // --- 2. Курсор в конец ---
        focusBox();
        {
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(box);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
        }

        await syncFrame();

        // --- 3. Вставка текста ---
        const beforeInput = new InputEvent("beforeinput", {
            bubbles: true,
            cancelable: true,
            composed: true,
            inputType: "insertText",
            data: text
        });
        box.dispatchEvent(beforeInput);

        if (!beforeInput.defaultPrevented) {
            document.execCommand("insertText", false, text);
        }

        await syncFrame();

        // --- 4. Страховка: если текст не попал в поле ---
        if (!box.textContent.includes(text)) {
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(box);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);

            await syncFrame();

            document.execCommand("insertText", false, text);
        }

        // --- 5. Отправка (ждём таймер, чтобы очередь не продолжилась раньше) ---
        await new Promise(resolve => {
            this._sendResolve = resolve;
            this._sendTimer = setTimeout(() => {
                this._sendTimer = null;
                this._sendResolve = null;

                if (this._destroyed) { resolve(); return; }

                const button = document.querySelector(
                    'button[data-a-target="chat-send-button"]'
                );
                if (!button) {
                    console.log("Кнопка не найдена");
                    resolve();
                    return;
                }

                button.dispatchEvent(new MouseEvent("mousedown", {
                    bubbles: true, cancelable: true, view: window
                }));
                button.dispatchEvent(new MouseEvent("mouseup", {
                    bubbles: true, cancelable: true, view: window
                }));
                button.click();
                resolve();
            }, 200 + Math.random() * 200);   // 200–400 мс
        });
    }
    //twitchSend("!профиль");

    setGridInvisible(value) {
        this._clearFadeTimers();
        this.state.gridInvisible = Boolean(value);
        const invisible = this.state.gridInvisible;

        // Сетка и подписи — fade.
        this.overlay.querySelectorAll(".grid-item, .point-marker").forEach(el => {
            el.style.transition = "none";
            el.style.opacity = value ? "0" : "1";
        });
        if (this.cellPinned) {                  // ← NEW
            this.cellPinned.style.transition = "none";
            this.cellPinned.style.opacity = value ? "0" : "1";
        }
        // Меню — opacity + pointer-events.
        const menu = this.resizeMenu;
        if (menu) {
            menu.style.transition = "none";
            menu.style.opacity = value ? "0" : "1";
            menu.style.pointerEvents = value ? "none" : "auto";
        }
    }

    // Создание слоя
    createOverlay() {
        this.overlay = document.createElement("div");
        this.overlay.id = "grid-builder-overlay";
        this.overlay.className = "gb-overlay";

        this.zone1 = document.createElement("div");
        this.zone2 = document.createElement("div");
        this.zone3 = document.createElement("div");
        this.zone4 = document.createElement("div");

        [this.zone1, this.zone2, this.zone3, this.zone4].forEach((zone, index) => {
            zone.className = "gb-zone";
            zone.dataset.zone = index + 1;
            this.overlay.appendChild(zone);
        });

        // --- Делегат на все клики в zone2 ---
        this.zone2.addEventListener("click", (e) => {
            // Theatre Mode
            const theatre = e.target.closest(".gb-theatre-btn");
            if (theatre) {
                const twitchBtn = document.querySelector(
                    'button[aria-label*="кинотеатр" i], ' +
                    'button[aria-label*="theatre" i]'
                );
                if (twitchBtn) {
                    twitchBtn.click();
                } else {
                    this.info.textContent =
                        "Кнопка Theatre Mode не найдена — нажмите alt + t вручную";
                }
                return;
            }

            // Reset размеров панелей
            const reset = e.target.closest(".gb-layout-reset");
            if (reset) {
                this._resetLayoutVars();
                return;
            }
            // Storage actions
            const storageBtn = e.target.closest("[data-storage-action]");
            if (storageBtn) {
                const action = storageBtn.dataset.storageAction;
                if (action === "export") this._storageModal("export");
                else if (action === "import") this._storageModal("import");
                else if (action === "clear") this._clearStorage();
                return;
            }
        });

        // --- Делегат на ввод в полях размеров ---
        this.zone2.addEventListener("input", (e) => {
            const input = e.target.closest(".gb-layout-input");
            if (!input) return;

            const varName = input.dataset.var;
            let v = Number(input.value);
            if (!v || v < 40) return;
            v = Math.min(v, 400);

            this.overlay.style.setProperty(varName, v + "px");
            this._saveLayoutVars();
            this._updateZoneOutlineLabels();
        });

        document.body.appendChild(this.overlay);
        this._applyLayoutVars();
    }

    _applyLayoutVars() {
        const saved = this._readLayoutVars();

        this.overlay.style.setProperty("--gb-col1", saved.col1 + "px");
        this.overlay.style.setProperty("--gb-col3", saved.col3 + "px");
        this.overlay.style.setProperty("--gb-col4", saved.col4 + "px");

    }

    // Информационная панель
    createInfo() {
        this.info = document.createElement("div");
        this.info.className = "gb-info";
        this.info.textContent = "Наведите курсор в угол А1 и нажмите цифру 1";
        this.zone1.appendChild(this.info);
    }

    _injectStyles() {
        if (document.getElementById("gb-styles")) return;
        const style = document.createElement("style");
        style.id = "gb-styles";
        style.textContent = `
    /* ===== Help panel ===== */
    .gb-help { position:absolute; inset:0; z-index:1000003;
        overflow-y:auto; padding:16px; box-sizing:border-box;
        background:rgba(0,0,0,.9); color:#efeff1; font-family:monospace;
        font-size:13px; line-height:1.55; pointer-events:auto; scrollbar-width:none; }
    .gb-help h2 { margin:0 0 4px; font-size:18px; color:#9147ff; }
    .gb-help h3 { margin:0 0 6px; font-size:14px; color:#8ec8ff; }
    .gb-help hr { border:none; border-top:1px solid #444; margin:12px 0; }
    .gb-help p, .gb-help ol, .gb-help ul { margin:0 0 10px; }
    .gb-help ol, .gb-help ul { padding-left:20px; }
    .gb-help table { width:100%; border-collapse:collapse; font-size:12px; }
    .gb-help table td { padding:2px 0; }
    .gb-help table td:first-child { color:#8ec8ff; }
    .gb-help .dim { opacity:.7; }
    .gb-help .small { font-size:12px; }
    .gb-help .gb-code { margin: 0 0 10px; padding: 6px 8px;
        background: rgba(0,0,0,.35); border: 1px solid #444; border-radius: 5px;
        font-family: monospace; font-size: 12px; white-space: pre-wrap;
        overflow-wrap: anywhere; color: #fff; }
    .gb-theatre-btn {
        display:inline-block;
        margin:0 0 12px;
        padding:6px 12px;
        cursor:pointer;
        background:rgba(145,71,255,.15);
        color:#8ec8ff;
        border:1px solid rgba(145,71,255,.4);
        border-radius:6px;
        font-family:monospace;
        font-size:12px;
        font-weight:bold;
        transition:background .15s, border-color .15s, color .15s;
    }
    .gb-theatre-btn:hover {
        background:rgba(145,71,255,.3);
        border-color:#9147ff;
        color:#fff;
    }
    .gb-theatre-btn:active { transform:scale(.97); }


    .gb-layout-grid {
        display:grid;
        grid-template-columns: 1fr 1fr 1fr auto;
        gap:6px;
        margin-bottom:12px;
        align-items:end;
    }
    .gb-layout-grid label {
        display:flex;
        flex-direction:column;
        gap:3px;
        font-size:11px;
        color:#8ec8ff;
    }
    .gb-layout-input {
        width:100%;
        padding:4px 6px;
        background:rgba(0,0,0,.4);
        border:1px solid #444;
        border-radius:4px;
        color:#fff;
        font-family:monospace;
        font-size:12px;
        box-sizing:border-box;
    }
    .gb-layout-input:focus { outline:none; border-color:#9147ff; }
    .gb-layout-reset {
        padding:4px 10px;
        height:26px;
        cursor:pointer;
        background:rgba(145,71,255,.2);
        color:#8ec8ff;
        border:1px solid rgba(145,71,255,.4);
        border-radius:4px;
        font-family:monospace;
        font-size:11px;
        font-weight:bold;
    }
    .gb-layout-reset:hover { background:rgba(145,71,255,.4); color:#fff; }

    .gb-grid { display:grid; grid-template-columns:32px repeat(4,1fr);
        grid-template-rows:24px repeat(4,1fr); gap:0; font-family:monospace;
        font-size:12px; max-width:340px; margin-bottom:12px; }
    .gb-grid .col { text-align:center; color:#8ec8ff; font-weight:bold; }
    .gb-grid .row { text-align:right; padding-right:4px; color:#8effa1; font-weight:bold; }
    .gb-grid .cell { border:1px solid rgba(0,120,255,.5); padding:6px 4px;
        text-align:center; color:#efeff1; position:relative; }
    .gb-point { position:absolute; width:16px; height:16px; background:red;
        color:#fff; font-size:10px; font-weight:bold; line-height:16px;
        text-align:center; border-radius:50%; border:1px solid #fff; }
    .gb-point.tl { left:-7px; top:-7px; }
    .gb-point.br { right:-7px; bottom:-7px; }

    /* ===== Overlay & zones ===== */
    .gb-overlay { position:fixed; left:0; top:0; width:100vw; height:100vh;
        display:grid;
        grid-template-columns:
            var(--gb-col1, 165px)
            1fr
            var(--gb-col3, 180px)
            var(--gb-col4, 80px);
        z-index:999999; pointer-events:none; }
    .gb-zone { position:relative; width:100%; height:100%;
        min-width:0; min-height:0; overflow:hidden; pointer-events:none; }
        /* ===== Zone outlines (видны только при открытом help) ===== */
    .gb-zone-outline {
        position: absolute;
        inset: 0;
        outline: 1px dashed rgba(145,71,255,.65);
        outline-offset: -1px;
        z-index: 1000001;          /* выше .gb-layer (999998) и .gb-resize-menu (1000000) */
        pointer-events: none;
    }
    .gb-zone-outline::after {
        content: attr(data-label);
        position: absolute;
        top: 6px;
        left: 50%;
        transform: translateX(-50%);
        padding: 2px 8px;
        background: rgba(145,71,255,.9);
        color: #fff;
        font-family: monospace;
        font-size: 10px;
        font-weight: bold;
        border-radius: 3px;
        white-space: nowrap;
        box-shadow: 0 0 0 1px rgba(255,255,255,.15);
    }

    /* ===== Info ===== */
    .gb-info { position:fixed; left:10px; top:10px; background:rgba(0,0,0,.8);
        color:white; padding:8px; font-family:monospace; font-size:14px;
        border-radius:5px; pointer-events:none; }

    /* ===== Commands panel ===== */
    .gb-cmd-panel { position:absolute; left:0; top:95px; bottom:0; width:100%;
        height:calc(100vh - 95px); padding:0; background:rgba(0,0,0,.15);
        color:white; font-family:monospace; font-size:13px; border-radius:5px;
        pointer-events:auto; box-sizing:border-box; overflow-y:auto;
        scrollbar-width:none; }
    .gb-cmd-save { display:block; width:100%; box-sizing:border-box; padding:10px;
        margin-bottom:10px; cursor:pointer;
        background:linear-gradient(135deg,#9147ff,#5c2d99); color:white;
        border:none; border-radius:8px; font-family:monospace;
        font-size:14px; font-weight:bold; }
    .gb-cmd-textarea { display:block; width:100%; height:calc(100vh - 180px);
        box-sizing:border-box; resize:none; padding:3px; background:rgba(0,0,0,.3);
        color:#efeff1; border:1px solid #3a3a3d; border-radius:8px; outline:none;
        font-family:monospace; font-size:14px; line-height:1.5; }
    .gb-cmd-textarea.gb-cmd-textarea-error {
        border-color: #ff5c5c;
        box-shadow: 0 0 0 1px rgba(255,92,92,.55);
        background: rgba(80,20,20,.35);
    }
    .gb-cmd-edit { display:block; width:100%; box-sizing:border-box; padding:10px;
        margin-bottom:10px; cursor:pointer;
        background:linear-gradient(135deg,#9147ff,#5c2d99); color:#fff;
        border:1px solid rgba(255,255,255,.25); border-radius:10px;
        font-family:monospace; font-size:14px; font-weight:bold;
        box-shadow:0 4px 10px rgba(0,0,0,.3); }
    .gb-cmd-list { overflow-y:auto; height:calc(100vh - 170px);
        padding-right:4px; scrollbar-width:none; }
    .gb-cmd-btn { display:block; width:100%; box-sizing:border-box; padding:5px 8px;
        margin-bottom:8px; text-align:left; cursor:pointer; white-space:normal;
        overflow-wrap:anywhere; background:linear-gradient(135deg,#333,#222);
        color:#fff; border:1px solid rgba(255,255,255,.15); border-radius:10px;
        font-family:monospace; font-size:14px; font-weight:600;
        box-shadow:0 4px 10px rgba(0,0,0,.25); transition:all .15s ease;
        user-select:none; opacity:.7; }
    .gb-cmd-btn.gb-cmd-needs-coord {
        opacity: .45;
        cursor: not-allowed;
        filter: grayscale(.5);
        border-color: rgba(255,100,100,.25);}
    .gb-cmd-btn.gb-cmd-needs-coord:hover {
        background: linear-gradient(135deg, #333, #222);
        border-color: rgba(255,100,100,.4);}

    /* ===== Grid layer ===== */
    .gb-layer { position:fixed;
        background-image:
            linear-gradient(to right, rgba(0,120,255,.35) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(0,120,255,.35) 1px, transparent 1px);
        pointer-events:auto; z-index:999998;
        box-shadow:inset 0 0 0 1px rgba(0,120,255,.55); }
    .gb-hover { position:fixed; pointer-events:none;
        background:rgba(145,71,255,.25); border:1px solid rgba(145,71,255,.7);
        box-sizing:border-box; display:none; z-index:999999; }
    .gb-col-label { position:absolute; transform:translateX(-50%);
        font-weight:bold; font-size:12px; font-family:monospace; color:#8ec8ff;
        text-shadow:0 0 3px #000,0 0 3px #000,0 0 3px #000;
        pointer-events:none; user-select:none; }
    .gb-row-label { position:absolute; transform:translate(-100%,-50%);
        font-weight:bold; font-size:12px; font-family:monospace; color:#8effa1;
        text-shadow:0 0 3px #000,0 0 3px #000,0 0 3px #000;
        pointer-events:none; user-select:none; text-align:right; white-space:nowrap; }

    .gb-col-label.active,
    .gb-row-label.active {
        color: #fff;
        background: rgba(145,71,255,.9);
        padding: 0 4px;
        border-radius: 3px;
        text-shadow: none;
        opacity: 1 !important;
        transition: none !important;
    }
    .gb-cell-col {
        position: fixed;
        pointer-events: none;
        background: rgba(145,71,255,.95);
        color: #fff;
        padding: 1px 5px;
        border-radius: 3px;
        font-family: monospace;
        font-size: 12px;
        font-weight: bold;
        z-index: 1000002;
        display: none;
        transform: translateX(-50%);
    }
    .gb-cell-row {
        position: fixed;
        pointer-events: none;
        background: rgba(145,71,255,.95);
        color: #fff;
        padding: 1px 5px;
        border-radius: 3px;
        font-family: monospace;
        font-size: 12px;
        font-weight: bold;
        z-index: 1000002;
        display: none;
        transform: translate(-100%, -50%);
    }

    /* ===== Point marker ===== */
    .gb-point-marker { position:fixed; width:12px; height:12px; background:red;
        border-radius:50%; transform:translate(-50%,-50%); pointer-events:none;
        z-index:1000001; display:block; }
    .gb-point-marker > span { position:absolute; left:15px; top:-10px;
        color:red; font-weight:bold; }

    /* ===== Resize menu ===== */
    .gb-resize-menu { position:absolute; left:0; top:10px; width:100%;
        max-height:90vh; overflow-y:auto; padding:8px; background:rgba(0,0,0,.9);
        color:white; font-family:monospace; font-size:12px; border-radius:8px;
        pointer-events:auto; box-sizing:border-box; z-index:1000000; }
    .gb-move-controls { display:grid; grid-template-columns:repeat(3,1fr); gap:5px; }
    .gb-move-btn { min-height:30px; cursor:pointer; border:1px solid #666;
        border-radius:4px; background:#333; color:white; font-size:16px; }
    .gb-move-btn:disabled { cursor:default; background:transparent; }
    .gb-resize-menu.gb-help-locked .move-btn:not(:disabled) {
        cursor: not-allowed;
        opacity: 0.55;
        background: #2a2a2a;
        border-color: #444;
    }
    .gb-resize-menu.gb-help-locked .move-btn:not(:disabled):hover {
        background: #2a2a2a;
        border-color: #444;
    }

    /* ===== Saved grids panel ===== */
    .gb-saved-panel { position:absolute; left:0; top:10px; width:100%;
        max-height:70vh; overflow-y:auto; padding:6px; background:rgba(0,0,0,.9);
        color:white; border-radius:8px; z-index:1000000; font-family:monospace;
        font-size:12px; box-sizing:border-box; pointer-events:auto; }
    .gb-saved-title { font-weight:bold; margin-bottom:8px; font-size:14px; }
    .gb-saved-empty { opacity:.6; }
    .gb-grid-slot {
        display:block; width:100%; padding:8px; margin-bottom:5px;
        cursor:pointer;
        background:#333; color:#fff;
        border:1px solid #555;
        border-radius:6px;
        font-family:monospace; font-weight:bold; font-size:16px;
        box-sizing:border-box;
        transition:background .15s, border-color .15s, color .15s, box-shadow .15s;
    }
    .gb-grid-slot:hover { background:#3d3d3d; border-color:#777; }
    
    .gb-grid-slot.active {
        background:#fff; color:#000;
        border-color:#b605ff;
        box-shadow:0 0 0 2px rgba(182,5,255,.55), 0 0 12px rgba(182,5,255,.4);
    }
    .gb-grid-slot.active:hover { background:#fff; }
    /* ===== Pinned command button ===== */
    .gb-cmd-btn.gb-pinned {
        background: linear-gradient(135deg, #9147ff, #5c2d99);
        border-color: #b605ff;
        box-shadow: 0 0 0 2px rgba(182,5,255,.55), 0 0 12px rgba(182,5,255,.4);
        opacity: 1;
        color: #fff;
    }
    
    /* ===== Pinned cell overlay ===== */
    .gb-cell-pinned {
        position: fixed;
        pointer-events: none;
        background: rgba(145,71,255,.3);
        border: 2px solid rgba(145,71,255,.95);
        box-sizing: border-box;
        z-index: 999999;
        display: none;
    }
    /* ===== Storage (localStorage) ===== */
    .gb-storage-stats {
        font-size: 11px;
        line-height: 1.6;
        margin-bottom: 10px;
        padding: 6px 8px;
        background: rgba(0,0,0,.3);
        border-radius: 5px;
        border: 1px solid #444;
    }
    .gb-storage-stats span { color: #8ec8ff; font-weight: bold; }
    .gb-storage-actions {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 6px;
        margin-bottom: 12px;
    }
    .gb-storage-btn {
        padding: 8px 6px;
        cursor: pointer;
        background: rgba(145,71,255,.15);
        color: #8ec8ff;
        border: 1px solid rgba(145,71,255,.4);
        border-radius: 6px;
        font-family: monospace;
        font-size: 11px;
        font-weight: bold;
        transition: background .15s, color .15s, border-color .15s;
    }
    .gb-storage-btn:hover {
        background: rgba(145,71,255,.3);
        border-color: #9147ff;
        color: #fff;
    }
    .gb-storage-btn:active { transform: scale(.97); }
    .gb-storage-btn.gb-storage-danger {
        background: rgba(255,92,92,.15);
        border-color: rgba(255,92,92,.4);
        color: #ff8c8c;
    }
    .gb-storage-btn.gb-storage-danger:hover {
        background: rgba(255,92,92,.3);
        border-color: #ff5c5c;
        color: #fff;
    }
    
    /* ===== Storage modal (export/import) ===== */
    .gb-storage-modal {
        position: fixed; inset: 0;
        z-index: 1000010;
        background: rgba(0,0,0,.85);
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: monospace;
    }
    .gb-storage-modal-box {
        background: #1a1a1a;
        padding: 16px;
        border-radius: 8px;
        width: min(700px, 90vw);
        display: flex;
        flex-direction: column;
        gap: 10px;
        border: 1px solid #444;
        box-sizing: border-box;
    }
    .gb-storage-modal-title {
        color: #9147ff;
        font-size: 16px;
        font-weight: bold;
    }
    .gb-storage-modal-text {
        width: 100%;
        height: 260px;
        background: #000;
        color: #efeff1;
        border: 1px solid #444;
        border-radius: 6px;
        padding: 8px;
        font-family: monospace;
        font-size: 12px;
        box-sizing: border-box;
        resize: vertical;
    }
    .gb-storage-modal-actions {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
    }
    `;
        document.head.appendChild(style);
    }

    showInfo() {
        // Если уже показано — скрыть.
        const existingHelp = this.zone2.querySelector(".gb-help");

        if (existingHelp) {
            // Закрытие: вернуть всё как было до F2.
            existingHelp.remove();
            this.zone2.dataset.shown = "0";
            this._hideZoneOutlines();

            const snap = this._helpSnapshot;
            if (snap) {
                if (this.info) this.info.style.display = snap.infoDisplay;

                const menu = this.resizeMenu;
                if (menu) {
                    menu.style.opacity = snap.menuOpacity;
                    menu.style.pointerEvents = snap.menuPointerEvents;

                    // NEW: снять замок и восстановить title/disabled по точкам.
                    menu.classList.remove("gb-help-locked");
                    this.updateResizeMenuValues(menu);
                }
                this._helpSnapshot = null;
            }
            this._updateCellPinned();

            return;
        }

        // Открытие: снять снимок текущего состояния.
        const menu = this.resizeMenu;
        this._helpSnapshot = {
            infoDisplay: this.info ? this.info.style.display : "",
            menuOpacity: menu ? menu.style.opacity : "",
            menuPointerEvents: menu ? menu.style.pointerEvents : ""
        };

        // Остановить fade, чтобы за время help состояние не «уехало».
        this._clearFadeTimers();

        this.zone2.dataset.shown = "1";
        if (this.info) this.info.style.display = "none";

        // Help открыт — гасим hover и pinned-cell, чтобы не просвечивали.
        if (this.hover) this.hover.style.display = "none";
        this._hideHover();               // cellColLabel / cellRowLabel
        if (this.cellPinned) this.cellPinned.style.display = "none";

        // Поднять меню из fade/Shift+3 — чтобы пользователь видел ширину zone3.
        if (menu) {
            menu.style.transition = "none";
            menu.style.opacity = "1";
            menu.style.pointerEvents = "auto";

            // NEW: замок на кнопки движения.
            menu.classList.add("gb-help-locked");
            this.updateResizeMenuValues(menu);
        }

        this._showZoneOutlines();

        const col = (c) => `<div class="col">${c}</div>`;
        const row = (n) => `<div class="row">${n}</div>`;
        const cell = (id, points = "") =>
            `<div class="cell">${id}${points}</div>`;

        const pt1 = `<span class="gb-point tl">1</span>`;
        const pt2 = `<span class="gb-point br">2</span>`;
        const pt3 = `<span class="gb-point br">3</span>`;

        const gridHTML = `
    ${row(1)}${cell("А1", pt1 + pt2)}${cell("Б1")}${cell("В1")}${cell("Г1")}
    ${row(2)}${cell("А2")}${cell("Б2")}${cell("В2")}${cell("Г2")}
    ${row(3)}${cell("А3")}${cell("Б3")}${cell("В3")}${cell("Г3")}
    ${row(4)}${cell("А4")}${cell("Б4")}${cell("В4")}${cell("Г4", pt3)}
`;

        this.zone2.innerHTML = `
    <div class="gb-help">
        <h2>chatdefgrid</h2>
        <div class="dim">Скрыть вкладки браузера · F11</div>
        <div class="dim">Скрыть оверлей · Shift + 1</div>
        <button class="gb-theatre-btn" type="button" title="Переключить режим кинотеатра">
        ▶ Перейти в Theatre Mode · alt + t
        </button>

        <h3>Размеры панелей (px)</h3>
        <div class="gb-layout-grid">
            <label>Команды
                <input class="gb-layout-input" type="number" min="40" max="400" step="5" data-var="--gb-col1">
            </label>
            <label>Управление точками
                <input class="gb-layout-input" type="number" min="60" max="400" step="5" data-var="--gb-col3">
            </label>
            <label>Сетки
                <input class="gb-layout-input" type="number" min="40" max="400" step="5" data-var="--gb-col4">
            </label>
            <button class="gb-layout-reset" type="button">Сброс</button>
        </div>
        <hr>

        <hr>
        <h3>Построение</h3>
        <ol>
            <li>Наведи на левый верхний угол А1 → <b>1</b></li>
            <li>Наведи на правый нижний угол А1 → <b>2</b></li>
            <li>Наведи на правый нижний угол таблицы → <b>3</b></li>
        </ol>
        <hr>

        <h3>Панель точек</h3>
        <p>Шаг 1 / 0.5 / 0.1 / 0.01 px. Точка 3 меняет размер таблицы, не ячейки.</p>
        <p>Через 10 с бездействия сетка и панель плавно скрываются.
        Вернуть — переместить точку, загрузить слот или Shift+3.</p>
        <hr>

        <h3>Команды</h3>
        <p>Формат: <b>Название !команда</b> — одна команда на строку</p>
        <p class="small dim">Допустим и двухстрочный вариант:
            <b>Название</b> на одной строке, <b>!команда</b> — на следующей.</p>
        <ul>
            <li><b>{coord}</b> — подставляется выбранная координата</li>
        </ul>
        <p>Пример:</p>
        <pre class="gb-code">Башня !Б 1 {coord}
        Холод !Б 2 {coord}
        Улучшить !у</pre>
        <p>Кнопки получат имена <b>Башня</b>, <b>Холод</b>, <b>Улучшить</b>.</p>

        <h3>Сохранённые сетки</h3>
        <p>Панель справа. Сетка <b>сохраняется автоматически</b> после установки
        точки 3. <b>Shift+S</b> — добавить ещё слот. Клик по слоту — загрузить.</p>
        <p>Активная сетка подсвечена белым. Удалить отдельный слот нельзя —
        только все данные сразу: F2 → «Данные» → «Очистить».</p>

        <h3>Данные (localStorage)</h3>
        <p class="small dim">Экспорт копирует JSON в буфер. Импорт заменяет данные
        и перезагружает страницу. Shift+Delete (выгрузка скрипта) данные
        не трогает — стереть можно только кнопкой «Очистить».</p>
        <div class="gb-storage-stats">
            <div>Настройки панелей: <span id="gb-storage-layout">—</span></div>
            <div>Сохранённые сетки: <span id="gb-storage-grids">—</span></div>
            <div>Команды: <span id="gb-storage-commands">—</span></div>
        </div>
        <div class="gb-storage-actions">
            <button type="button" class="gb-storage-btn" data-storage-action="export">📤 Экспорт</button>
            <button type="button" class="gb-storage-btn" data-storage-action="import">📥 Импорт</button>
            <button type="button" class="gb-storage-btn gb-storage-danger" data-storage-action="clear">🗑 Очистить</button>
        </div>
        <hr>

        <h3>Горячие клавиши</h3>
        <table>
            <tr><td>1 / 2 / 3</td><td>точки 1, 2, 3</td></tr>
            <tr><td>Shift+1</td><td>скрыть/показать приложение</td></tr>
            <tr><td>Shift+3</td><td>прозрачность</td></tr>
            <tr><td>Shift+S</td><td>сохранить сетку</td></tr>
            <tr><td>Delete</td><td>сброс сетки</td></tr>
            <tr><td>Shift+Delete</td><td>выгрузить скрипт (данные сохранятся)</td></tr>
            <tr><td>F2</td><td>справка (toggle)</td></tr>
            <tr><td>клик мимо панелей</td><td>снять выделение команды / клетки</td></tr>
        </table>
        <hr>

        <h3>Лимиты</h3>
        <p>Максимум 200×200 ячеек, минимум 1px.</p>
        <hr>

        <h3>Пример: сетка 4×4</h3>
        <div class="gb-grid">
            <div></div>
            ${col("А")}${col("Б")}${col("В")}${col("Г")}
            ${gridHTML}
        </div>

        <p class="small">
            <span style="color:red;font-weight:bold">1</span> — левый верхний угол А1 ·
            <span style="color:red;font-weight:bold">2</span> — правый нижний угол А1 ·
            <span style="color:red;font-weight:bold">3</span> — правый нижний угол таблицы
        </p>
        <p class="small dim" style="margin:0">
            Клик по ячейке подставит координату в команды вместо <b>{coord}</b>.
        </p>
    </div>
    `;

        this._fillLayoutInputs();
        this._fillStorageStats();
    }

    _fillLayoutInputs() {
        const saved = this._readLayoutVars();
        const values = {
            "--gb-col1": saved.col1 ?? 165,
            "--gb-col3": saved.col3 ?? 180,
            "--gb-col4": saved.col4 ?? 80
        };

        this.zone2.querySelectorAll(".gb-layout-input").forEach(input => {
            input.value = values[input.dataset.var];
        });
    }

    _saveLayoutVars() {
        const gv = (name) => parseInt(
            getComputedStyle(this.overlay).getPropertyValue(name), 10
        ) || 0;

        this._safeSaveLayout({
            col1: gv("--gb-col1"),
            col3: gv("--gb-col3"),
            col4: gv("--gb-col4")
        });
    }

    _resetLayoutVars() {
        this.overlay.style.setProperty("--gb-col1", "165px");
        this.overlay.style.setProperty("--gb-col3", "180px");
        this.overlay.style.setProperty("--gb-col4", "80px");
        this._saveLayoutVars();
        this._updateZoneOutlineLabels();

        // Синхронизируем поля, если help открыт.
        this.zone2.querySelectorAll(".gb-layout-input").forEach(input => {
            const v = getComputedStyle(this.overlay)
                .getPropertyValue(input.dataset.var)
                .trim()
                .replace("px", "");
            input.value = v;
        });
    }

    _updateCommandButtonState(button, command) {
        const needsCoord = command.cmd.includes("{coord}");
        const hasGrid = this.state.cols > 0 && this.state.rows > 0;
        const cellSel = this.state.selection?.type === 'cell'
            ? this.state.selection
            : null;

        if (needsCoord && !hasGrid) {
            button.title = "Сначала постройте сетку";
            button.classList.add("gb-cmd-needs-coord");
            return;
        }

        button.classList.remove("gb-cmd-needs-coord");

        if (!needsCoord) {
            button.title = command.cmd;
        } else if (cellSel) {
            button.title = `Отправить с клеткой ${cellSel.coord}`;
        } else {
            button.title = "Выделите команду, затем кликайте по клеткам";
        }
    }

    createCommandsPanel() {
        this.commandsPanel = document.createElement("div");
        this.commandsPanel.className = "gb-cmd-panel";
        this.zone1.appendChild(this.commandsPanel);
        // ... обработчик клика и showCommandsEditor() БЕЗ изменений

        this.commandsPanel.addEventListener("click", (e) => {
            if (this.zone2.dataset.shown === "1") return;

            const btn = e.target.closest(".cmd-btn");
            if (btn) {
                const i = Number(btn.dataset.index);
                const command = this.state.commands[i];
                if (!command) return;

                const needsCoord = command.cmd.includes("{coord}");
                const hasGrid = this.state.cols > 0 && this.state.rows > 0;

                // Команда без {coord} — всегда сразу отправка.
                if (!needsCoord) {
                    this.twitchSend(this._renderCommand(command.cmd, null));
                    return;
                }

                // С {coord}, но сетки нет — игнор.
                if (!hasGrid) {
                    this.info.textContent = "Сначала постройте сетку — команда содержит {coord}";
                    return;
                }

                // Сетка есть. Выделена клетка → отправка с этой клеткой, выделение клетки оставляем.
                if (this.state.selection?.type === 'cell') {
                    this.twitchSend(
                        this._renderCommand(command.cmd, this.state.selection.coord)
                    );
                    return;
                }

                // Выделена команда → toggle/переключение.
                if (this.state.selection?.type === 'command') {
                    if (this.state.selection.index === i) {
                        this._setSelection(null);
                        this.info.textContent = "Выделение снято";
                    } else {
                        this._setSelection({ type: 'command', index: i });
                        this.info.textContent = `Команда «${command.label}» выделена`;
                    }
                    return;
                }

                // Ничего не выделено → выделяем команду.
                this._setSelection({ type: 'command', index: i });
                this.info.textContent = `Команда «${command.label}» выделена`;
                return;
            }

            const edit = e.target.closest(".cmd-edit");
            if (edit) this.showCommandsEditor();
        });
        if (this.state.commands.length > 0) {
            this.showCommandsButtons();
        } else {
            this.showCommandsEditor();
        }
    }

    showCommandsEditor() {
        this._setSelection(null);
        this.state.commandsSaved = false;
        this.commandsPanel.innerHTML = "";

        const saveButton = document.createElement("button");
        saveButton.textContent = "💾 Сохранить";
        saveButton.type = "button";
        saveButton.className = "gb-cmd-save";

        const textarea = document.createElement("textarea");
        textarea.placeholder =
            "{coord} заменяется на выбранную координату.\n\n" +
            "Формат: Название !команда (одна команда на строку)\n\n" +
            "Башня !Б 1 {coord}\n" +
            "Холод !Б 2 {coord}\n" +
            "Улучшить !у";
        textarea.className = "gb-cmd-textarea";

        // Защита: commandsRaw может отсутствовать (старый state) — подстрахуемся.
        const raw = this.state.commandsRaw;
        textarea.value = (typeof raw === "string")
            ? raw
            : this.state.commands
                .map(c => `((${c.label})(${c.cmd}))`)
                .join(" ");

        saveButton.addEventListener("click", () => {
            const value = textarea.value;
            const parsed = this._parseCommands(value);

            if (parsed.error) {
                textarea.classList.add("gb-cmd-textarea-error");
                this.info.textContent = "Ошибка в командах: " + parsed.error;
                return;
            }

            textarea.classList.remove("gb-cmd-textarea-error");
            this.state.commands = parsed.commands;
            this.state.commandsRaw = value;
            this._saveCommands(value);
            this.state.commandsSaved = true;
            this.showCommandsButtons();
        });

        textarea.addEventListener("input", () => {
            textarea.classList.remove("gb-cmd-textarea-error");
        });

        this.commandsPanel.append(saveButton, textarea);
    }

    showCommandsButtons() {
        this.commandsPanel.innerHTML = "";

        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.className = "cmd-edit gb-cmd-edit";
        editButton.textContent = "⚙ Изменить команды";
        this.commandsPanel.appendChild(editButton);

        const list = document.createElement("div");
        list.className = "gb-cmd-list";

        this.state.commands.forEach((command, i) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "cmd-btn gb-cmd-btn";
            button.dataset.index = i;
            button.textContent = command.label;
            this._updateCommandButtonState(button, command);   // ← вместо прямого title
            list.appendChild(button);
        });

        this.commandsPanel.appendChild(list);
        this._updatePinnedVisuals();
    }

    _renderCommand(cmd, coord) {
        return coord ? cmd.replace(/\{coord\}/g, coord) : cmd;
    }
    _setSelection(selection) {
        this.state.selection = selection;
        this._updatePinnedVisuals();
    }

    _updatePinnedVisuals() {
        this.commandsPanel?.querySelectorAll(".cmd-btn.gb-pinned")
            .forEach(btn => btn.classList.remove("gb-pinned"));

        if (this.state.selection?.type === 'command') {
            const btn = this.commandsPanel?.querySelector(
                `.cmd-btn[data-index="${this.state.selection.index}"]`
            );
            if (btn) {
                btn.classList.add("gb-pinned");
                btn.title = "Кликайте по клеткам — команда отправится";
            }
        }

        // Сбросить title у остальных, у кого раньше был pinned-заголовок.
        this.commandsPanel?.querySelectorAll(".cmd-btn:not(.gb-pinned)")
            .forEach(btn => {
                const i = Number(btn.dataset.index);
                const command = this.state.commands[i];
                if (command) this._updateCommandButtonState(btn, command);
            });

        this._updateCellPinned();
    }

    _updateCellPinned() {
        if (!this.cellPinned) return;

        if (!this.state.visible) {              // ← NEW
            this.cellPinned.style.display = "none";
            return;
        }

        // Help открыт — не показываем (просвечивает через фон справки).
        if (this.zone2?.dataset.shown === "1") {
            this.cellPinned.style.display = "none";
            return;
        }

        if (this.state.selection?.type !== 'cell') {
            this.cellPinned.style.display = "none";
            return;
        }

        const { x, y } = this.state.selection;
        const { p1, cellW, cellH, cols, rows } = this.state;

        if (x < 0 || y < 0 || x >= cols || y >= rows) {
            this.cellPinned.style.display = "none";
            return;
        }

        this.cellPinned.style.display = "block";
        this.cellPinned.style.opacity = "1";        // ← NEW: снять faded
        this.cellPinned.style.left = (p1.x + x * cellW) + "px";
        this.cellPinned.style.top = (p1.y + y * cellH) + "px";
        this.cellPinned.style.width = cellW + "px";
        this.cellPinned.style.height = cellH + "px";
    }

    _validateSelection() {
        if (this.state.selection?.type === 'cell') {
            const { x, y } = this.state.selection;
            if (x >= this.state.cols || y >= this.state.rows) {
                this.state.selection = null;
                this.info.textContent =
                    "Выделенная клетка вне новой сетки — выделение снято";
            }
        }
        this._updatePinnedVisuals();
    }

    _onDocumentClick(e) {
        if (!e.isTrusted) return;          // ← программные клики игнорируем
        if (e.target.closest?.(".gb-storage-modal")) return;

        // Клик внутри наших интерактивных зон — не трогаем.
        if (this.commandsPanel?.contains(e.target)) return;
        if (this.layers.grid?.contains(e.target)) return;
        if (this.resizeMenu?.contains(e.target)) return;
        if (this.savedGridsPanel?.contains(e.target)) return;
        if (this.zone2?.contains(e.target)) return;
        if (this.overlay?.contains(e.target)) return;

        // Клик «мимо» — снимаем выделение.
        if (this.state.selection) {
            this._setSelection(null);
        }
    }

    onMouseMove(e) {
        this.mouse.x = e.clientX;
        this.mouse.y = e.clientY;
    }

    // Управление видеоплеером
    hidePlayer() {
        const el = document.querySelector(
            ".video-player__default-player"
        );

        if (!el) return;

        if (this.player !== el) {
            this.player = el;
            this.previousDisplay = el.style.display;
            this.playerWasHidden = el.style.display === "none";
        }

        this.player.style.display = "none";
    }

    //
    hidePanel() {
        if (!this.state.visible) return;
        this.state.overlayDisplay = this.overlay.style.display;
        this.overlay.style.display = "none";
        this.state.visible = false;
        this._updateCellPinned();
    }

    restorePlayer() {
        if (!this.player) return;

        // Не показываем элемент принудительно, если он был скрыт изначально
        if (!this.playerWasHidden) {
            this.player.style.display = this.previousDisplay;
        }

        this.player = null;
    }

    restorePanel() {
        // Восстанавливаем сохранённый display
        this.overlay.style.display =
            this.state.overlayDisplay || "grid";

        this.state.visible = true;
        this._updateCellPinned();
    }
    // Установка точки
    setPoint(number) {
        if (!this.state.visible) return;
        this.setGridInvisible(false);

        const gridExists = this.state.cols > 0 && this.state.rows > 0;
        const oldPoint = this.state["p" + number]
            ? { ...this.state["p" + number] } : null;

        this.state["p" + number] = { x: this.mouse.x, y: this.mouse.y };
        this.addPoint(this.state["p" + number], number);

        // EDIT — при существующей сетке
        if (gridExists) {
            const res = this._applyGeometry();
            if (res.error) {
                if (oldPoint) this.state["p" + number] = oldPoint;
                this._refreshPoints();
                this.info.textContent = "Точка не установлена: " + res.error;
                return;
            }
            if (res.changed) this.createGrid();
            else this.layoutGrid();
            this._refreshPoints();
            if (this.state.activeGridId !== null) this.updateActiveGrid();
            this.startGridFadeTimer();
            this.info.textContent = `Точка ${number} обновлена`;
            return;
        }

        // INIT — как было
        if (number === 1) this.info.textContent = "Точка 1 выбрана. Переместите курсор в угол нажми 2";
        if (number === 2) this.info.textContent = "Точка 2 выбрана. Переместите курсор в правый нижний край нажми 3";
        if (number === 3) {
            if (!this.createGrid()) {
                if (oldPoint) this.state.p3 = oldPoint;
                else delete this.state.p3;
                this._refreshPoints();
                return;
            }
            this.saveCurrentGrid();
            this._finishGridSetup();
            this.info.textContent = "Сетка готова. Нажми F2 для справки";
        }
    }

    // Создание или обновление маркера
    addPoint(p, number) {
        let el = this.overlay.querySelector(".point-marker-" + number);

        if (!el) {
            el = document.createElement("div");
            el.className = `point-marker point-marker-${number} gb-point-marker`;
            el.innerHTML = `<span>${number}</span>`;
            this.overlay.appendChild(el);
        }

        el.style.left = p.x + "px";
        el.style.top = p.y + "px";
    }

    // Очистка элементов сетки
    clearGrid() {
        // Снимаем обработчики слоя.
        if (this.layers.grid && this._layerHandlers) {
            const l = this.layers.grid;
            l.removeEventListener("mousemove", this._layerHandlers.onMouseMove);
            l.removeEventListener("mouseleave", this._layerHandlers.onMouseLeave);
            l.removeEventListener("click", this._layerHandlers.onClick);
            this._layerHandlers = null;
        }
        // Скрываем hover-индикаторы.
        this._hideHover();

        // Удаляем индикаторы координаты.
        if (this.cellColLabel) { this.cellColLabel.remove(); this.cellColLabel = null; }
        if (this.cellRowLabel) { this.cellRowLabel.remove(); this.cellRowLabel = null; }

        // Обнуляем ссылки на лейблы.
        this.colLabels = null;
        this.rowLabels = null;

        // Удаляем hover.
        if (this.hover) {
            this.hover.remove();
            this.hover = null;
        }
        // Удаляем pinned.
        if (this.cellPinned) {
            this.cellPinned.remove();
            this.cellPinned = null;
        }

        // Удаляем слой и подписи.
        this.overlay.querySelectorAll(".grid-item").forEach(el => el.remove());

        this.layers.grid = null;
    }

    // Русские обозначения колонок: А, Б, ... Ё, Ж ...
    cyr(num) {
        if (!Number.isFinite(num) || num < 1) return "";
        const letters = [
            "А", "Б", "В", "Г", "Д", "Е", "Ё", "Ж", "З",
            "И", "Й", "К", "Л", "М", "Н", "О", "П",
            "Р", "С", "Т", "У", "Ф", "Х", "Ц", "Ч",
            "Ш", "Щ", "Ъ", "Ы", "Ь", "Э", "Ю", "Я"
        ];

        let result = "";

        while (num > 0) {
            const index = (num - 1) % letters.length;
            result = letters[index] + result;
            num = Math.floor((num - 1) / letters.length);
        }

        return result;
    }

    // Боковая панель перемещения точек
    createResizeMenu() {
        const prevStep = this.resizeMenu
            ? this.resizeMenu.querySelector("#grid-move-step")?.value
            : undefined;

        if (!this.resizeMenu) {
            this.resizeMenu = document.createElement("div");
            this.resizeMenu.id = "grid-resize-menu";
            this.resizeMenu.className = "gb-resize-menu";

            this.resizeMenu.innerHTML = `
            <div style="font-weight:bold;font-size:15px;margin-bottom:12px">
                Управление точками
            </div>
            <div id="grid-menu-hint" style="opacity:.6;font-size:11px;margin-bottom:8px"></div>

            <label>
                Шаг перемещения:
                <select id="grid-move-step"
                    style="width:100%;margin-top:6px;margin-bottom:14px">
                    <option value="1">1 px</option>
                    <option value="0.5" selected>0.5 px</option>
                    <option value="0.1">0.1 px</option>
                    <option value="0.01">0.01 px</option>
                </select>
            </label>

            ${[1, 2, 3].map(n => `
                <div style="border-top:1px solid #666;padding-top:10px;margin-top:10px">
                    <b>Точка ${n}</b>
                    <div id="grid-p${n}-coords" style="margin:6px 0;line-height:1.6"></div>
                    <div class="move-controls" data-point="${n}"></div>
                </div>
            `).join("")}

            <div style="border-top:1px solid #666;padding-top:10px;margin-top:12px;line-height:1.8">
                Столбцов: <span id="grid-cols-value"></span><br>
                Строк: <span id="grid-rows-value"></span>
            </div>
        `;

            this.resizeMenu.addEventListener("click", (e) => {
                const btn = e.target.closest(".move-btn");
                if (!btn || btn.disabled) return;

                if (this.resizeMenu.classList.contains("gb-help-locked")) return;

                const pointNumber = Number(btn.dataset.point);
                const dx = Number(btn.dataset.dx);
                const dy = Number(btn.dataset.dy);
                if (!dx && !dy) return;
                this._movePoint(pointNumber, dx, dy);
            });

            this.zone3.appendChild(this.resizeMenu);

            this.resizeMenu.querySelectorAll(".move-controls").forEach(controls => {
                this.createMoveControls(controls, this.resizeMenu);
            });
        }

        if (prevStep !== undefined) {
            this.resizeMenu.querySelector("#grid-move-step").value = prevStep;
        }
        this.updateResizeMenuValues(this.resizeMenu);
    }

    createMoveControls(controls) {
        controls.className = "gb-move-controls";

        const pointNumber = Number(controls.dataset.point);
        const buttons = [
            ["", 0, 0], ["▲", 0, -1], ["", 0, 0],
            ["◀", -1, 0], ["•", 0, 0], ["▶", 1, 0],
            ["", 0, 0], ["▼", 0, 1], ["", 0, 0]
        ];

        buttons.forEach(([label, dx, dy]) => {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = label || " ";
            button.disabled = !label;
            button.title = label ? `Переместить точку ${pointNumber}` : "";
            button.className = "gb-move-btn" + (label ? " move-btn" : "");

            if (label) {
                button.dataset.point = pointNumber;
                button.dataset.dx = dx;
                button.dataset.dy = dy;
            }

            controls.appendChild(button);
        });
    }

    updateResizeMenuValues(menu) {
        [1, 2, 3].forEach(n => {
            const point = this.state["p" + n];
            const coords = menu.querySelector(`#grid-p${n}-coords`);
            if (!coords) return;

            coords.innerHTML = point
                ? `X: ${point.x.toFixed(2)}<br>Y: ${point.y.toFixed(2)}`
                : `X: —<br>Y: —`;
        });

        const locked = menu.classList.contains("gb-help-locked");

        menu.querySelectorAll(".move-btn").forEach(btn => {
            const pointNumber = Number(btn.dataset.point);
            const hasPoint = Boolean(this.state["p" + pointNumber]);

            btn.disabled = !hasPoint;

            if (!hasPoint) {
                btn.title = "";
            } else if (locked) {
                btn.title = "Закройте справку (F2), чтобы управлять точками";
            } else {
                btn.title = `Переместить точку ${pointNumber}`;
            }
        });

        menu.querySelector("#grid-cols-value").textContent = this.state.cols || "—";
        menu.querySelector("#grid-rows-value").textContent = this.state.rows || "—";

        // Подсказка-статус.
        const hint = menu.querySelector("#grid-menu-hint");
        if (hint) {
            const hasAll = this.state.p1 && this.state.p2 && this.state.p3;
            hint.textContent = hasAll ? "" : "Точки не заданы — нажмите 1, 2, 3";
            hint.style.display = hasAll ? "none" : "block";
        }
    }

    // Полный сброс сетки с сохранением скрипта
    clearAll() {
        this._clearFadeTimers();

        this.clearGrid();

        this.overlay.querySelectorAll(".point-marker").forEach(el => el.remove());

        this.state.p1 = null;
        this.state.p2 = null;
        this.state.p3 = null;

        this.state.cellW = 0;
        this.state.cellH = 0;
        this.state.rows = 0;
        this.state.cols = 0;

        const menu = this.resizeMenu;
        if (menu) {
            menu.style.opacity = "1";
            menu.style.pointerEvents = "auto";
            this.updateResizeMenuValues(menu);
        }

        // Снимаем выбор, но НЕ удаляем из savedGrids.
        this.state.activeGridId = null;
        this.state.gridInvisible = false;
        this.state.selection = null;
        this._updatePinnedVisuals();
        this.state.commandsSaved = false;

        this.updateSavedGridsPanel();

        this.info.textContent =
            "Ожидание точки 1. Наведите курсор на левый верхний угол и нажмите 1";
    }
    // Справка
    showHelp() {
        this.showInfo();
    }
    // ===============================
    // СОХРАНЕНИЕ СЕТОК
    // ===============================
    saveCurrentGrid() {
        const { p1, p2, p3, cols, rows } = this.state;

        if (!p1 || !p2 || !p3 || cols <= 0 || rows <= 0) {
            return;
        }

        const grid = {
            id: this.state.activeGridId ?? this._generateGridId(),

            p1: { x: p1.x, y: p1.y },
            p2: { x: p2.x, y: p2.y },
            p3: { x: p3.x, y: p3.y },

            cellW: this.state.cellW,
            cellH: this.state.cellH,
            cols: cols,
            rows: rows
        };

        const index = this.state.savedGrids.findIndex(
            g => g.id === grid.id
        );

        if (index !== -1) {
            this.state.savedGrids[index] = grid;
        } else {
            this.state.savedGrids.push(grid);
        }

        this.state.activeGridId = grid.id;

        this._saveSavedGrids()
        this.updateSavedGridsPanel();

        console.log("Автоматически сохранена готовая сетка:", grid);
    }

    _generateGridId() {
        let id = Date.now();
        while (this.state.savedGrids.some(g => g.id === id)) id++;
        return id;
    }

    saveNewGridSlot() {
        const { p1, p2, p3, cols, rows } = this.state;

        if (!p1 || !p2 || !p3 || cols <= 0 || rows <= 0) {
            this.info.textContent = "Сначала полностью постройте сетку";
            return;
        }

        const grid = {
            id: this._generateGridId(),

            p1: { x: p1.x, y: p1.y },
            p2: { x: p2.x, y: p2.y },
            p3: { x: p3.x, y: p3.y },

            cellW: this.state.cellW,
            cellH: this.state.cellH,
            cols,
            rows
        };

        this.state.savedGrids.push(grid);

        this.state.activeGridId = grid.id;
        this._saveSavedGrids();
        this.updateSavedGridsPanel();

        console.log("Создан новый слот:", grid);
    }

    // Название сетки.
    getGridName(grid = null) {

        if (!grid) {
            grid = {
                p1: this.state.p1,
                p2: this.state.p2,
                p3: this.state.p3
            };
        }

        if (!grid.p1 || !grid.p2 || !grid.p3) {
            return "Новая сетка";
        }

        const cellW = Math.abs(grid.p2.x - grid.p1.x);
        const cellH = Math.abs(grid.p2.y - grid.p1.y);

        if (cellW <= 0 || cellH <= 0) {
            return "Новая сетка";
        }

        const cols = Math.floor(
            Math.abs(grid.p3.x - grid.p1.x) / cellW
        );

        const rows = Math.floor(
            Math.abs(grid.p3.y - grid.p1.y) / cellH
        );

        if (cols <= 0 || rows <= 0) return "Новая сетка";
        return `${this.cyr(cols)}${rows}`;
    }

    // Автоматическое обновление активной сетки
    updateActiveGrid() {
        if (this.state.activeGridId === null) return;

        const grid = this.state.savedGrids.find(
            g => g.id === this.state.activeGridId
        );
        if (!grid) return;

        grid.p1 = { x: this.state.p1.x, y: this.state.p1.y };
        grid.p2 = { x: this.state.p2.x, y: this.state.p2.y };
        grid.p3 = { x: this.state.p3.x, y: this.state.p3.y };

        grid.cellW = this.state.cellW;
        grid.cellH = this.state.cellH;
        grid.cols = this.state.cols;
        grid.rows = this.state.rows;

        this._saveSavedGrids()
        this.updateSavedGridsPanel();
    }

    // Загрузить сохранённую сетку
    loadGrid(grid) {
        if (typeof grid === "number") {
            grid = this.state.savedGrids.find(g => g.id === grid);
        }

        if (!grid || !grid.p1 || !grid.p2 || !grid.p3) {
            console.error("Не удалось загрузить сетку:", grid);
            return false;
        }

        const points = [grid.p1, grid.p2, grid.p3];

        if (!points.every(p =>
            Number.isFinite(p.x) && Number.isFinite(p.y)
        )) {
            console.error("Некорректные координаты сохранённой сетки:", grid);
            return false;
        }

        const previous = {
            p1: this.state.p1,
            p2: this.state.p2,
            p3: this.state.p3,
            activeGridId: this.state.activeGridId
        };

        this.state.p1 = { ...grid.p1 };
        this.state.p2 = { ...grid.p2 };
        this.state.p3 = { ...grid.p3 };

        const geometry = this._computeGeometry();

        if (geometry.error) {
            this.state.p1 = previous.p1;
            this.state.p2 = previous.p2;
            this.state.p3 = previous.p3;
            this.state.activeGridId = previous.activeGridId;

            this.info.textContent =
                "Не удалось загрузить сетку: " + geometry.error;

            return false;
        }

        this._clearFadeTimers();

        this.state.activeGridId = grid.id;
        this.state.gridInvisible = false;

        this.restorePanel();

        if (!this.createGrid()) {
            this.state.p1 = previous.p1;
            this.state.p2 = previous.p2;
            this.state.p3 = previous.p3;
            this.state.activeGridId = previous.activeGridId;

            if (previous.p1 && previous.p2 && previous.p3) {
                this.createGrid();
                this._refreshPoints();
            }

            return false;
        }
        this.state.selection = null;
        this._updatePinnedVisuals();

        this._finishGridSetup();
        return true;
    }

    // HTML-панель сохранённых сеток
    createSavedGridsPanel() {
        if (this.savedGridsPanel) return;

        this.savedGridsPanel = document.createElement("div");
        this.savedGridsPanel.id = "saved-grids-panel";
        this.savedGridsPanel.className = "gb-saved-panel";
        this.zone4.appendChild(this.savedGridsPanel);

        this.savedGridsPanel.addEventListener("click", (e) => {
            if (this.zone2.dataset.shown === "1") return;

            const btn = e.target.closest(".grid-slot");
            if (!btn || !this.savedGridsPanel.contains(btn)) return;
            this.loadGrid(Number(btn.dataset.id));
        });

        this.updateSavedGridsPanel();
    }

    // Обновить HTML кнопок
    updateSavedGridsPanel() {
        if (!this.savedGridsPanel) return;
        this._rebuildSavedGridsPanel(this.savedGridsPanel);
    }

    _rebuildSavedGridsPanel(panel) {
        panel.innerHTML = "";

        const title = document.createElement("div");
        title.className = "gb-saved-title";
        title.textContent = "Сохранённые сетки";
        panel.appendChild(title);

        if (this.state.savedGrids.length === 0) {
            const empty = document.createElement("div");
            empty.className = "gb-saved-empty";
            empty.textContent = "Нет сохранённых сеток";
            panel.appendChild(empty);
            return;
        }

        this.state.savedGrids.forEach(grid => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "grid-slot gb-grid-slot";
            if (grid.id === this.state.activeGridId) button.classList.add("active");
            button.dataset.id = grid.id;
            button.textContent = this.getGridName(grid);
            button.title = "Выбрать сетку " + this.getGridName(grid);
            panel.appendChild(button);
        });
    }

    onKeyDown(e) {
        if (e.repeat) return;
        // F2 — всегда, даже из полей ввода help-панели
        if (e.code === "F2") {
            e.preventDefault();
            this.showHelp();
            return;
        }
        // 1. Не перехватываем клавиши при вводе в поле
        const tag = e.target?.tagName;
        const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(tag) ||
            e.target?.isContentEditable;
        if (typing) return;

        // 2. Не мешаем системным сочетаниям
        if (e.ctrlKey || e.altKey || e.metaKey) return;

        const helpOpen = this.zone2.dataset.shown === "1";
        const code = e.code;   // ← единый источник истины

        // 4. Shift+1 — всегда (переключение оверлея)
        if (e.shiftKey && (code === "Digit1" || code === "Numpad1")) {
            e.preventDefault();
            if (this.state.visible) {
                // можно поднять в внешний if
                this.hidePanel();
                this.restorePlayer();
            } else {
                this.restorePanel();
                this.hidePlayer();
            }
            return;
        }
        // 5. Shift+Delete — всегда (аварийное удаление скрипта)
        if (e.shiftKey && e.code === "Delete") {
            e.preventDefault();
            e.stopPropagation();
            this._clearFadeTimers();
            this.destroy();
            alert("Скрипт выгружен. Данные сохранены — запустите снова, чтобы восстановить.");
            return;
        }
        // 6. Блокировка при открытой справке: 1/2/3 (в т.ч. numpad), Shift+S, Delete, Shift+3
        if (helpOpen) {
            if (/^(Digit|Numpad)[1-3]$/.test(code)) {
                e.preventDefault();
                return;
            }
            if (e.shiftKey && code === "KeyS") {
                e.preventDefault();
                return;
            }
            if (code === "Delete") {
                e.preventDefault();
                return;
            }
            if (
                e.shiftKey &&
                (code === "Digit3" || code === "Numpad3")
            ) {
                e.preventDefault();
                return;
            }
        }

        // 7. Shift+3 — прозрачность (заблокировано, если оверлей скрыт)
        if (e.shiftKey && (code === "Digit3" || code === "Numpad3")) {
            e.preventDefault();
            if (!this.state.visible) return; // переместить в верхний if блок 
            this.setGridInvisible(!this.state.gridInvisible);
            return;
        }

        // 8. Delete — сброс сетки (без Shift)
        if (code === "Delete" && !e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            this.clearAll();
            return;
        }

        // 9. Shift+S — сохранить текущую сетку
        if (e.shiftKey && code === "KeyS") {
            e.preventDefault();
            e.stopPropagation();
            this.saveNewGridSlot();
            return;
        }

        // 10. 1/2/3 — установка точек (верхний ряд + numpad), ТОЛЬКО без Shift
        const pointMatch = /^(Digit|Numpad)([1-3])$/.exec(code);
        if (pointMatch && !e.shiftKey) {
            e.preventDefault();
            this.setPoint(Number(pointMatch[2]));
            return;
        }
    }

    _showCellOnly() {
        this._clearFadeTimers();
        this.state.gridInvisible = true;
        this._showCellPinned();
        this._scheduleCellPinnedFade();
    }

    _showCellPinned() {
        if (!this.cellPinned) return;
        this.cellPinned.style.transition = "none";
        this.cellPinned.style.opacity = "1";
    }

    _scheduleCellPinnedFade() {
        clearTimeout(this._cellFadeTimer);
        this._cellFadeTimer = setTimeout(() => {
            this._cellFadeTimer = null;
            if (this.cellPinned) {
                this.cellPinned.style.transition = "opacity 5s ease";
                this.cellPinned.style.opacity = "0";
            }
        }, 10000);
    }

    _startFadeForSelection() {
        if (this.state.gridInvisible) this._showCellOnly();
        else this.startGridFadeTimer();
    }

    startGridFadeTimer() {
        this._clearFadeTimers();
        if (!this.state.visible) return;

        this.state.gridInvisible = false;

        const menu = this.resizeMenu;
        if (menu) {
            menu.style.transition = "none";
            menu.style.opacity = "1";
            menu.style.pointerEvents = "auto";
        }

        const getElements = () => {
            const els = Array.from(this.overlay.querySelectorAll(
                ".grid-item, .point-marker, #grid-resize-menu"
            ));
            if (this.cellPinned) els.push(this.cellPinned);   // ← NEW
            return els;
        };

        const elements = getElements();
        elements.forEach(el => {
            el.style.transition = "none";
            el.style.opacity = "1";
        });

        this.gridFadeFrame = requestAnimationFrame(() => {
            this.gridFadeFrame = null;

            this.gridFadeTimer = setTimeout(() => {
                getElements().forEach(el => {
                    el.style.transition = "opacity 5s ease";
                    el.style.opacity = "0";
                });

                if (menu) menu.style.pointerEvents = "none";

                this.state.gridInvisible = true;
            }, 10000);
        });
    }

    // Полное удаление класса и его обработчиков
    destroy() {
        // 1. Таймеры
        this._destroyed = true;

        this._clearFadeTimers();

        if (this._sendTimer) {
            clearTimeout(this._sendTimer);
            this._sendTimer = null;
        }
        if (this._sendResolve) {
            const r = this._sendResolve;
            this._sendResolve = null;
            r();   // ← разблокирует очередь
        }

        // 2. DOM-слой (снимает cellColLabel/cellRowLabel через clearGrid)
        this.clearGrid();
        this.overlay.remove();

        // 3. Стили
        document.getElementById("gb-styles")?.remove();

        // 4. Глобальные слушатели
        document.removeEventListener("mousemove", this.onMouseMove);
        document.removeEventListener("keydown", this.onKeyDown);
        document.removeEventListener("click", this._onDocumentClick);

        // Hover-слушатели с панелей.
        clearTimeout(this._panelLeaveTimerRef?.());
        clearTimeout(this._cellFadeTimer);
        if (this._panelHoverPanels) {
            this._panelHoverPanels.forEach(p => {
                p.removeEventListener("mouseenter", this._panelEnterHandler);
                p.removeEventListener("mouseleave", this._panelLeaveHandler);
            });
        }
        // 5. Плеер
        this.restorePlayer();

        //// 6. localStorage — только то, что создали сами
        //const OWNED_KEYS = ["gb-layout", "gb-saved-grids", "gb-commands"];
        //OWNED_KEYS.forEach(k => {
        //    try { localStorage.removeItem(k); } catch { }
        //});

        // 7. Глобал
        if (window.gridBuilder === this) delete window.gridBuilder;
    }
}

// Запуск
function getGridBuilder() {
    return window.gridBuilder ?? new GridBuilder();
}

// Запуск
getGridBuilder();