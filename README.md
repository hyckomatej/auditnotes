# AuditNotes

AuditNotes is a VS Code extension for leaving color-coded audit notes directly on code selections. It is designed for security reviews, code audits, and deep review passes where you want persistent, visible annotations without editing the source file itself.

## Features

- Add audit notes from the editor context menu on any selected code range.
- Highlight reviewed code with color-coded decorations.
- Edit, delete, and browse notes from the Audit Notes sidebar.
- Hover annotated code to preview the note inline.
- Copy a single note or all notes as Markdown for reports and findings docs.
- Store notes locally in the workspace so they persist between sessions.

## How It Works

1. Select a code range in the editor.
2. Right-click and run `Add Audit Note`.
3. Write the note in the Audit Notes sidebar and choose a highlight color.
4. Revisit notes from the sidebar or hover over highlighted code in the editor.
5. Use `Copy MD` or `Copy All MD` to export notes as Markdown.

## Extension Settings

This extension contributes the following setting:

- `auditnotes.defaultColor`: Default background color used for new audit notes.

## Storage

AuditNotes stores note data in a workspace-root file named `.audit-notes.json`.

- This file is local project data, not a remote service.
- If you do not want personal review notes committed to git, keep `.audit-notes.json` in `.gitignore`.

## Requirements

No external service, account, or API key is required.

## Known Limitations

- Notes are tied to file paths and saved line ranges in the current workspace.
- Large code edits, file moves, or file renames may require note cleanup or recreation.

## Release Notes

### 0.0.1

Initial public release of AuditNotes with sidebar note management, inline highlights, hover previews, and Markdown export.

## License

MIT


