# chatdefgrid

### Build a grid using the browser console (F12)

Interactive grid builder for browser pages.

The script creates a coordinate grid by selecting the first cell size and the table boundary.

---

## Step 1 — Set the starting corner

Move the mouse to the top-left corner of the first cell and press keyboard key `1`.

```text
┌──────┐
│  А1  │
└──────┘
```

Point `1` defines the first corner of the grid cell.

---

## Step 2 — Set the opposite corner of the first cell

Move the mouse to the opposite corner of the first cell and press keyboard key `2`.

```text
1──────┐
│  А1  │
└──────2
```

The distance between points `1` and `2` defines:

- cell width
- cell height

---

## Step 3 — Define the table boundary and build the grid

Move the mouse to the desired bottom-right corner of the table and press keyboard key `3`.

The script automatically:

- calculates rows and columns
- creates the grid
- fills the selected area with cells
- adds coordinates

Example:

```text
1──────┐┌──────┐
│  А1  ││  Б1  │
└──────┘└──────┘
┌──────┐┌──────┐
│  А2  ││  Б2  │
└──────┘└──────┘
                 3
```

---

# Grid coordinates

Columns use Cyrillic letters:

```text
А1  Б1  В1
А2  Б2  В2
А3  Б3  В3
```

Click any cell to select its coordinate.

The selected coordinate is inserted into commands.

---

# Point control panel

After creating the grid, points `1` and `2` can be adjusted.

Movement controls:

```text
        ▲
        │
◀────── ● ──────▶
        │
        ▼
```

Movement step:

```text
1 px
0.5 px
0.1 px
0.01 px
```

Allows precise grid alignment.

---

# Commands panel

Commands can be entered in the textarea.

Example:

```text
!tower -;
!cold -;
!upgrade;
```

Special symbols:

`-` is replaced with the selected cell coordinate.

Example:

Before:

```text
!tower -;
```

After selecting cell `А1`:

```text
!tower А1
```

Symbol `;` marks the end of the command and is removed before sending.

After pressing **Save**, commands become buttons.

Clicking a button sends the message.

---

# Video player

The script hides the video player while creating and editing the grid.

When the grid interface is hidden, the video player is restored.

---

# Keyboard shortcuts

| Key | Action |
|-----|--------|
| `1` | Set point 1 (top-left corner of first cell) |
| `2` | Set point 2 (bottom-right corner of first cell) |
| `3` | Set table boundary and build grid |
| `Shift + 1` | Hide/show grid interface |
| `Shift + 3` | Hide/show grid lines, points and control panel |
| `F2` | Open help |
| `Delete` | Remove current grid and start setup again |
| `Shift + Delete` | Remove script completely |

---

# Workflow

1. Open browser developer console (`F12`).
2. Run the script.
3. Move the mouse and press:
   - `1` — first corner of the cell
   - `2` — opposite corner of the cell
   - `3` — table boundary
4. Adjust points if needed.
5. Click a cell to select coordinates.
6. Use command buttons to send messages.

---

# Notes

Keyboard shortcuts are disabled while typing in:

- textarea
- input fields
- select menus

The result is an interactive coordinate grid built directly on top of the browser page.