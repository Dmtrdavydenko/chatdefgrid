# chatdefgrid

### Build a Grid Using the Browser Console (F12)

An interactive grid builder for browser pages.

The script creates a coordinate grid by defining the size of the first cell using points 1 and 2, then setting the table boundary using point 3.

---

## Step 1 — Set the Starting Corner

Move the mouse to the top-left corner of the first cell and press `1`.

```text
┌──────┐
│  А1  │
└──────┘
```

Point `1` defines the top-left corner of the first cell.

---

## Step 2 — Set the Opposite Corner

Move the mouse to the bottom-right corner of the first cell and press `2`.

```text
1──────┐
│  А1  │
└──────2
```

The distance between points `1` and `2` determines the cell width and height.

---

## Step 3 — Define the Table Boundary

Move the mouse to the bottom-right corner of the table and press `3`.

Point `3` defines the outer boundary of the grid and can be adjusted later from the control panel.

The script automatically:

* Calculates the number of rows and columns.
* Creates the grid and fills the selected area with cells.
* Assigns coordinates to each cell.

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

Columns use Cyrillic letters, and rows use numbers.

```text
А1  Б1  В1
А2  Б2  В2
А3  Б3  В3
```

Click any cell to select its coordinate. The selected coordinate is automatically inserted into commands wherever the `-` placeholder appears.

---

## Grid Point Control Panel

After creating the grid, you can adjust points `1`, `2`, and `3` using the control panel.

Movement controls:

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

Point 3 controls the bottom-right boundary of the table.

Moving point 3 changes:
- number of columns;
- number of rows;
- total grid area.

Point 3 does not change the cell size. It only changes the table boundary.

These controls allow precise grid alignment by moving each reference point independently.

---

## Commands Panel

Enter commands in the text area, with one command per line.

Example:

```text
!tower -;
!cold -;
!upgrade;
```

### Special Characters

* `-` — replaced with the currently selected cell coordinate.
* `;` — marks the end of a command and is removed before sending.

Example:

Before selecting a cell:

```text
!tower -;
```

After selecting cell `А1`:

```text
!tower А1
```

Click **Save** to convert the commands into buttons.

Click a command button to insert the resulting message into the Twitch chat input and trigger the send button.

---

## Video Player

The script hides the video player while the grid interface is active.

Press `Shift + 1` to hide the grid interface and restore the video player. Press it again to show the interface and hide the player.

---

## Keyboard Shortcuts

| Key              | Action                                                    |
| ---------------- | --------------------------------------------------------- |
| `1`              | Set point 1 — top-left corner of the first cell           |
| `2`              | Set point 2 — bottom-right corner of the first cell       |
| `3`              | Set point 3 — bottom-right table boundary and build grid |
| `Shift + 1`      | Hide/show the grid interface and toggle the video player  |
| `Shift + 3`      | Toggle grid transparency while keeping cell clicks active |
| `F2`             | Open the help dialog                                      |
| `Delete`         | Clear the current grid and start setup again              |
| `Shift + Delete` | Remove the script completely                              |

---

## Transparency Mode

Press `Shift + 3` to toggle the opacity of the grid, point markers, and control panel.

When transparency mode is enabled:

* Grid lines and point markers become invisible.
* Cell click targets remain active, allowing you to select coordinates.
* The control panel becomes invisible and non-interactive.
* The grid geometry remains unchanged.

This lets you select cells without visible grid lines covering the underlying page.

---

## Workflow

1. Open the browser developer console with `F12`.
2. Paste and run the script.
3. Position the mouse and press `1`, `2`, and `3` to build the grid.
4. Adjust points 1, 2, and 3 if necessary.
   Points 1 and 2 define the cell size.
   Point 3 defines the grid boundary.
5. Click a cell to select its coordinate.
6. Save your commands in the Commands Panel.
7. Click a command button to send the corresponding message.

---

## Notes

* Keyboard shortcuts are disabled while typing in text fields, text areas, and select menus.
* Point movement controls update the grid automatically after moving points.
* Moving point 3 changes the grid size without changing the cell dimensions.
* The script is designed to run directly in the browser console.
* For Twitch, the script expects the chat input and send button to be available on the page.
