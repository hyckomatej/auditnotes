# AuditNotes

AuditNotes lets you attach notes to selected code in VS Code. It is meant for audits, reviews, and general code investigation where you want to keep local notes without editing the source itself.

## Features

- **Code Annotation**: Add a note to any selected code range.
- **Visual Highlights**: Highlight ranges with 10 distinct preset colors (including White and Gray).
- **Sidebar Management**: View, edit, and navigate through all notes in a dedicated sidebar.
- **Categories**: Organize notes using multiple categories with tag-based management and quick suggestions.
- **Smart Grouping**: Toggle between file-grouped or flat-list views per category.
- **Markdown Export**: Copy individual notes, full categories, or your entire library as Markdown.
- **Local Storage**: Notes are stored entirely in a local `.audit-notes.json` file in your workspace root.

## Screenshots

### Notes Sidebar

<img src="./assets/notes.png" alt="Notes sidebar" width="700" />

### Context Menu

<img src="./assets/menu.png" alt="Context menu" width="520" />

## Usage

1. **Add a Note**: Select some code, right-click, and choose `Add Audit Note`.
2. **Edit & Categorize**: Use the sidebar to add text, pick colors, or assign categories.
3. **Quick Tags**: Click existing category suggestions to instantly tag your notes.
4. **Organize**: Toggle "Files ON/OFF" in dropdown headers to switch between grouped and flat views.
5. **Navigate**: Click any note in the sidebar to jump directly to the code.
6. **Export**: Use the `Copy MD` buttons to share your findings.

## Extension Settings

- `auditnotes.defaultColor`: The background color assigned to new audit notes.

## Storage

Notes are stored in a workspace-root file named `.audit-notes.json`.

- This file stays local to the project.
- The file is automatically generated when the sidebar is opened.
- If you do not want review notes committed, keep `.audit-notes.json` in `.gitignore`.

## Requirements

No external service, account, or API key is required.

## Limitations

- Notes are tied to file paths and saved line ranges.
- Large code edits, file moves, or file renames may require note cleanup or recreation.

## Release Notes

### 0.0.5
- Implemented Note Categories with tag-based UI and suggestions.
- Added persistent UI state for sidebar dropdowns and grouping toggles.
- Optimized performance with input debouncing and surgical DOM updates.

### 0.0.1
Initial public release.

## License

MIT

## Disclaimer

This extension was vibecoded and may contain bugs, rough edges, or broken behavior.

If you hit an issue or have an idea for improvement, please open an issue on GitHub:
https://github.com/hyckomatej/auditnotes/issues
