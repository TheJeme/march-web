# March

March is a simple local-first task and note app built with vanilla HTML, CSS, and JavaScript.

## Features

- Three views: Tasks, Notes, and Settings
- No routes or framework runtime
- LocalStorage persistence for tasks, note content, and task view mode
- Task list mode with forward/back state movement
- Kanban mode with exactly three configurable columns
- Default Kanban columns: New, Doing, Done
- PWA manifest and service worker for offline caching
- PNG and SVG app icons for install support
- Open Graph and Twitter preview tags
- JSON export/import backups
- Inline task editing, clear-done cleanup, and Kanban drag-and-drop
- Theme presets and editable Kanban column names

## Run

Open `index.html` in a browser, or serve the folder with any static file server.

For service worker testing, use a local server because most browsers do not register service workers from plain file URLs.

```bash
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## Data

All app data stays in the browser:

- `march.tasks.v1`
- `march.note.v1`
- `march.mode.v1`
- `march.columns.v1`
- `march.theme.v1`

Clearing site data removes the saved tasks and note.
