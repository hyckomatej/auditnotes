import * as vscode from "vscode";
import * as path from "path";
import { NoteManager } from "../services/NoteManager";
import { AuditNote, toVsCodeRange } from "../models/AuditNote";
import { AUDIT_COLORS, getAuditColorByBackground } from "../constants/colors";

export class NoteSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "auditnotes.sidebar";
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
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case "change": {
          this._handleChange(data.text, data.color, data.categories);
          break;
        }
        case "delete": {
          if (this._currentNote) {
            NoteManager.getInstance().deleteNote(this._currentNote.id);
            this.clear();
            this.refreshNoteList();
          }
          break;
        }
        case "goToNote": {
          await this._goToNote(data.id);
          break;
        }
        case "copyNote": {
          if (this._currentNote) {
            await this._copyNoteToClipboard(this._currentNote);
          }
          break;
        }
        case "copyAllNotes": {
          await this._copyAllNotesToClipboard();
          break;
        }
        case "copyCategoryNotes": {
          await this._copyCategoryNotesToClipboard(data.category);
          break;
        }
        case "toggleDropdown": {
          NoteManager.getInstance().setCollapsedState(data.id, !data.open);
          break;
        }
        case "toggleFileGrouping": {
          NoteManager.getInstance().setFileGroupingState(data.id, data.enabled);
          this.refreshNoteList();
          break;
        }
        case "ready": {
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
    const fullPath = workspaceFolder
      ? path.join(workspaceFolder.uri.fsPath, note.filePath)
      : note.filePath;
    const rangeStr =
      note.range.startLine === note.range.endLine
        ? `Line ${note.range.startLine + 1}`
        : `Lines ${note.range.startLine + 1}-${note.range.endLine + 1}`;

    return `### Audit Note\n**File:** \`${fullPath}\`  \n**Range:** ${rangeStr}  \n**Note:** ${note.text || "_No text_"}\n`;
  }

  private async _copyNoteToClipboard(note: AuditNote) {
    const markdown = this._getNoteMarkdown(note);
    await vscode.env.clipboard.writeText(markdown);
    vscode.window.showInformationMessage("Note copied as Markdown.");
  }

  private async _copyAllNotesToClipboard() {
    const notes = NoteManager.getInstance().getNotes();
    if (notes.length === 0) {
      vscode.window.showWarningMessage("No notes to copy.");
      return;
    }

    let markdown = "# Audit Notes Export\n\n";
    markdown += notes.map((n) => this._getNoteMarkdown(n)).join("\n---\n\n");

    await vscode.env.clipboard.writeText(markdown);
    vscode.window.showInformationMessage("All notes copied as Markdown.");
  }

  private async _copyCategoryNotesToClipboard(category: string) {
    const notes = NoteManager.getInstance()
      .getNotes()
      .filter((n) => n.categories?.includes(category));
    if (notes.length === 0) {
      vscode.window.showWarningMessage(
        `No notes in category "${category}" to copy.`,
      );
      return;
    }

    let markdown = `# Audit Notes - Category: ${category}\n\n`;
    markdown += notes.map((n) => this._getNoteMarkdown(n)).join("\n---\n\n");

    await vscode.env.clipboard.writeText(markdown);
    vscode.window.showInformationMessage(
      `Notes from category "${category}" copied as Markdown.`,
    );
  }

  private async _goToNote(noteId: string) {
    const note = NoteManager.getInstance()
      .getNotes()
      .find((n) => n.id === noteId);
    if (!note) {
      return;
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return;
    }

    const fullPath = path.join(workspaceFolder.uri.fsPath, note.filePath);
    const doc = await vscode.workspace.openTextDocument(
      vscode.Uri.file(fullPath),
    );
    const editor = await vscode.window.showTextDocument(doc);
    const range = toVsCodeRange(note.range);

    editor.selection = new vscode.Selection(range.start, range.start);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);

    this.update(note, undefined, true);
  }

  private _handleChange(text: string, color: string, categories?: string[]) {
    const noteManager = NoteManager.getInstance();
    const editor = vscode.window.activeTextEditor;

    if (this._currentNote) {
      const oldCategories = this._currentNote.categories || [];
      const newCategories = categories || [];
      const categoriesChanged = JSON.stringify(oldCategories.sort()) !== JSON.stringify(newCategories.sort());

      // Update existing
      this._currentNote.text = text;
      this._currentNote.color = color;
      this._currentNote.categories = categories;
      noteManager.updateNote(this._currentNote);

      if (categoriesChanged) {
        // If categories changed, we need a full refresh to move the note between sections
        this.refreshNoteList();
      } else {
        // Just update the note item in the webview surgically
        if (this._view) {
          const vibrant = getAuditColorByBackground(color)?.vibrant || 
                          color.replace(/rgba\((.*), (.*), (.*), (.*)\)/, "rgba($1, $2, $3, 1.0)");
          this._view.webview.postMessage({
            type: "updateNoteItem",
            id: this._currentNote.id,
            text: text,
            vibrant: vibrant
          });
        }
      }
    } else if (editor && this._currentSelection) {
      const newNote: AuditNote = {
        id: Math.random().toString(36).substr(2, 9),
        filePath: vscode.workspace.asRelativePath(editor.document.uri),
        range: {
          startLine: this._currentSelection.start.line,
          startChar: 0,
          endLine: this._currentSelection.end.line,
          endChar: editor.document.lineAt(this._currentSelection.end.line).text
            .length,
        },
        text: text,
        color: color,
        categories: categories,
      };
      noteManager.addNote(newNote);
      this._currentNote = newNote;
      this.refreshNoteList(); // Always full refresh for new notes
    }
  }

  public update(
    note?: AuditNote,
    selection?: vscode.Selection,
    focus: boolean = true,
  ) {
    this._currentNote = note;
    this._currentSelection = selection;

    if (focus) {
      if (this._view) {
        this._view.show?.(true);
      } else {
        vscode.commands.executeCommand("auditnotes.sidebar.focus");
      }
    }

    if (this._view) {
      const allNotes = NoteManager.getInstance().getNotes();
      const allCategories = Array.from(
        new Set(allNotes.flatMap((n) => n.categories || [])),
      ).sort();

      this._view.webview.postMessage({
        type: "update",
        text: note?.text || "",
        color: note?.color || AUDIT_COLORS[0].background,
        active: !!(note || selection),
        categories: note?.categories || [],
        allCategories: allCategories,
      });
    }
  }

  public refreshNoteList() {
    if (this._view) {
      const noteManager = NoteManager.getInstance();
      const notes = noteManager.getNotes();

      // Prepare All Notes grouped by file
      const allNotesGrouped: { [key: string]: any[] } = {};
      const categoriesGrouped: { [category: string]: { [file: string]: any[] } } =
        {};

      notes.forEach((n) => {
        const noteInfo = {
          id: n.id,
          text: n.text || "",
          fileName: n.filePath.split("/").pop(),
          line: n.range.startLine + 1,
          color: n.color,
          vibrant:
            getAuditColorByBackground(n.color)?.vibrant ||
            n.color.replace(
              /rgba\((.*), (.*), (.*), (.*)\)/,
              "rgba($1, $2, $3, 1.0)",
            ),
        };

        // Add to All Notes
        if (!allNotesGrouped[n.filePath]) {
          allNotesGrouped[n.filePath] = [];
        }
        allNotesGrouped[n.filePath].push(noteInfo);

        // Add to Categories
        if (n.categories && n.categories.length > 0) {
          n.categories.forEach((cat) => {
            if (!categoriesGrouped[cat]) {
              categoriesGrouped[cat] = {};
            }
            if (!categoriesGrouped[cat][n.filePath]) {
              categoriesGrouped[cat][n.filePath] = [];
            }
            categoriesGrouped[cat][n.filePath].push(noteInfo);
          });
        }
      });

      this._view.webview.postMessage({
        type: "updateList",
        allNotes: allNotesGrouped,
        categories: categoriesGrouped,
        collapsedStates: noteManager.getCollapsedStates(),
        fileGroupingStates: noteManager.getFileGroupingStates(),
      });
    }
  }

  public syncWithNotes() {
    const noteManager = NoteManager.getInstance();

    this.refreshNoteList();

    if (this._currentNote) {
      const latestNote = noteManager
        .getNotes()
        .find((note) => note.id === this._currentNote?.id);

      if (latestNote) {
        this.update(latestNote, this._currentSelection, false);
      } else {
        this.clear();
      }
      return;
    }

    if (this._currentSelection) {
      this.update(undefined, this._currentSelection, false);
    }
  }

  public clear() {
    this._currentNote = undefined;
    this._currentSelection = undefined;
    if (this._view) {
      this._view.webview.postMessage({ type: "clear" });
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const colorButtons = AUDIT_COLORS.map(
      (c) => `
            <div class="color-option" 
                 data-color="${c.background}" 
                 style="background-color: ${c.vibrant};"
                 title="${c.label}">
            </div>
        `,
    ).join("");

    const defaultColor = AUDIT_COLORS[0].background;

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
                    
                    .category-section { margin-top: 12px; }
                    .category-input-container { display: flex; gap: 4px; margin-bottom: 8px; }
                    .category-input-container input { 
                        flex: 1; background: var(--vscode-input-background); color: var(--vscode-input-foreground); 
                        border: 1px solid var(--vscode-input-border); padding: 4px 8px; border-radius: 4px; font-size: 11px;
                    }
                    .category-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 12px; }
                    .category-tag { 
                        background: var(--vscode-badge-background); color: var(--vscode-badge-foreground);
                        padding: 2px 6px; border-radius: 4px; font-size: 10px; display: flex; align-items: center; gap: 4px;
                    }
                    .category-tag .remove { cursor: pointer; opacity: 0.7; font-weight: bold; }
                    .category-tag .remove:hover { opacity: 1; }

                    .suggestion-header { font-size: 10px; opacity: 0.6; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
                    .category-suggestions { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 12px; }
                    .suggestion-tag { 
                        background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground);
                        padding: 2px 6px; border-radius: 4px; font-size: 10px; cursor: pointer; border: 1px solid transparent;
                    }
                    .suggestion-tag:hover { background: var(--vscode-button-secondaryHoverBackground); border-color: var(--vscode-focusBorder); }

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
                    button.small { padding: 4px 8px; flex: none; font-size: 10px; }
                    
                    .header { margin-bottom: 10px; font-weight: bold; opacity: 0.9; font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; display: flex; justify-content: space-between; align-items: center; }
                    
                    .list-dropdown { margin-bottom: 8px; border: 1px solid var(--vscode-panel-border); border-radius: 4px; overflow: hidden; }
                    .list-dropdown > summary { 
                        padding: 8px 12px; cursor: pointer; background: var(--vscode-sideBar-sectionHeader-background); 
                        font-weight: bold; font-size: 11px; outline: none; list-style: none;
                        display: flex; align-items: center; justify-content: space-between;
                    }
                    .list-dropdown > summary::-webkit-details-marker { display: none; }
                    .dropdown-title { display: flex; align-items: center; gap: 8px; }
                    .dropdown-title::before { content: '▶'; font-size: 8px; transition: transform 0.1s; opacity: 0.5; }
                    .list-dropdown[open] > summary .dropdown-title::before { transform: rotate(90deg); }
                    
                    .dropdown-controls { display: flex; gap: 6px; align-items: center; }

                    .file-group { margin-bottom: 4px; }
                    .file-group summary { 
                        padding: 4px 16px; cursor: pointer; font-weight: bold; font-size: 11px; opacity: 0.8;
                        display: flex; align-items: center; gap: 6px;
                    }
                    .file-group summary::before { content: '▶'; font-size: 7px; opacity: 0.5; }
                    .file-group[open] summary::before { transform: rotate(90deg); }

                    .note-item { 
                        display: flex; align-items: center; gap: 10px; padding: 6px 20px; cursor: pointer;
                        border-bottom: 1px solid var(--vscode-panel-border);
                        background: var(--vscode-list-inactiveSelectionBackground);
                        transition: background 0.2s;
                    }
                    .note-item:hover { background: var(--vscode-list-hoverBackground); }
                    .note-indicator { width: 3px; height: 18px; border-radius: 1px; flex-shrink: 0; }
                    .note-info { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; flex-grow: 1; }
                    .note-text-preview { font-weight: 600; font-size: 12px; }
                    .note-meta { font-size: 10px; opacity: 0.5; }
                    hr { border: none; border-top: 1px solid var(--vscode-panel-border); margin: 24px 0; opacity: 0.5; }
                    .empty-state { opacity: 0.5; font-style: italic; padding: 12px; text-align: center; font-size: 11px; }
                    #details-section { display: none; }
                    #details-section.active { display: block; }
                    .copy-btn { font-size: 9px; padding: 2px 6px; flex: none; width: auto; opacity: 0.7; }
                    .copy-btn:hover { opacity: 1; }
                    .group-toggle-btn { 
                        font-size: 9px; padding: 2px 6px; flex: none; width: auto; opacity: 0.7; 
                        background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground);
                        border-radius: 4px; border: none; cursor: pointer;
                    }
                    .group-toggle-btn:hover { opacity: 1; }
                    .group-toggle-btn.active { 
                        background: var(--vscode-button-background); color: var(--vscode-button-foreground); 
                    }
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
                        
                        <div class="header">Categories</div>
                        <div class="category-section">
                            <div class="category-input-container">
                                <input type="text" id="category-input" placeholder="Add category...">
                                <button class="small" id="add-category-btn">Add</button>
                            </div>
                            <div id="category-tags" class="category-tags"></div>
                            
                            <div id="suggestion-container" style="display: none;">
                                <div class="suggestion-header">Suggestions</div>
                                <div id="category-suggestions" class="category-suggestions"></div>
                            </div>
                        </div>

                        <div class="header" style="margin-top: 20px;">Preset Colors</div>
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
                    <div class="header">Notes Library</div>
                    <div id="list-containers">
                        <div class="empty-state">Loading notes...</div>
                    </div>
                </div>

                <script>
                    const vscode = acquireVsCodeApi();
                    let selectedColor = '${defaultColor}';
                    let currentCategories = [];
                    let globalCategories = [];
                    let debounceTimer;

                    const detailsSection = document.getElementById('details-section');
                    const textA = document.getElementById('note-text');
                    const categoryInput = document.getElementById('category-input');
                    const addCategoryBtn = document.getElementById('add-category-btn');
                    const categoryTags = document.getElementById('category-tags');
                    const suggestionContainer = document.getElementById('suggestion-container');
                    const categorySuggestions = document.getElementById('category-suggestions');
                    const colorPicker = document.getElementById('color-picker');
                    const customColorInput = document.getElementById('custom-color-input');
                    const hexLabel = document.getElementById('hex-label');
                    const deleteBtn = document.getElementById('delete-btn');
                    const listContainers = document.getElementById('list-containers');

                    vscode.postMessage({ type: 'ready' });

                    // Handle toggle events using delegation on summary clicks
                    document.addEventListener('click', (event) => {
                        const summary = event.target.closest('summary');
                        if (summary && summary.parentElement.tagName === 'DETAILS') {
                            const details = summary.parentElement;
                            if (details.dataset.id) {
                                const willBeOpen = !details.open;
                                vscode.postMessage({ 
                                    type: 'toggleDropdown', 
                                    id: details.dataset.id, 
                                    open: willBeOpen 
                                });
                            }
                        }
                    });

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

                    function updateCategoryTags() {
                        categoryTags.innerHTML = currentCategories.map(cat => \`
                            <div class="category-tag">
                                \${cat}
                                <span class="remove" onclick="removeCategory('\${cat}')">×</span>
                            </div>
                        \`).join('');
                        updateSuggestions();
                    }

                    function updateSuggestions() {
                        const suggestions = globalCategories.filter(cat => !currentCategories.includes(cat));
                        if (suggestions.length > 0) {
                            suggestionContainer.style.display = 'block';
                            categorySuggestions.innerHTML = suggestions.map(cat => \`
                                <div class="suggestion-tag" onclick="addExistingCategory('\${cat}')">\${cat}</div>
                            \`).join('');
                        } else {
                            suggestionContainer.style.display = 'none';
                        }
                    }

                    function addExistingCategory(cat) {
                        if (!currentCategories.includes(cat)) {
                            currentCategories.push(cat);
                            updateCategoryTags();
                            notifyChange(true);
                        }
                    }

                    function removeCategory(cat) {
                        currentCategories = currentCategories.filter(c => c !== cat);
                        updateCategoryTags();
                        notifyChange(true);
                    }

                    function addCategory() {
                        const val = categoryInput.value.trim();
                        if (val && !currentCategories.includes(val)) {
                            currentCategories.push(val);
                            categoryInput.value = '';
                            updateCategoryTags();
                            notifyChange(true);
                        }
                    }

                    addCategoryBtn.addEventListener('click', addCategory);
                    categoryInput.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') addCategory();
                    });

                    function notifyChange(immediate = false) {
                        clearTimeout(debounceTimer);
                        const performChange = () => {
                            vscode.postMessage({ 
                                type: 'change', 
                                text: textA.value, 
                                color: selectedColor,
                                categories: currentCategories
                            });
                        };

                        if (immediate) {
                            performChange();
                        } else {
                            debounceTimer = setTimeout(performChange, 300);
                        }
                    }

                    textA.addEventListener('input', () => notifyChange(false));

                    colorPicker.addEventListener('click', (e) => {
                        const opt = e.target.closest('.color-option');
                        if (opt) {
                            updateSelection(opt.dataset.color);
                            notifyChange(true);
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
                        notifyChange(false);
                    });

                    deleteBtn.addEventListener('click', () => {
                        vscode.postMessage({ type: 'delete' });
                    });

                    window.addEventListener('message', event => {
                        const message = event.data;
                        switch (message.type) {
                            case 'update':
                                textA.value = message.text;
                                currentCategories = message.categories || [];
                                globalCategories = message.allCategories || [];
                                updateCategoryTags();
                                updateSelection(message.color);
                                detailsSection.classList.toggle('active', message.active);
                                break;
                            case 'updateList':
                                renderList(message.allNotes, message.categories, message.collapsedStates, message.fileGroupingStates);
                                break;
                            case 'updateNoteItem':
                                updateNoteInList(message.id, message.text, message.vibrant);
                                break;
                            case 'clear':
                                textA.value = '';
                                currentCategories = [];
                                updateCategoryTags();
                                updateSelection('${defaultColor}');
                                detailsSection.classList.remove('active');
                                break;
                        }
                    });

                    function updateNoteInList(id, text, vibrant) {
                        const items = document.querySelectorAll(\`.note-item[data-note-id="\${id}"]\`);
                        items.forEach(item => {
                            const textPreview = item.querySelector('.note-text-preview');
                            if (textPreview) textPreview.textContent = text || 'No text';
                            const indicator = item.querySelector('.note-indicator');
                            if (indicator && vibrant) indicator.style.backgroundColor = vibrant;
                        });
                    }

                    function renderList(allNotes, categories, collapsedStates, fileGroupingStates) {
                        let html = '';
                        html += renderDropdown('All Notes', allNotes, 'copyAllNotes', null, collapsedStates, fileGroupingStates, 'all-notes');
                        for (const catName in categories) {
                            html += renderDropdown(\`Category: \${catName}\`, categories[catName], 'copyCategoryNotes', catName, collapsedStates, fileGroupingStates, \`category:\${catName}\`);
                        }
                        listContainers.innerHTML = html || '<div class="empty-state">No notes found in workspace.</div>';
                    }

                    function renderDropdown(title, groupedFiles, copyMsgType, categoryName, collapsedStates, fileGroupingStates, idPrefix) {
                        const hasNotes = Object.keys(groupedFiles).length > 0;
                        if (!hasNotes && title !== 'All Notes') return '';

                        const isTopOpen = collapsedStates[idPrefix] === false;
                        const isFileGroupingEnabled = fileGroupingStates[idPrefix] !== false;

                        let contentHtml = '';
                        if (isFileGroupingEnabled) {
                            for (const filePath in groupedFiles) {
                                const notes = groupedFiles[filePath];
                                const fileName = filePath.split('/').pop();
                                const fileId = \`\${idPrefix}:\${filePath}\`;
                                const isFileOpen = collapsedStates[fileId] === false;

                                contentHtml += \`
                                    <details class="file-group" \${isFileOpen ? 'open' : ''} data-id="\${fileId}">
                                        <summary>\${fileName} (\${notes.length})</summary>
                                        <div class="file-notes">
                                            \${notes.map(n => renderNoteItem(n)).join('')}
                                        </div>
                                    </details>
                                \`;
                            }
                        } else {
                            const allNotesFlat = Object.values(groupedFiles).flat();
                            contentHtml += \`
                                <div class="file-notes">
                                    \${allNotesFlat.map(n => renderNoteItem(n)).join('')}
                                </div>
                            \`;
                        }

                        const copyAction = categoryName 
                            ? \`vscode.postMessage({ type: 'copyCategoryNotes', category: '\${categoryName}' })\`
                            : \`vscode.postMessage({ type: 'copyAllNotes' })\`;

                        const toggleGroupingAction = \`vscode.postMessage({ type: 'toggleFileGrouping', id: '\${idPrefix}', enabled: \${!isFileGroupingEnabled} })\`;

                        return \`
                            <details class="list-dropdown" \${isTopOpen ? 'open' : ''} data-id="\${idPrefix}">
                                <summary>
                                    <div class="dropdown-title">\${title}</div>
                                    <div class="dropdown-controls">
                                        <button class="group-toggle-btn \${isFileGroupingEnabled ? 'active' : ''}" 
                                                onclick="event.stopPropagation(); \${toggleGroupingAction}" 
                                                title="\${isFileGroupingEnabled ? 'Disable file grouping' : 'Enable file grouping'}">
                                            \${isFileGroupingEnabled ? 'Files ON' : 'Files OFF'}
                                        </button>
                                        <button class="secondary copy-btn" onclick="event.stopPropagation(); \${copyAction}">Copy MD</button>
                                    </div>
                                </summary>
                                <div class="dropdown-content">
                                    \${contentHtml || '<div class="empty-state">No notes here yet.</div>'}
                                </div>
                            </details>
                        \`;
                    }

                    function renderNoteItem(n) {
                        return \`
                            <div class="note-item" data-note-id="\${n.id}" onclick="vscode.postMessage({ type: 'goToNote', id: '\${n.id}' })">
                                <div class="note-indicator" style="background-color: \${n.vibrant};"></div>
                                <div class="note-info">
                                    <div class="note-text-preview">\${escapeHtml(n.text) || '<i>No text</i>'}</div>
                                    <div class="note-meta">\${n.fileName} : Line \${n.line}</div>
                                </div>
                            </div>
                        \`;
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
