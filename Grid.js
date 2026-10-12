class GridBuilder {
    constructor() {
        if (window.gridBuilder) {
            alert("Скрипт уже запущен");
            return;
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
            recording: false,
            gifFrames: []
        };

        this.mouse = { x: 0, y: 0 };
        this.player = null;
        this.previousDisplay = "";
        this.playerWasHidden = false;

        this.createOverlay();
        this.createInfo();
        this.createCommandsPanel();
        this.hidePlayer();

        this.onMouseMove = this.onMouseMove.bind(this);
        this.onKeyDown = this.onKeyDown.bind(this);

        document.addEventListener("mousemove", this.onMouseMove);
        document.addEventListener("keydown", this.onKeyDown);

        window.gridBuilder = this;

        alert(`
Readme
Делал в режиме Theatre mode
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

        this.state.gridInvisible = value;


        const cells = this.overlay.querySelectorAll(
            ".grid-item"
        );

        const points = this.overlay.querySelectorAll(
            ".point-marker"
        );


        cells.forEach(el => {

            if (value) {

                // полностью прозрачный, но клики работают
                el.style.opacity = "0";

            } else {

                el.style.opacity = "1";

            }

        });


        points.forEach(el => {

            el.style.opacity = value ? "0" : "1";

        });


        const menu = this.overlay.querySelector(
            "#grid-resize-menu"
        );


        if (menu) {

            menu.style.opacity = value ? "0" : "1";

            // важно: панель не должна блокировать страницу
            menu.style.pointerEvents =
                value ? "none" : "auto";

        }

    }

    // Создание слоя
    createOverlay2() {
        this.overlay = document.createElement("div");
        this.overlay.id = "grid-builder-overlay";

        Object.assign(this.overlay.style, {
            position: "fixed",
            left: "0",
            top: "0",
            width: "100vw",
            height: "100vh",
            zIndex: "999999",
            pointerEvents: "none"
        });

        document.body.appendChild(this.overlay);
    }
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
            gridTemplateColumns: "1fr 8fr 2fr",

            zIndex: "999999",
            pointerEvents: "none"
        });


        this.zone1 = document.createElement("div");
        this.zone2 = document.createElement("div");
        this.zone3 = document.createElement("div");


        [
            this.zone1,
            this.zone2,
            this.zone3
        ].forEach(zone => {

            Object.assign(zone.style, {
                position: "relative",
                width: "100%",
                height: "100%",
                pointerEvents: "none"
            });

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
            padding: "10px",
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

        Object.assign(this.commandsPanel.style, {
            position: "absolute",
            left: "0",
            top: "95px",
            width: "100%",
            padding: "10px",
            background: "rgba(0,0,0,.85)",
            color: "white",
            fontFamily: "monospace",
            fontSize: "13px",
            borderRadius: "5px",
            pointerEvents: "auto",
            boxSizing: "border-box"
        });

        this.zone1.appendChild(this.commandsPanel);
        this.showCommandsEditor();
    }


    showCommandsEditor() {
        this.commandsPanel.innerHTML = "";

        const textarea = document.createElement("textarea");
        textarea.placeholder =
            " - заменяется на координату;\n!башня -;\n!холод -;\n!улучшить;";
        textarea.value = this.state.commands.join("\n");

        Object.assign(textarea.style, {
            display: "block",
            width: "100%",
            height: "130px",
            boxSizing: "border-box",
            resize: "vertical",
            fontFamily: "monospace",
            fontSize: "13px",
            marginBottom: "8px"
        });

        const saveButton = document.createElement("button");
        saveButton.textContent = "Сохранить";
        saveButton.type = "button";

        Object.assign(saveButton.style, {
            display: "block",
            width: "100%",
            boxSizing: "border-box",
            padding: "7px",
            cursor: "pointer"
        });

        saveButton.addEventListener("click", () => {
            this.state.commands = textarea.value
                .split("\n")
                .map(line => line.trim())
                .filter(Boolean);

            this.state.commandsSaved = true;
            this.showCommandsButtons();
        });

        this.commandsPanel.append(textarea, saveButton);
    }

    showCommandsButtons() {
        this.commandsPanel.innerHTML = "";

        this.state.commands.forEach(command => {

            const button = document.createElement("button");
            button.type = "button";

            button.textContent = (
                this.state.selectedCoord
                    ? command.replace(/-/g, this.state.selectedCoord)
                    : command
            ).replace(/;\s*$/, "");


            Object.assign(button.style, {
                display: "block",
                width: "100%",
                boxSizing: "border-box",
                padding: "7px",
                marginBottom: "5px",
                textAlign: "left",
                cursor: "pointer",
                whiteSpace: "normal",
                overflowWrap: "anywhere"
            });


            button.addEventListener("click", () => {

                const finalCommand = (
                    this.state.selectedCoord
                        ? command.replace(/-/g, this.state.selectedCoord)
                        : command
                ).replace(/;\s*$/, "");


                alert(finalCommand);

                this.twitchSend(finalCommand);

            });


            this.commandsPanel.appendChild(button);
        });


        const editButton = document.createElement("button");

        editButton.type = "button";
        editButton.textContent = "Изменить";


        Object.assign(editButton.style, {
            display: "block",
            width: "100%",
            boxSizing: "border-box",
            padding: "7px",
            marginTop: "5px",
            cursor: "pointer"
        });


        editButton.addEventListener("click", () => {
            this.showCommandsEditor();
        });


        this.commandsPanel.appendChild(editButton);
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
    hidePlayer2() {

        const video = document.querySelector(
            'video[aria-label="Twitch video player"]'
        );

        if (!video) return;


        const target = video.nextElementSibling;


        if (!target) return;


        this.player = target;

        this.previousDisplay = target.style.display;


        target.style.display = "none";
    }

    restorePlayer() {
        if (!this.player) return;

        // Не показываем элемент принудительно, если он был скрыт изначально
        if (!this.playerWasHidden) {
            this.player.style.display = this.previousDisplay;
        }

        this.player = null;
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
            this.info.textContent = "Точка 2 выбрана. Переместите курсор в правый нижний карй таблицы нажми цифру 3";
        }

        if (number === 3) {
            this.createGrid();

            this.info.innerHTML = `
        Сетка готова

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

            Object.assign(el.style, {
                position: "absolute",
                width: "12px",
                height: "12px",
                background: "red",
                borderRadius: "50%",
                transform: "translate(-50%,-50%)",
                pointerEvents: "none"
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
        this.overlay.querySelectorAll(".grid-item").forEach(el => {
            el.remove();
        });
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

    // Построение сетки
    createGrid() {
        const { p1, p2, p3 } = this.state;

        if (!p1 || !p2 || !p3) return;

        this.state.cellW = Math.abs(p2.x - p1.x);
        this.state.cellH = Math.abs(p2.y - p1.y);

        if (this.state.cellW <= 0 || this.state.cellH <= 0) {
            this.info.textContent =
                "Ошибка: ширина и высота ячейки должны быть больше 0";
            return;
        }

        this.state.cols = Math.floor(
            Math.abs(p3.x - p1.x) / this.state.cellW
        );

        this.state.rows = Math.floor(
            Math.abs(p3.y - p1.y) / this.state.cellH
        );

        this.clearGrid();

        // Подписи колонок
        for (let x = 0; x < this.state.cols; x++) {
            const label = document.createElement("div");
            label.className = "grid-item";

            Object.assign(label.style, {
                position: "absolute",
                left: (
                    p1.x + x * this.state.cellW +
                    this.state.cellW / 2
                ) + "px",
                top: (p1.y - 25) + "px",
                transform: "translateX(-50%)",
                fontWeight: "bold",
                color: "blue"
            });

            label.textContent = this.cyr(x + 1);
            this.overlay.appendChild(label);
        }

        // Подписи строк
        for (let y = 0; y < this.state.rows; y++) {
            const label = document.createElement("div");
            label.className = "grid-item";

            Object.assign(label.style, {
                position: "absolute",
                left: (p1.x - 25) + "px",
                top: (
                    p1.y + y * this.state.cellH +
                    this.state.cellH / 2
                ) + "px",
                transform: "translateY(-50%)",
                fontWeight: "bold",
                color: "green"
            });

            label.textContent = y + 1;
            this.overlay.appendChild(label);
        }

        // Ячейки
        for (let y = 0; y < this.state.rows; y++) {
            for (let x = 0; x < this.state.cols; x++) {
                const cell = document.createElement("div");
                cell.className = "grid-item";

                Object.assign(cell.style, {
                    position: "absolute",
                    left: (p1.x + x * this.state.cellW) + "px",
                    top: (p1.y + y * this.state.cellH) + "px",
                    width: this.state.cellW + "px",
                    height: this.state.cellH + "px",
                    boxSizing: "border-box",
                    border: "1px solid rgba(0,120,255,.5)",
                    pointerEvents: "auto"
                });


                cell.addEventListener("click", () => {
                    const coord = `${this.cyr(x + 1)}${y + 1}`;

                    this.setSelectedCoord(coord);

                });

                this.overlay.appendChild(cell);
            }
        }

        this.createResizeMenu();
    }

    // Боковая панель перемещения точек
    createResizeMenu() {
        let menu = this.overlay.querySelector("#grid-resize-menu");

        if (!menu) {
            menu = document.createElement("div");
            menu.id = "grid-resize-menu";

            Object.assign(menu.style, {
                position: "absolute",
                left: "10px",
                top: "10px",
                width: "245px",
                padding: "14px",
                background: "rgba(0,0,0,.9)",
                color: "white",
                fontFamily: "monospace",
                fontSize: "13px",
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

                <div style="border-top:1px solid #666;padding-top:10px">
                    <b>Точка 1</b>
                    <div id="grid-p1-coords" style="margin:6px 0"></div>
                    <div class="move-controls" data-point="1"></div>
                </div>

                <div style="border-top:1px solid #666;padding-top:10px;margin-top:12px">
                    <b>Точка 2</b>
                    <div id="grid-p2-coords" style="margin:6px 0"></div>
                    <div class="move-controls" data-point="2"></div>
                </div>

                <div style="border-top:1px solid #666;padding-top:10px;margin-top:12px;line-height:1.8">
                    Столбцов: <span id="grid-cols-value"></span><br>
                    Строк: <span id="grid-rows-value"></span>
                </div>
            `;

            this.zone3.appendChild(menu);
            menu.querySelectorAll(".move-controls").forEach(controls => {
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
                    button.textContent = label || " ";
                    button.disabled = !label;
                    button.type = "button";

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
                            const p = this.state["p" + pointNumber];

                            if (!p || !this.state.p1 ||
                                !this.state.p2 || !this.state.p3) {
                                return;
                            }

                            const step = Number(
                                menu.querySelector("#grid-move-step").value
                            );

                            p.x += dx * step;
                            p.y += dy * step;

                            this.addPoint(p, pointNumber);
                            this.createGrid();
                        });
                    }

                    controls.appendChild(button);
                });
            });
        }

        menu.querySelector("#grid-p1-coords").textContent =
            `X: ${this.state.p1.x.toFixed(2)} | Y: ${this.state.p1.y.toFixed(2)}`;

        menu.querySelector("#grid-p2-coords").textContent =
            `X: ${this.state.p2.x.toFixed(2)} | Y: ${this.state.p2.y.toFixed(2)}`;

        menu.querySelector("#grid-cols-value").textContent = this.state.cols;
        menu.querySelector("#grid-rows-value").textContent = this.state.rows;
    }

    // Полный сброс сетки с сохранением скрипта
    clearAll() {
        this.overlay.querySelectorAll(
            ".grid-item, .point-marker, #grid-resize-menu"
        ).forEach(el => el.remove());

        this.state.p1 = null;
        this.state.p2 = null;
        this.state.p3 = null;
        this.state.cellW = 0;
        this.state.cellH = 0;
        this.state.rows = 0;
        this.state.cols = 0;

        this.info.textContent = "Ожидание точки 1. Наведите курсор на левый верхний угор нажмите цифру 1";
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

    onKeyDown(e) {
        // Не перехватываем клавиши, когда пользователь печатает в поле
        const tag = e.target?.tagName;
        const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(tag) ||
            e.target?.isContentEditable;

        if (typing) return;

        if (e.key === "F2") {
            e.preventDefault();
            this.showHelp();
            return;
        }

        if (e.shiftKey && e.code === "Digit1") {

            e.preventDefault();

            if (this.state.visible) {
                // Сохраняем исходный display перед скрытием
                this.state.overlayDisplay = this.overlay.style.display;

                this.overlay.style.display = "none";
                this.state.visible = false;

                this.restorePlayer();
            } else {
                // Восстанавливаем сохранённый display
                this.overlay.style.display =
                    this.state.overlayDisplay || "grid";

                this.state.visible = true;
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
            this.destroy();
            alert("Скрипт удалён");
            return;
        }

        if (e.key === "Delete" && !e.shiftKey) {
            e.preventDefault();
            this.clearAll();
            return;
        }

        if (e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;

        if (["1", "2", "3"].includes(e.key)) {
            e.preventDefault();
            this.setPoint(Number(e.key));
        }

        if (e.key === "F8") {

            e.preventDefault();

            this.startRecord();

            return;
        }


        if (e.key === "F9") {

            e.preventDefault();

            this.stopRecord();

            return;
        }

    }

    startRecord() {

        if (this.state.recording) return;


        this.state.recording = true;
        this.state.gifFrames = [];


        alert("Запись GIF началась");


        this.recordTimer = setInterval(() => {

            html2canvas(this.overlay, {
                backgroundColor: null
            }).then(canvas => {

                this.state.gifFrames.push(canvas);

            });


        }, 1000);

    }



    stopRecord() {

        if (!this.state.recording) return;


        this.state.recording = false;

        clearInterval(this.recordTimer);


        alert(
            "Запись закончена. Кадров: " +
            this.state.gifFrames.length
        );


        this.makeGif();

    }



    makeGif() {


        const gif = new GIF({

            workers: 2,
            quality: 10,

            width: window.innerWidth,
            height: window.innerHeight

        });



        this.state.gifFrames.forEach(frame => {

            gif.addFrame(frame, {

                delay: 1000

            });

        });



        gif.on(
            "finished",
            blob => {

                const url =
                    URL.createObjectURL(blob);


                const a =
                    document.createElement("a");


                a.href = url;
                a.download =
                    "chatdefgrid.gif";


                a.click();

            }
        );



        gif.render();

    }

    // Полное удаление класса и его обработчиков
    destroy() {
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
//new GridBuilder();

function loadScript(src) {

    return new Promise((resolve, reject) => {

        const script = document.createElement("script");

        script.src = src;
        script.onload = resolve;
        script.onerror = reject;

        document.head.appendChild(script);

    });

}


async function loadLibraries() {

    await loadScript(
        "https://html2canvas.hertzen.com/dist/html2canvas.min.js"
    );


    await loadScript(
        "https://cdn.jsdelivr.net/npm/gif.js.optimized/dist/gif.js"
    );


    console.log("Библиотеки GIF загружены");


    new GridBuilder();

}


loadLibraries();