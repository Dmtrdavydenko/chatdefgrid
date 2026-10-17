# chatdefgrid
![grid](grid.png)
### Build a Grid Using the Browser Console (F12)

An interactive coordinate-grid builder for browser pages, designed for use over the Twitch video player. It overlays a labelled grid on top of the page so you can click any cell to select its coordinate, then send chat messages with that coordinate inserted automatically.

The script creates the grid by defining the size of the first cell using points `1` and `2`, then setting the table boundary using point `3`.

---

## Step 1 — Set the Starting Corner

Move the mouse to the **top-left** corner of the first cell and press `1`.

```text
┌──────┐
│  А1  │
└──────┘
```

Point `1` defines the top-left corner of the first cell.

---

## Step 2 — Set the Opposite Corner

Move the mouse to the **bottom-right** corner of the first cell and press `2`.

```text
1──────┐
│  А1  │
└──────2
```

The distance between points `1` and `2` determines the cell width and height.

---

## Step 3 — Define the Table Boundary

Move the mouse to the **bottom-right** corner of the table and press `3`.

Point `3` defines the outer boundary of the grid and can be adjusted later from the control panel.

The script automatically:

* Calculates the number of rows and columns.
* Creates the grid and fills the selected area with cells.
* Assigns coordinates to each cell.
* Saves the grid as an active slot in the **Saved Grids Panel**.

Example:

```text
1──────┐┌──────┐
│  А1  ││  Б1  │
└──────2└──────┘
┌──────┐┌──────┐
│  А2  ││  Б2  │
└──────┘└──────┘
                      3
```

---

## Grid Coordinates

Columns use Cyrillic letters, rows use numbers.

```text
А1  Б1  В1
А2  Б2  В2
А3  Б3  В3
```

### Hover

While the cursor is over the grid, you get immediate visual feedback:

* The cell under the cursor is highlighted.
* The **letter of the column** appears above the cell.
* The **number of the row** appears to the left of the cell.
* The matching letter and number on the rulers are highlighted too.

Hover stays active even in **Transparency Mode** — you always know which cell you are about to click.

### Selection

Click any cell to select its coordinate. The coordinate is inserted into commands wherever the `{coord}` placeholder appears.

Ruler labels are hidden automatically when the cell size drops below `14 px` so the grid does not become unreadable.

---

## Grid Point Control Panel

After creating the grid, points `1`, `2`, and `3` can be fine-tuned from the control panel.

```text
        ▲
        │
◀────── ● ──────▶
        │
        ▼
```

Available movement steps:

* `1 px`
* `0.5 px`
* `0.1 px`
* `0.01 px`

Point `1` and point `2` define the cell size (width and height).  
Point `3` controls the bottom-right boundary of the table.

Moving point `3` changes:

* number of columns;
* number of rows;
* total grid area.

Point `3` does **not** change the cell size — it only changes the table boundary.

If a move makes the grid invalid (points reversed, cell too small, or grid larger than `200 × 200`), the move is rolled back and an error message is shown in the info panel.

---

## Commands Panel

Commands are defined as pairs of **label** and **command**, wrapped in double parentheses:

```text
((label)(command))
```

Multiple pairs can be written on the same line or on separate lines.

Example:

```text
((Башня)(!б {coord})) ((Холод)(!х {coord})) ((Улучшить)(!у))
```

After clicking **Save**, three buttons appear:

* **Башня** — sends `!б <coord>`
* **Холод** — sends `!х <coord>`
* **Улучшить** — sends `!у`

### Special Characters

* `{coord}` — replaced with the currently selected cell coordinate.

Example — with cell `А1` selected:

```text
((Башня)(!б {coord}))
```

sends:

```text
!б А1
```

The button's `title` attribute shows the resolved command (with coordinate substituted) — hover to preview before sending.

Click **⚙ Изменить команды** to return to the editor.

---

## Saved Grids Panel

The right panel lists every grid that has been created during the session.

* Each saved grid appears as a button labelled with its size, e.g. `Ж20`.
* The currently active grid is highlighted with a purple outline on a white background.
* The label updates automatically when point `3` is moved (grid size changes).
* Click a saved grid to load it — grid, points, control panel and coordinate are restored.
* Press `Shift + S` to save the current grid as a new slot.
* Press `Delete` to remove the active slot from the list.

Saved grids live in memory only and are cleared when the page is reloaded.

---

## Video Player

The script hides the Twitch video player automatically when it starts. The grid overlay is shown immediately.

* Press `Shift + 1` to hide the overlay and restore the player.
* Press `Shift + 1` again to show the overlay and hide the player.

The help panel also contains a **▶ Перейти в Theatre Mode · alt + t** button that clicks Twitch's own theatre-mode toggle for you.

---

## Panel Size Controls

At the top of the help panel (`F2`) you can adjust the width of the three side panels in pixels:

| Field                | Default | Range      | Controls             |
| -------------------- | ------- | ---------- | -------------------- |
| Команды              | 165 px  | 40 – 400   | commands panel       |
| Управление точками   | 180 px  | 60 – 400   | point control panel  |
| Сетки                | 80 px   | 40 – 400   | saved grids panel    |

* Values apply **immediately** as you type (CSS variables `--gb-col1`, `--gb-col3`, `--gb-col4` on the overlay).
* The centre column (`1fr`) takes whatever space is left.
* Values are stored in `localStorage` under the key `gb-layout` and restored on the next run.
* Press **Сброс** to return to the defaults (`165 / 180 / 80`).

---

## Keyboard Shortcuts

| Key              | Action                                                    |
| ---------------- | --------------------------------------------------------- |
| `1`              | Set point 1 — top-left corner of the first cell           |
| `2`              | Set point 2 — bottom-right corner of the first cell       |
| `3`              | Set point 3 — bottom-right table boundary and build grid  |
| `Shift + 1`      | Hide/show the overlay and toggle the video player         |
| `Shift + 3`      | Toggle grid transparency while keeping cell clicks active |
| `Shift + S`      | Save the current grid as a new slot                       |
| `F2`             | Toggle the help panel                                     |
| `Delete`         | Clear the current grid and start setup again              |
| `Shift + Delete` | Remove the script completely (also clears `gb-*` keys)    |

Shortcuts are ignored while typing in text fields, text areas and select menus.

---

## Transparency Mode

Press `Shift + 3` to toggle the opacity of the grid, point markers and the point control panel.

When transparency mode is enabled:

* Grid lines, column and row labels, and point markers become invisible.
* The point control panel becomes visually invisible and stops accepting input.
* Cell click targets remain active — you can still select coordinates.
* **Hover works normally** — the cell under the cursor is highlighted, and the active ruler labels light up.
* The commands panel and saved grids panel are unaffected.

Manual transparency toggle cancels any pending auto-fade timer.

---

## Auto-Fade

After a grid is built or a point is moved, the overlay automatically fades out after a period of inactivity:

* `10 s` — full visibility.
* `5 s` — smooth fade to transparent.

Once faded, the overlay's internal state is updated to "invisible", so a **single** `Shift + 3` restores it. No double-toggle.

Any point move, grid load, or `Shift + 3` toggle resets the timer.  
Auto-fade does not run while the overlay is hidden via `Shift + 1`.

---

## Help Panel

Press `F2` (or run the script — the help panel opens automatically at start) to display the in-page reference on the right side.

The panel contains:

* build steps,
* hover description,
* point control panel notes,
* command format and examples,
* saved grids notes,
* shortcut table,
* limits,
* panel-size controls,
* a **▶ Перейти в Theatre Mode** button,
* a 4 × 4 illustrated example with points `1`, `2`, `3` shown in place.

While the help is open, the small info label in the top-left corner is hidden. Close it with `F2` and the info returns.

The help panel is rendered **above all other layers** (`z-index: 1000003`) and is scrollable.

---

## Limits

* Maximum grid size: `200 × 200` cells.
* Minimum cell size: `1 px` in both directions.
* Cell coordinates use floating-point values; the movement step can be adjusted from the control panel.
* Panel widths: `40 – 400 px` each.

---

## Workflow

1. Open the browser developer console with `F12`.
2. Paste and run the script.
3. Position the mouse and press `1`, `2`, `3` to build the grid.
4. Adjust points `1`, `2`, `3` if necessary.
5. Click a cell to select its coordinate.
6. Define commands in the format `((label)(command))`.
7. Click a command button to send the corresponding message.
8. Use `Shift + S` to save additional grids during the session.
9. Use the help panel (`F2`) to switch to Theatre Mode or tune panel widths.

---

## Notes

* Keyboard shortcuts are disabled while typing in text fields, text areas, and select menus.
* Point movement controls update the grid automatically.
* Moving point `3` changes the grid size without changing the cell size.
* Panel width settings persist across reloads until **Сброс** or `Shift + Delete`.
* `Shift + Delete` removes the script, its stylesheet, and every `localStorage` key starting with `gb-`.
* The script is designed to run directly in the browser console.
* For Twitch, the script expects the chat input and send button to be available on the page.