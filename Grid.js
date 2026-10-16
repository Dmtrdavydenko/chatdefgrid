class GridBuilder {
    constructor() {
        if (window.gridBuilder) {
            alert("Скрипт уже запущен");
            return window.gridBuilder;
        }

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
            commandsSaved: false,
            selectedCoord: null,
            overlayDisplay: "grid",

            // Сохранённые сетки
            savedGrids: [],

            // ID выбранной сохранённой сетки
            activeGridId: null
        };

        this.mouse = { x: 0, y: 0 };
        this.player = null;
        this.previousDisplay = "";
        this.playerWasHidden = false;

        this.createOverlay();
        this.createInfo();
        this.createCommandsPanel();
        this.createSavedGridsPanel();

        this.hidePanel();

        //this.hidePlayer();

        this.onMouseMove = this.onMouseMove.bind(this);
        this.onKeyDown = this.onKeyDown.bind(this);

        document.addEventListener("mousemove", this.onMouseMove);
        document.addEventListener("keydown", this.onKeyDown);

        window.gridBuilder = this;

        alert(`
Readme
1.Закрыть консоль разработчика.`
        );
        alert(`
2.Shift + 1 показать/скрывает оверлей оверлей сетки/твич 
Использовать лучше с 
* режимом Theatre mode/Режим кинотеатра
* Полноэкранный режим F11
`);
        alert(`
Точками 1 и 2 построить диагональ для А1
Точку 3 поставить в крайний правый низ сетки

Построение сетки
Навести курсор нажать
цифрой 1 - поставить точку 1
цифрой 2 - поставить точку 2
цифрой 3 - поставить точку 3

SHIFT + 1 - скрыть/показать сетку
SHIFT + 3 - сделать невидимой

DELETE - сбросить сетку
SHIFT + DELETE - удалить скрипт

Клик по ячейке подставит в блоке команд за место "-" координату

F2 - справка
`);
    }

    // Построение сетки

    createGrid() {
        const { p1, p2, p3 } = this.state;
        if (!p1 || !p2 || !p3) return false;

        if (p2.x <= p1.x || p2.y <= p1.y) {
            this.info.textContent = "Точка 2 должна быть правее и ниже точки 1";
            return false;
        }
        if (p3.x <= p1.x || p3.y <= p1.y) {
            this.info.textContent = "Точка 3 должна быть правее и ниже точки 1";
            return false;
        }

        const cellW = p2.x - p1.x;
        const cellH = p2.y - p1.y;

        if (cellW < 1 || cellH < 1) {
            this.info.textContent = "Ячейка слишком маленькая";
            return false;
        }

        const MAX = 200;
        const rawCols = Math.floor((p3.x - p1.x) / cellW);
        const rawRows = Math.floor((p3.y - p1.y) / cellH);

        if (rawCols < 1 || rawRows < 1) {
            this.info.textContent = "Слишком мало ячеек";
            return false;
        }
        if (rawCols > MAX || rawRows > MAX) {
            this.info.textContent =
                `Слишком большая сетка (${rawCols}×${rawRows}). Максимум ${MAX}×${MAX}.`;
            return false;
        }

        this.state.cellW = cellW;
        this.state.cellH = cellH;
        this.state.cols = rawCols;
        this.state.rows = rawRows;

        // Удаляем старую сетку, подписи и меню (маркеры точек остаются).
        this.clearGrid();

        // Строим заново.
        this.buildGridLayer();
        this.buildColLabels();
        this.buildRowLabels();
        this.createResizeMenu();

        return true;
    }

    buildGridLayer() {
        const { p1, cellW, cellH, cols, rows } = this.state;

        const layer = document.createElement("div");
        layer.className = "grid-item grid-layer";

        Object.assign(layer.style, {
            position: "fixed",
            left: p1.x + "px",
            top: p1.y + "px",
            width: (cols * cellW) + "px",
            height: (rows * cellH) + "px",
            backgroundImage:
                "linear-gradient(to right, rgba(0,120,255,.35) 1px, transparent 1px)," +
                "linear-gradient(to bottom, rgba(0,120,255,.35) 1px, transparent 1px)",
            backgroundSize: `${cellW}px ${cellH}px`,
            pointerEvents: "auto",
            zIndex: "999998",
            // рамка по периметру, чтобы границы были видны чётко
            boxShadow: "inset 0 0 0 1px rgba(0,120,255,.55)"
        });

        // --- Hover-подсветка ячейки под курсором ---
        const hover = document.createElement("div");
        hover.className = "grid-hover";
        Object.assign(hover.style, {
            position: "absolute",
            pointerEvents: "none",
            background: "rgba(145,71,255,.25)",
            border: "1px solid rgba(145,71,255,.7)",
            boxSizing: "border-box",
            display: "none"
        });
        layer.appendChild(hover);

        layer.addEventListener("mousemove", (e) => {
            const rect = layer.getBoundingClientRect();
            const x = Math.floor((e.clientX - rect.left) / cellW);
            const y = Math.floor((e.clientY - rect.top) / cellH);

            if (x < 0 || y < 0 || x >= cols || y >= rows) {
                hover.style.display = "none";
                return;
            }

            hover.style.display = "block";
            hover.style.left = (x * cellW) + "px";
            hover.style.top = (y * cellH) + "px";
            hover.style.width = cellW + "px";
            hover.style.height = cellH + "px";
        });

        layer.addEventListener("mouseleave", () => {
            hover.style.display = "none";
        });

        // --- Клик → выбранная координата ---
        layer.addEventListener("click", (e) => {
            const rect = layer.getBoundingClientRect();
            const x = Math.floor((e.clientX - rect.left) / cellW);
            const y = Math.floor((e.clientY - rect.top) / cellH);

            if (x < 0 || y < 0 || x >= cols || y >= rows) return;

            this.setSelectedCoord(`${this.cyr(x + 1)}${y + 1}`);
        });

        this.overlay.appendChild(layer);
        this.layers = this.layers || {};
        this.layers.grid = layer;
    }

    buildColLabels() {
        const { p1, cellW, cols } = this.state;
        const show = cellW >= 14;  // при узких ячейках буквы сливаются

        for (let x = 0; x < cols; x++) {
            const label = document.createElement("div");
            label.className = "grid-item col-label";

            Object.assign(label.style, {
                position: "absolute",
                left: (p1.x + x * cellW + cellW / 2) + "px",
                top: (p1.y - 20) + "px",
                transform: "translateX(-50%)",
                fontWeight: "bold",
                fontSize: "12px",
                fontFamily: "monospace",
                color: "#8ec8ff",
                textShadow: "0 0 3px #000, 0 0 3px #000, 0 0 3px #000",
                pointerEvents: "none",
                userSelect: "none",
                display: show ? "block" : "none"
            });

            label.textContent = this.cyr(x + 1);
            this.overlay.appendChild(label);
        }
    }

    buildRowLabels() {
        const { p1, cellH, rows } = this.state;
        const show = cellH >= 14;

        for (let y = 0; y < rows; y++) {
            const label = document.createElement("div");
            label.className = "grid-item row-label";

            Object.assign(label.style, {
                position: "absolute",
                left: (p1.x - 8) + "px",
                top: (p1.y + y * cellH + cellH / 2) + "px",
                transform: "translate(-100%, -50%)",
                fontWeight: "bold",
                fontSize: "12px",
                fontFamily: "monospace",
                color: "#8effa1",
                textShadow: "0 0 3px #000, 0 0 3px #000, 0 0 3px #000",
                pointerEvents: "none",
                userSelect: "none",
                textAlign: "right",
                whiteSpace: "nowrap",
                display: show ? "block" : "none"
            });

            label.textContent = y + 1;
            this.overlay.appendChild(label);
        }
    }

    layoutGrid() {
        const { p1, cellW, cellH, cols, rows } = this.state;
        const layer = this.layers && this.layers.grid;
        if (!layer) return;

        // Слой сетки.
        layer.style.left = p1.x + "px";
        layer.style.top = p1.y + "px";
        layer.style.width = (cols * cellW) + "px";
        layer.style.height = (rows * cellH) + "px";
        layer.style.backgroundSize = `${cellW}px ${cellH}px`;

        // Буквы сверху.
        this.overlay.querySelectorAll(".col-label").forEach((el, x) => {
            el.style.left = (p1.x + x * cellW + cellW / 2) + "px";
            el.style.top = (p1.y - 20) + "px";
            el.style.display = cellW >= 14 ? "block" : "none";
        });

        // Цифры слева.
        this.overlay.querySelectorAll(".row-label").forEach((el, y) => {
            el.style.left = (p1.x - 8) + "px";
            el.style.top = (p1.y + y * cellH + cellH / 2) + "px";
            el.style.display = cellH >= 14 ? "block" : "none";
        });

        // Маркеры точек.
        [1, 2, 3].forEach(n => {
            if (this.state["p" + n]) {
                this.addPoint(this.state["p" + n], n);
            }
        });
    }


    // тест
    //twitchSend("!профиль");
    // прозрачность 
    twitchSend(text) {

        const box = document.querySelector(
            '[data-a-target="chat-input"][contenteditable="true"]'
        );

        if (!box) {
            console.log("Поле не найдено");
            return;
        }


        // фокус
        box.focus();


        // курсор в конец
        const range = document.createRange();
        range.selectNodeContents(box);
        range.collapse(false);

        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);



        // очистка старого
        document.execCommand("selectAll", false, null);


        // вставка как пользователь
        document.execCommand(
            "insertText",
            false,
            text
        );


        // события для React/Slate
        box.dispatchEvent(
            new InputEvent("beforeinput", {
                bubbles: true,
                cancelable: true,
                inputType: "insertText",
                data: text
            })
        );


        box.dispatchEvent(
            new InputEvent("input", {
                bubbles: true,
                inputType: "insertText",
                data: text
            })
        );


        // небольшая задержка перед отправкой
        setTimeout(() => {

            const button = document.querySelector(
                'button[data-a-target="chat-send-button"]'
            );

            if (!button) {
                console.log("Кнопка не найдена");
                return;
            }


            // настоящий клик мыши
            button.dispatchEvent(
                new MouseEvent("mousedown", {
                    bubbles: true,
                    cancelable: true,
                    view: window
                })
            );

            button.dispatchEvent(
                new MouseEvent("mouseup", {
                    bubbles: true,
                    cancelable: true,
                    view: window
                })
            );

            button.click();


        }, 1000 + Math.random() * 1000);

    }

    setGridInvisible(value) {
        clearTimeout(this.gridFadeTimer);
        this.gridFadeTimer = null;
        if (this.gridFadeFrame) {
            cancelAnimationFrame(this.gridFadeFrame);
            this.gridFadeFrame = null;
        }
        this.state.gridInvisible = value;

        const elements = this.overlay.querySelectorAll(
            ".grid-item, .point-marker, #grid-resize-menu"
        );

        elements.forEach(el => {
            el.style.transition = "none";
            el.style.opacity = value ? "0" : "1";
        });
    }

    // Создание слоя
    createOverlay() {
        this.overlay = document.createElement("div");
        this.overlay.id = "grid-builder-overlay";

        Object.assign(this.overlay.style, {
            position: "fixed",
            left: "0",
            top: "0",
            width: "100vw",
            height: "100vh",

            display: "grid",
            gridTemplateColumns: "5fr 40fr 8fr 2fr",

            zIndex: "999999",
            pointerEvents: "none"
        });

        this.zone1 = document.createElement("div");
        this.zone2 = document.createElement("div");
        this.zone3 = document.createElement("div"); // Панель управления 
        this.zone4 = document.createElement("div"); // Сохранённые сетки

        [
            this.zone1,
            this.zone2,
            this.zone3,
            this.zone4
        ].forEach((zone, index) => {
            Object.assign(zone.style, {
                position: "relative",
                width: "100%",
                height: "100%",
                minWidth: "0",
                pointerEvents: "none"
            });

            zone.dataset.zone = index + 1;
            this.overlay.appendChild(zone);
        });

        document.body.appendChild(this.overlay);
    }
    // Информационная панель
    createInfo() {
        this.info = document.createElement("div");

        Object.assign(this.info.style, {
            position: "fixed",
            left: "10px",
            top: "10px",
            background: "rgba(0,0,0,.8)",
            color: "white",
            padding: "8px",
            fontFamily: "monospace",
            fontSize: "14px",
            borderRadius: "5px",
            pointerEvents: "none"
        });

        this.info.textContent = "Наведите курсор в угол А1 и нажмите цифру 1";
        this.zone1.appendChild(this.info);
    }

    createCommandsPanel() {
        this.commandsPanel = document.createElement("div");

        //Object.assign(this.commandsPanel.style, {
        //    position: "absolute",
        //    left: "0",
        //    top: "95px",
        //    width: "100%",
        //    padding: "10px",
        //    background: "rgba(0,0,0,.85)",
        //    color: "white",
        //    fontFamily: "monospace",
        //    fontSize: "13px",
        //    borderRadius: "5px",
        //    pointerEvents: "auto",
        //    boxSizing: "border-box"
        //});
        Object.assign(this.commandsPanel.style, {
            position: "absolute",

            left: "0",
            top: "95px",
            bottom: "0",

            width: "100%",
            height: "calc(100vh - 95px)",

            padding: "0px",

            background: "rgba(0,0,0,.15)",
            color: "white",

            fontFamily: "monospace",
            fontSize: "13px",

            borderRadius: "5px",

            pointerEvents: "auto",
            boxSizing: "border-box",

            overflowY: "auto",

            scrollbarWidth: "none",
            msOverflowStyle: "none"
        });

        this.zone1.appendChild(this.commandsPanel);
        this.showCommandsEditor();
    }

    showCommandsEditor() {
        this.state.commandsSaved = false;
        this.commandsPanel.innerHTML = "";


        const saveButton = document.createElement("button");

        saveButton.textContent = "💾 Сохранить";

        saveButton.type = "button";


        Object.assign(saveButton.style, {
            display: "block",
            width: "100%",

            boxSizing: "border-box",

            padding: "10px",
            marginBottom: "10px",

            cursor: "pointer",

            background: "linear-gradient(135deg, #9147ff, #5c2d99)",

            color: "white",

            border: "none",
            borderRadius: "8px",

            fontFamily: "monospace",
            fontSize: "14px",
            fontWeight: "bold"
        });



        const textarea = document.createElement("textarea");

        textarea.placeholder =
            " - заменяется на координату;\n!башня -;\n!холод -;\n!улучшить;";


        textarea.value = this.state.commands.join("\n");



        Object.assign(textarea.style, {

            display: "block",

            width: "100%",
            height: "calc(100vh - 180px)",

            boxSizing: "border-box",

            resize: "none",

            padding: "3px",

            background: "rgba(0, 0, 0, 0.3)",

            color: "#efeff1",

            border: "1px solid #3a3a3d",

            borderRadius: "8px",

            outline: "none",

            fontFamily: "monospace",

            fontSize: "14px",

            lineHeight: "1.5"
        });



        saveButton.addEventListener("click", () => {

            this.state.commands = textarea.value
                .split("\n")
                .map(line => line.trim())
                .filter(Boolean);


            this.state.commandsSaved = true;

            this.showCommandsButtons();

        });



        this.commandsPanel.append(
            saveButton,
            textarea
        );
    }

    showCommandsButtons() {
        this.commandsPanel.innerHTML = "";


        // Кнопка редактирования сверху
        const editButton = document.createElement("button");

        editButton.type = "button";
        editButton.textContent = "⚙ Изменить команды";


        Object.assign(editButton.style, {
            display: "block",
            width: "100%",

            boxSizing: "border-box",

            padding: "10px",
            marginBottom: "10px",

            cursor: "pointer",

            background: "linear-gradient(135deg, #9147ff, #5c2d99)",
            color: "#fff",

            border: "1px solid rgba(255,255,255,.25)",
            borderRadius: "10px",

            fontFamily: "monospace",
            fontSize: "14px",
            fontWeight: "bold",

            boxShadow: "0 4px 10px rgba(0,0,0,.3)"
        });


        editButton.addEventListener("click", () => {
            this.showCommandsEditor();
        });


        this.commandsPanel.appendChild(editButton);



        // Контейнер списка команд
        const list = document.createElement("div");

        Object.assign(list.style, {
            overflowY: "auto",

            height: "calc(100vh - 170px)",

            paddingRight: "4px",

            scrollbarWidth: "none",
            msOverflowStyle: "none"
        });


        this.state.commands.forEach(command => {

            const button = document.createElement("button");

            button.type = "button";


            button.textContent = (
                this.state.selectedCoord
                    ? command.replace(/\{coord\}/g, this.state.selectedCoord)
                    : command
            ).replace(/;\s*$/, "");



            Object.assign(button.style, {
                display: "block",
                width: "100%",
                boxSizing: "border-box",
                padding: "5px 8px",
                marginBottom: "8px",
                textAlign: "left",
                cursor: "pointer",
                whiteSpace: "normal",
                overflowWrap: "anywhere",
                background: "linear-gradient(135deg, #333, #222)",
                color: "#fff",
                border: "1px solid rgba(255,255,255,.15)",
                borderRadius: "10px",
                fontFamily: "monospace",
                fontSize: "14px",
                fontWeight: "600",
                boxShadow: "0 4px 10px rgba(0,0,0,.25)",
                transition: "all .15s ease",
                userSelect: "none",
                opacity: "0.7"
            });



            button.addEventListener("mouseenter", () => {

                button.style.background =
                    "linear-gradient(135deg, #4a4a4a, #2d2d2d)";

                button.style.transform =
                    "translateY(-2px)";

                button.style.boxShadow =
                    "0 6px 14px rgba(0,0,0,.35)";
            });



            button.addEventListener("mouseleave", () => {

                button.style.background =
                    "linear-gradient(135deg, #333, #222)";

                button.style.transform =
                    "translateY(0)";

                button.style.boxShadow =
                    "0 4px 10px rgba(0,0,0,.25)";
            });



            button.addEventListener("mousedown", () => {
                button.style.transform = "scale(.97)";
            });



            button.addEventListener("mouseup", () => {
                button.style.transform = "translateY(-2px)";
            });



            button.addEventListener("click", () => {

                const finalCommand = (
                    this.state.selectedCoord
                        ? command.replace(/\{coord\}/g, this.state.selectedCoord)
                        : command
                ).replace(/;\s*$/, "");

                this.twitchSend(finalCommand);

            });



            list.appendChild(button);

        });


        this.commandsPanel.appendChild(list);
    }

    setSelectedCoord(coord) {
        this.state.selectedCoord = coord;

        if (this.state.commandsSaved) {
            this.showCommandsButtons();
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
        // Сохраняем исходный display перед скрытием
        this.state.overlayDisplay = this.overlay.style.display;

        this.overlay.style.display = "none";
        this.state.visible = false;


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
    }
    // Установка точки
    setPoint(number) {
        this.hidePlayer();

        this.state["p" + number] = {
            x: this.mouse.x,
            y: this.mouse.y
        };

        this.addPoint(this.state["p" + number], number);

        if (number === 1) {
            this.info.textContent = "Точка 1 выбрана. Переместите курсор по диагонали вниз в угол А1 нажми цифру 2";
        }

        if (number === 2) {
            this.info.textContent = "Точка 2 выбрана. Переместите курсор в правый нижний край таблицы нажми цифру 3";
        }

        if (number === 3) {
            this.createGrid();

            // Автоматически сохраняем готовую сетку
            this.saveCurrentGrid();

            this.info.innerHTML = `
        Сетка готова. Shift + s сохранить сетку. Shift + 3 прозрачная сетка

        <hr>

        Нажми F2 для справки
    `;
        }
    }

    // Создание или обновление маркера
    addPoint(p, number) {
        let el = this.overlay.querySelector(
            ".point-marker-" + number
        );

        if (!el) {
            el = document.createElement("div");
            el.className = `point-marker point-marker-${number}`;

            //Object.assign(el.style, {
            //    position: "absolute",
            //    width: "12px",
            //    height: "12px",
            //    background: "red",
            //    borderRadius: "50%",
            //    transform: "translate(-50%,-50%)",
            //    pointerEvents: "none"
            //});

            Object.assign(el.style, {
                position: "fixed",
                width: "12px",
                height: "12px",
                background: "red",
                borderRadius: "50%",
                transform: "translate(-50%, -50%)",
                pointerEvents: "none",
                zIndex: "1000001",
                display: "block"
            });

            el.innerHTML = `
                <span style="
                    position:absolute;
                    left:15px;
                    top:-10px;
                    color:red;
                    font-weight:bold;
                ">${number}</span>
            `;

            this.overlay.appendChild(el);
        }

        el.style.left = p.x + "px";
        el.style.top = p.y + "px";
    }

    // Очистка элементов сетки


    clearGrid() {
        this.overlay.querySelectorAll(".grid-item").forEach(el => el.remove());

        const menu = this.overlay.querySelector("#grid-resize-menu");
        if (menu) menu.remove();

        if (this.layers) this.layers.grid = null;
    }


    // Русские обозначения колонок: А, Б, ... Ё, Ж ...
    cyr(num) {
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
        const { p1, p2, p3 } = this.state;
        if (!p1 || !p2 || !p3) return;

        let menu = this.overlay.querySelector("#grid-resize-menu");

        if (!menu) {
            menu = document.createElement("div");
            menu.id = "grid-resize-menu";

            Object.assign(menu.style, {
                position: "absolute",
                left: "0",
                top: "10px",
                width: "100%",
                maxHeight: "90vh",
                overflowY: "auto",
                padding: "8px",
                background: "rgba(0,0,0,.9)",
                color: "white",
                fontFamily: "monospace",
                fontSize: "12px",
                borderRadius: "8px",
                pointerEvents: "auto",
                boxSizing: "border-box"
            });

            menu.innerHTML = `
            <div style="font-weight:bold;font-size:15px;margin-bottom:12px">
                Управление точками
            </div>

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

            this.zone3.appendChild(menu);

            menu.querySelectorAll(".move-controls").forEach(controls => {
                this.createMoveControls(controls, menu);
            });
        }

        this.updateResizeMenuValues(menu);
    }


    createMoveControls(controls, menu) {
        Object.assign(controls.style, {
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "5px"
        });

        const pointNumber = Number(controls.dataset.point);

        const buttons = [
            ["", 0, 0],
            ["▲", 0, -1],
            ["", 0, 0],
            ["◀", -1, 0],
            ["•", 0, 0],
            ["▶", 1, 0],
            ["", 0, 0],
            ["▼", 0, 1],
            ["", 0, 0]
        ];

        buttons.forEach(([label, dx, dy]) => {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = label || " ";
            button.disabled = !label;
            button.title = label ? `Переместить точку ${pointNumber}` : "";

            Object.assign(button.style, {
                minHeight: "30px",
                cursor: label ? "pointer" : "default",
                border: "1px solid #666",
                borderRadius: "4px",
                background: label ? "#333" : "transparent",
                color: "white",
                fontSize: "16px"
            });

            if (label) {
                button.addEventListener("click", () => {
                    const point = this.state["p" + pointNumber];
                    if (!point) return;

                    const step = Number(menu.querySelector("#grid-move-step").value);
                    const oldX = point.x, oldY = point.y;

                    point.x += dx * step;
                    point.y += dy * step;

                    const res = this.recalcGeometry();
                    if (!res) {
                        // Откат.
                        point.x = oldX;
                        point.y = oldY;
                        this.recalcGeometry();
                        this.createGrid();      // вернуть валидное состояние
                        this.addPoint(point, pointNumber);
                        return;
                    }

                    if (res.changed) {
                        this.createGrid();      // структура поменялась — пересобрать
                    } else {
                        this.layoutGrid();      // только сдвиг — быстро
                    }

                    [1, 2, 3].forEach(n => {
                        if (this.state["p" + n]) this.addPoint(this.state["p" + n], n);
                    });

                    if (this.state.activeGridId !== null) this.updateActiveGrid();
                    this.startGridFadeTimer();
                });
            }

            controls.appendChild(button);
        });
    }


    recalcGeometry() {
        const { p1, p2, p3 } = this.state;
        if (!p1 || !p2 || !p3) return false;

        const cellW = p2.x - p1.x;
        const cellH = p2.y - p1.y;
        if (cellW < 1 || cellH < 1) return false;
        if (p2.x <= p1.x || p2.y <= p1.y) return false;
        if (p3.x <= p1.x || p3.y <= p1.y) return false;

        const cols = Math.floor((p3.x - p1.x) / cellW);
        const rows = Math.floor((p3.y - p1.y) / cellH);
        if (cols < 1 || rows < 1) return false;
        if (cols > 200 || rows > 200) return false;

        const changed =
            cols !== this.state.cols ||
            rows !== this.state.rows ||
            cellW !== this.state.cellW ||
            cellH !== this.state.cellH;

        this.state.cellW = cellW;
        this.state.cellH = cellH;
        this.state.cols = cols;
        this.state.rows = rows;

        return { changed };
    }

    updateResizeMenuValues(menu) {
        [1, 2, 3].forEach(n => {
            const point = this.state["p" + n];
            const coords = menu.querySelector(`#grid-p${n}-coords`);

            if (!point || !coords) return;

            coords.innerHTML =
                `X: ${point.x.toFixed(2)}<br>` +
                `Y: ${point.y.toFixed(2)}`;
        });

        menu.querySelector("#grid-cols-value").textContent = this.state.cols;
        menu.querySelector("#grid-rows-value").textContent = this.state.rows;
    }

    // Полный сброс сетки с сохранением скрипта


    clearAll() {
        // Останавливаем таймеры прозрачности.
        clearTimeout(this.gridFadeTimer);
        this.gridFadeTimer = null;

        if (this.gridFadeFrame) {
            cancelAnimationFrame(this.gridFadeFrame);
            this.gridFadeFrame = null;
        }

        // Запоминаем ID активного слота.
        const activeId = this.state.activeGridId;

        // Удаляем сетку, точки и меню управления.
        this.overlay.querySelectorAll(
            ".grid-item, .point-marker, #grid-resize-menu"
        ).forEach(el => el.remove());

        // Удаляем активный слот сохранения.
        if (activeId !== null) {
            this.state.savedGrids = this.state.savedGrids.filter(
                grid => grid.id !== activeId
            );
        }

        // Сбрасываем координаты и размеры.
        this.state.p1 = null;
        this.state.p2 = null;
        this.state.p3 = null;

        this.state.cellW = 0;
        this.state.cellH = 0;
        this.state.rows = 0;
        this.state.cols = 0;

        // Сбрасываем активный слот и прозрачность.
        this.state.activeGridId = null;
        this.state.gridInvisible = false;

        this.state.selectedCoord = null;
        this.state.commandsSaved = false;
        // Обновляем список сохранённых сеток.
        this.updateSavedGridsPanel();

        this.info.textContent =
            "Ожидание точки 1. Наведите курсор на левый верхний угол и нажмите 1";

        this.restorePlayer();
    }

    // Справка
    showHelp() {
        alert(`
Readme
Точками 1 и 2 построить диагональ для А1
Точку 3 поставить в крайний правый низ сетки

Построение сетки
Навести курсор нажать
цифрой 1 - поставить точку 1
цифрой 2 - поставить точку 2
цифрой 3 - поставить точку 3

SHIFT + 1 - скрыть/показать сетку
SHIFT + 3 - сделать невидимой

DELETE - сбросить сетку
SHIFT + DELETE - удалить скрипт

Клик по ячейке подставит в блоке команд за место "-" координату

F2 - справка
`);
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
            id: this.state.activeGridId ?? Date.now(),

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

        this.updateSavedGridsPanel();

        console.log("Автоматически сохранена готовая сетка:", grid);
    }

    saveNewGridSlot() {
        const { p1, p2, p3, cols, rows } = this.state;

        if (!p1 || !p2 || !p3 || cols <= 0 || rows <= 0) {
            alert("Сначала полностью постройте сетку");
            return;
        }

        const grid = {
            id: Date.now(),

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

        this.updateSavedGridsPanel();

        console.log("Создан новый слот:", grid);
    }

    // Название сетки.
    // Например: Ж20
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

        return `${this.cyr(cols)}${rows}`;
    }

    // Автоматическое обновление активной сетки
    updateActiveGrid() {

        if (this.state.activeGridId === null) {
            return;
        }

        const grid = this.state.savedGrids.find(
            g => g.id === this.state.activeGridId
        );

        if (!grid) {
            return;
        }

        grid.p1 = {
            x: this.state.p1.x,
            y: this.state.p1.y
        };

        grid.p2 = {
            x: this.state.p2.x,
            y: this.state.p2.y
        };

        grid.p3 = {
            x: this.state.p3.x,
            y: this.state.p3.y
        };

        this.updateSavedGridsPanel();
    }

    // Загрузить сохранённую сетку

    loadGrid(grid) {
        // Если передан ID, находим соответствующую сохранённую сетку.
        if (typeof grid === "number") {
            grid = this.state.savedGrids.find(g => g.id === grid);
        }

        if (!grid || !grid.p1 || !grid.p2 || !grid.p3) {
            console.error("Не удалось загрузить сетку:", grid);
            return;
        }

        // Останавливаем предыдущий таймер исчезновения.
        clearTimeout(this.gridFadeTimer);

        if (this.gridFadeFrame) {
            cancelAnimationFrame(this.gridFadeFrame);
            this.gridFadeFrame = null;
        }

        // Загружаем координаты.
        this.state.p1 = { ...grid.p1 };
        this.state.p2 = { ...grid.p2 };
        this.state.p3 = { ...grid.p3 };
        this.state.activeGridId = grid.id;

        // Снимаем прозрачность.
        this.state.gridInvisible = false;

        // Если оверлей был скрыт через Shift + 1, показываем его.
        this.restorePanel();

        // Перестраиваем сетку и маркеры.
        this.createGrid();

        this.addPoint(this.state.p1, 1);
        this.addPoint(this.state.p2, 2);
        this.addPoint(this.state.p3, 3);

        // Показываем сетку и запускаем новый таймер.
        this.setGridInvisible(false);
        this.startGridFadeTimer();

        this.updateSavedGridsPanel();
    }

    // HTML-панель сохранённых сеток
    createSavedGridsPanel() {

        let panel = document.querySelector(
            "#saved-grids-panel"
        );

        if (panel) {
            return;
        }

        panel = document.createElement("div");

        panel.id = "saved-grids-panel";

        Object.assign(panel.style, {
            position: "absolute",
            left: "0",
            top: "10px",
            width: "100%",
            maxHeight: "70vh",
            overflowY: "auto",
            padding: "6px",
            background: "rgba(0,0,0,.9)",
            color: "white",
            borderRadius: "8px",
            zIndex: "1000000",
            fontFamily: "monospace",
            fontSize: "12px",
            boxSizing: "border-box",
            pointerEvents: "auto"
        });

        //document.body.appendChild(panel);
        this.zone4.appendChild(panel);
        this.updateSavedGridsPanel();
    }

    // Обновить HTML кнопок
    updateSavedGridsPanel() {

        const panel = document.querySelector(
            "#saved-grids-panel"
        );

        if (!panel) {
            return;
        }

        panel.innerHTML = "";

        const title = document.createElement("div");

        title.textContent = "Сохран сетки";

        Object.assign(title.style, {
            fontWeight: "bold",
            marginBottom: "8px",
            fontSize: "14px"
        });

        panel.appendChild(title);


        if (this.state.savedGrids.length === 0) {

            const empty = document.createElement("div");

            empty.textContent = "Нет сохранённых сеток";

            empty.style.opacity = "0.6";

            panel.appendChild(empty);

            return;
        }


        this.state.savedGrids.forEach(grid => {

            const button = document.createElement("button");

            button.type = "button";

            button.textContent =
                this.getGridName(grid);


            Object.assign(button.style, {
                display: "block",
                width: "100%",
                padding: "8px",
                marginBottom: "5px",
                cursor: "pointer",
                background:
                    grid.id === this.state.activeGridId
                        ? "#9147ff"
                        : "#333",
                color: "white",
                border: "1px solid #666",
                borderRadius: "6px",
                fontFamily: "monospace",
                fontWeight: "bold"
            });


            button.title =
                "Выбрать сетку " +
                this.getGridName(grid);



            button.addEventListener("click", () => {
                this.loadGrid(grid);
            });



            panel.appendChild(button);

        });
    }

    onKeyDown(e) {
        // Не перехватываем клавиши, когда пользователь печатает в поле
        const tag = e.target?.tagName;
        const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(tag) ||
            e.target?.isContentEditable;

        if (typing) return;

        if (e.ctrlKey || e.altKey || e.metaKey) return;
        if (e.repeat) return;

        if (e.key === "F2") {
            e.preventDefault();
            this.showHelp();
            return;
        }

        if (e.shiftKey && e.code === "Digit1") {

            e.preventDefault();

            if (this.state.visible) {
                this.hidePanel();
                this.restorePlayer();
            } else {
                // Восстанавливаем сохранённый display
                this.restorePanel();
                this.hidePlayer();
            }


            return;
        }
        if (e.shiftKey && e.code === "Digit3") {

            e.preventDefault();

            this.setGridInvisible(
                !this.state.gridInvisible
            );

            return;
        }


        if (e.key === "Delete" && e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();

            clearTimeout(this.gridFadeTimer);

            if (this.gridFadeFrame) {
                cancelAnimationFrame(this.gridFadeFrame);
                this.gridFadeFrame = null;
            }

            this.destroy();
            alert("Скрипт удалён");
            return;
        }

        if (e.key === "Delete" && !e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();

            this.clearAll();
            return;
        }



        // Shift + S — сохранить текущую сетку
        if (
            e.shiftKey &&
            e.code === "KeyS"
        ) {
            e.preventDefault();
            e.stopPropagation();

            this.saveNewGridSlot();

            return;
        }

        if (["1", "2", "3"].includes(e.key)) {
            e.preventDefault();
            this.setPoint(Number(e.key));
        }
    }

    startGridFadeTimer() {
        clearTimeout(this.gridFadeTimer);

        if (this.gridFadeFrame) {
            cancelAnimationFrame(this.gridFadeFrame);
            this.gridFadeFrame = null;
        }

        const getElements = () =>
            this.overlay.querySelectorAll(
                ".grid-item, .point-marker, #grid-resize-menu"
            );

        // Если прозрачность включена, сначала снимаем её.
        this.state.gridInvisible = false;

        const elements = getElements();

        elements.forEach(el => {
            el.style.transition = "none";
            el.style.opacity = "1";
        });

        // Даём браузеру применить полную видимость.
        this.gridFadeFrame = requestAnimationFrame(() => {
            this.gridFadeFrame = null;

            this.gridFadeTimer = setTimeout(() => {
                getElements().forEach(el => {
                    el.style.transition = "opacity 5s ease";
                    el.style.opacity = "0";
                });
            }, 10000);
        });
    }

    // Полное удаление класса и его обработчиков
    destroy() {
        clearTimeout(this.gridFadeTimer);
        if (this.gridFadeFrame) cancelAnimationFrame(this.gridFadeFrame);

        document.removeEventListener("mousemove", this.onMouseMove);
        document.removeEventListener("keydown", this.onKeyDown);

        this.restorePlayer();
        this.overlay.remove();

        if (window.gridBuilder === this) {
            delete window.gridBuilder;
        }
    }
}

// Запуск
new GridBuilder();