import * as vscode from 'vscode';
import * as path from 'path';
import { NoteManager } from '../services/NoteManager';
import { AuditNote, toVsCodeRange } from '../models/AuditNote';
import { AUDIT_COLORS, getAuditColorByBackground } from '../constants/colors';

export class NoteSidebarProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'auditnotes.sidebar';
    private _view?: vscode.WebviewView;
    private _currentNote?: AuditNote;
    private _currentSelection?: vscode.Selection;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async data => {
            switch (data.type) {
                case 'change': {
                    this._handleChange(data.text, data.color);
                    break;
                }
                case 'delete': {
                    if (this._currentNote) {
                        NoteManager.getInstance().deleteNote(this._currentNote.id);
                        this.clear();
                        this.refreshNoteList();
                    }
                    break;
                }
                case 'goToNote': {
                    await this._goToNote(data.id);
                    break;
                }
                case 'copyNote': {
                    if (this._currentNote) {
                        await this._copyNoteToClipboard(this._currentNote);
                    }
                    break;
                }
                case 'copyAllNotes': {
                    await this._copyAllNotesToClipboard();
                    break;
                }
                case 'ready': {
                    this.refreshNoteList();
                    if (this._currentNote) {
                        this.update(this._currentNote, undefined, false);
                    }
                    break;
                }
            }
        });
    }

    private _getNoteMarkdown(note: AuditNote): string {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        const fullPath = workspaceFolder ? path.join(workspaceFolder.uri.fsPath, note.filePath) : note.filePath;
        const rangeStr = note.range.startLine === note.range.endLine 
            ? `Line ${note.range.startLine + 1}` 
            : `Lines ${note.range.startLine + 1}-${note.range.endLine + 1}`;

        return `### Audit Note\n**File:** \`${fullPath}\`  \n**Range:** ${rangeStr}  \n**Note:** ${note.text || '_No text_'}\n`;
    }

    private async _copyNoteToClipboard(note: AuditNote) {
        const markdown = this._getNoteMarkdown(note);
        await vscode.env.clipboard.writeText(markdown);
        vscode.window.showInformationMessage('Note copied as Markdown.');
    }

    private async _copyAllNotesToClipboard() {
        const notes = NoteManager.getInstance().getNotes();
        if (notes.length === 0) {
            vscode.window.showWarningMessage('No notes to copy.');
            return;
        }

        let markdown = '# Audit Notes Export\n\n';
        markdown += notes.map(n => this._getNoteMarkdown(n)).join('\n---\n\n');

        await vscode.env.clipboard.writeText(markdown);
        vscode.window.showInformationMessage('All notes copied as Markdown.');
    }

    private async _goToNote(noteId: string) {
        const note = NoteManager.getInstance().getNotes().find(n => n.id === noteId);
        if (!note) return;

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) return;

        const fullPath = path.join(workspaceFolder.uri.fsPath, note.filePath);
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(fullPath));
        const editor = await vscode.window.showTextDocument(doc);
        const range = toVsCodeRange(note.range);
        
        editor.selection = new vscode.Selection(range.start, range.start);
        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
        
        this.update(note, undefined, true);
    }

    private _handleChange(text: string, color: string) {
        const noteManager = NoteManager.getInstance();
        const editor = vscode.window.activeTextEditor;

        if (this._currentNote) {
            // Update existing
            this._currentNote.text = text;
            this._currentNote.color = color;
            noteManager.updateNote(this._currentNote);
        } else if (editor && this._currentSelection) {
            const newNote: AuditNote = {
                id: Math.random().toString(36).substr(2, 9),
                filePath: vscode.workspace.asRelativePath(editor.document.uri),
                range: {
                    startLine: this._currentSelection.start.line,
                    startChar: 0,
                    endLine: this._currentSelection.end.line,
                    endChar: editor.document.lineAt(this._currentSelection.end.line).text.length
                },
                text: text,
                color: color
            };
            noteManager.addNote(newNote);
            this._currentNote = newNote;
        }
        this.refreshNoteList();
    }

    public update(note?: AuditNote, selection?: vscode.Selection, focus: boolean = true) {
        this._currentNote = note;
        this._currentSelection = selection;

        if (this._view) {
            this._view.show?.(true);
            this._view.webview.postMessage({
                type: 'update',
                text: note?.text || '',
                color: note?.color || AUDIT_COLORS[0].background,
                active: !!(note || selection)
            });
        }
        
        if (focus) {
            vscode.commands.executeCommand('auditnotes.sidebar.focus');
        }
    }

    public refreshNoteList() {
        if (this._view) {
            const notes = NoteManager.getInstance().getNotes();
            const grouped: { [key: string]: any[] } = {};
            notes.forEach(n => {
                if (!grouped[n.filePath]) grouped[n.filePath] = [];
                grouped[n.filePath].push({
                    id: n.id,
                    text: n.text || '',
                    fileName: n.filePath.split('/').pop(),
                    line: n.range.startLine + 1,
                    color: n.color,
                    vibrant: getAuditColorByBackground(n.color)?.vibrant || n.color.replace(/rgba\((.*), (.*), (.*), (.*)\)/, 'rgba($1, $2, $3, 1.0)')
                });
            });

            this._view.webview.postMessage({
                type: 'updateList',
                grouped: grouped
            });
        }
    }

    public clear() {
        this._currentNote = undefined;
        this._currentSelection = undefined;
        if (this._view) {
            this._view.webview.postMessage({ type: 'clear' });
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const colorButtons = AUDIT_COLORS.map(c => `
            <div class="color-option" 
                 data-color="${c.background}" 
                 style="background-color: ${c.vibrant};"
                 title="${c.label}">
            </div>
        `).join('');

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { padding: 12px; color: var(--vscode-foreground); font-family: var(--vscode-font-family); font-size: 13px; }
                    textarea { 
                        width: 100%; height: 80px; 
                        background: var(--vscode-input-background); 
                        color: var(--vscode-input-foreground); 
                        border: 1px solid var(--vscode-input-border);
                        padding: 8px; resize: vertical; margin-bottom: 12px;
                        font-family: inherit; border-radius: 4px;
                    }
                    .section { margin-bottom: 24px; }
                    .color-picker { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; align-items: center; }
                    .color-option { 
                        width: 22px; height: 22px; border-radius: 50%; cursor: pointer; border: 2px solid transparent;
                        transition: transform 0.1s;
                    }
                    .color-option:hover { transform: scale(1.1); }
                    .color-option.selected { border-color: var(--vscode-foreground); transform: scale(1.1); }
                    .custom-color-container { 
                        display: flex; align-items: center; gap: 10px; 
                        background: var(--vscode-input-background); padding: 6px 10px;
                        border: 1px solid var(--vscode-input-border); border-radius: 4px;
                    }
                    .custom-color { width: 24px; height: 24px; padding: 0; border: none; background: none; cursor: pointer; }
                    .actions { display: flex; gap: 10px; margin-top: 16px; }
                    button { 
                        flex: 1; background: var(--vscode-button-background); color: var(--vscode-button-foreground); 
                        border: none; padding: 8px; cursor: pointer; font-size: 12px; border-radius: 4px;
                        font-weight: 600;
                    }
                    button:hover { background: var(--vscode-button-hoverBackground); }
                    button.danger { background: #c74e39; color: white; }
                    button.danger:hover { background: #e05a47; }
                    button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
                    button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
                    .header { margin-bottom: 10px; font-weight: bold; opacity: 0.9; font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; display: flex; justify-content: space-between; align-items: center; }
                    
                    #note-list { display: flex; flex-direction: column; gap: 4px; }
                    details { margin-bottom: 4px; border-radius: 4px; overflow: hidden; }
                    summary { 
                        padding: 6px 8px; cursor: pointer; background: var(--vscode-sideBar-sectionHeader-background); 
                        font-weight: bold; font-size: 11px; outline: none; list-style: none;
                        display: flex; align-items: center; gap: 6px;
                    }
                    summary::-webkit-details-marker { display: none; }
                    summary::before { content: '▶'; font-size: 8px; transition: transform 0.1s; opacity: 0.5; }
                    details[open] summary::before { transform: rotate(90deg); }
                    
                    .note-item { 
                        display: flex; align-items: center; gap: 10px; padding: 6px 12px; cursor: pointer;
                        border-radius: 0; border-bottom: 1px solid var(--vscode-panel-border);
                        background: var(--vscode-list-inactiveSelectionBackground);
                        transition: background 0.2s;
                    }
                    .note-item:hover { background: var(--vscode-list-hoverBackground); }
                    .note-indicator { width: 3px; height: 20px; border-radius: 1px; flex-shrink: 0; }
                    .note-info { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; flex-grow: 1; }
                    .note-text-preview { font-weight: 600; font-size: 12px; }
                    .note-meta { font-size: 10px; opacity: 0.5; }
                    hr { border: none; border-top: 1px solid var(--vscode-panel-border); margin: 24px 0; opacity: 0.5; }
                    .empty-state { opacity: 0.5; font-style: italic; padding: 20px; text-align: center; font-size: 12px; }
                    #details-section { display: none; }
                    #details-section.active { display: block; }
                    .copy-btn { font-size: 9px; padding: 2px 6px; flex: none; width: auto; opacity: 0.7; }
                    .copy-btn:hover { opacity: 1; }
                </style>
            </head>
            <body>
                <div id="details-section">
                    <div class="section">
                        <div class="header" id="header">
                            <span>Audit Note Details</span>
                            <button class="secondary copy-btn" onclick="vscode.postMessage({ type: 'copyNote' })" title="Copy note as Markdown">Copy MD</button>
                        </div>
                        <textarea id="note-text" placeholder="Enter note text (optional)..."></textarea>
                        
                        <div class="header">Preset Colors</div>
                        <div class="color-picker" id="color-picker">
                            ${colorButtons}
                        </div>

                        <div class="header">Custom Color</div>
                        <div class="custom-color-container">
                            <input type="color" id="custom-color-input" class="custom-color" title="Custom color">
                            <span id="hex-label" style="font-family: monospace; opacity: 0.7; font-size: 12px;">#000000</span>
                        </div>

                        <div class="actions">
                            <button id="delete-btn" class="danger">Delete Note</button>
                        </div>
                    </div>
                    <hr>
                </div>

                <div class="section">
                    <div class="header">
                        <span>All Notes</span>
                        <button class="secondary copy-btn" onclick="vscode.postMessage({ type: 'copyAllNotes' })" title="Copy all notes as Markdown">Copy All MD</button>
                    </div>
                    <div id="note-list">
                        <div class="empty-state">Loading notes...</div>
                    </div>
                </div>

                <script>
                    const vscode = acquireVsCodeApi();
                    let selectedColor = '${AUDIT_COLORS[0].background}';

                    const detailsSection = document.getElementById('details-section');
                    const textA = document.getElementById('note-text');
                    const header = document.getElementById('header');
                    const colorPicker = document.getElementById('color-picker');
                    const customColorInput = document.getElementById('custom-color-input');
                    const hexLabel = document.getElementById('hex-label');
                    const deleteBtn = document.getElementById('delete-btn');
                    const noteList = document.getElementById('note-list');

                    vscode.postMessage({ type: 'ready' });

                    function updateSelection(color) {
                        selectedColor = color;
                        document.querySelectorAll('.color-option').forEach(opt => {
                            opt.classList.toggle('selected', opt.dataset.color === color);
                        });
                        
                        let hex = "#000000";
                        if (color.startsWith('rgba')) {
                            const rgba = color.match(/\\d+/g);
                            if (rgba && rgba.length >= 3) {
                                hex = "#" + ((1 << 24) + (parseInt(rgba[0]) << 16) + (parseInt(rgba[1]) << 8) + parseInt(rgba[2])).toString(16).slice(1);
                            }
                        } else {
                            hex = color;
                        }
                        
                        customColorInput.value = hex;
                        hexLabel.innerText = hex.toUpperCase();
                    }

                    function notifyChange() {
                        vscode.postMessage({ type: 'change', text: textA.value, color: selectedColor });
                    }

                    textA.addEventListener('input', notifyChange);

                    colorPicker.addEventListener('click', (e) => {
                        const opt = e.target.closest('.color-option');
                        if (opt) {
                            updateSelection(opt.dataset.color);
                            notifyChange();
                        }
                    });

                    customColorInput.addEventListener('input', (e) => {
                        const hex = e.target.value;
                        hexLabel.innerText = hex.toUpperCase();
                        const r = parseInt(hex.slice(1, 3), 16);
                        const g = parseInt(hex.slice(3, 5), 16);
                        const b = parseInt(hex.slice(5, 7), 16);
                        const rgba = \`rgba(\${r}, \${g}, \${b}, 0.3)\`;
                        selectedColor = rgba;
                        document.querySelectorAll('.color-option').forEach(opt => opt.classList.remove('selected'));
                        notifyChange();
                    });

                    deleteBtn.addEventListener('click', () => {
                        vscode.postMessage({ type: 'delete' });
                    });

                    window.addEventListener('message', event => {
                        const message = event.data;
                        switch (message.type) {
                            case 'update':
                                textA.value = message.text;
                                updateSelection(message.color);
                                detailsSection.classList.toggle('active', message.active);
                                break;
                            case 'updateList':
                                renderGroupedNoteList(message.grouped);
                                break;
                            case 'clear':
                                textA.value = '';
                                updateSelection('${AUDIT_COLORS[0].background}');
                                detailsSection.classList.remove('active');
                                break;
                        }
                    });

                    function renderGroupedNoteList(grouped) {
                        let html = '';
                        let hasNotes = false;
                        for (const filePath in grouped) {
                            hasNotes = true;
                            const notes = grouped[filePath];
                            const fileName = filePath.split('/').pop();
                            html += \`
                                <details open>
                                    <summary>\${fileName} (\${notes.length})</summary>
                                    <div class="file-notes">
                                        \${notes.map(n => \`
                                            <div class="note-item" onclick="vscode.postMessage({ type: 'goToNote', id: '\${n.id}' })">
                                                <div class="note-indicator" style="background-color: \${n.vibrant};"></div>
                                                <div class="note-info">
                                                    <div class="note-text-preview">\${escapeHtml(n.text)}</div>
                                                    <div class="note-meta">Line \${n.line}</div>
                                                </div>
                                            </div>
                                        \`).join('')}
                                    </div>
                                </details>
                            \`;
                        }
                        noteList.innerHTML = html || '<div class="empty-state">No notes found in workspace.</div>';
                    }

                    function escapeHtml(text) {
                        if (!text) return '';
                        const div = document.createElement('div');
                        div.textContent = text;
                        return div.innerHTML;
                    }
                </script>
            </body>
            </html>`;
    }
}
