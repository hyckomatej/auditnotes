import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { AuditNote, AuditNotesData, toVsCodeRange } from "../models/AuditNote";
import { getAuditColorByBackground } from "../constants/colors";

export class NoteManager {
  private static instance: NoteManager;
  private notes: AuditNote[] = [];
  private collapsedStates: { [key: string]: boolean } = {};
  private fileGroupingStates: { [key: string]: boolean } = {};
  private lastSaveTime = 0;
  private isVisible = true;
  private decorationTypes: Map<string, vscode.TextEditorDecorationType> =
    new Map();
  private readonly STORAGE_FILE = ".audit-notes.json";
  private statusBarItem: vscode.StatusBarItem;
  private fileWatcher?: vscode.FileSystemWatcher;
  private _onDidNotesChange = new vscode.EventEmitter<void>();
  public readonly onDidNotesChange = this._onDidNotesChange.event;

  private constructor() {
    this.loadNotes();
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100,
    );
    this.statusBarItem.command = "auditnotes.toggleVisibility";
    this.updateStatusBar();
    this.statusBarItem.show();
    this.setupWatcher();
  }

  public static getInstance(): NoteManager {
    if (!NoteManager.instance) {
      NoteManager.instance = new NoteManager();
    }
    return NoteManager.instance;
  }

  private setupWatcher() {
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length > 0) {
      const pattern = new vscode.RelativePattern(folders[0], this.STORAGE_FILE);
      this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);
      
      this.fileWatcher.onDidChange(() => {
        if (Date.now() - this.lastSaveTime < 250) {
          return;
        }
        this.loadNotes(true);
      });
      this.fileWatcher.onDidCreate(() => {
        if (Date.now() - this.lastSaveTime < 250) {
          return;
        }
        this.loadNotes(true);
      });
      this.fileWatcher.onDidDelete(() => {
        this.notes = [];
        this.collapsedStates = {};
        this.fileGroupingStates = {};
        this.updateAllEditors();
        this._onDidNotesChange.fire();
      });
    }
  }

  private getStoragePath(): string | undefined {
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length > 0) {
      return path.join(folders[0].uri.fsPath, this.STORAGE_FILE);
    }
    return undefined;
  }

  private loadNotes(notify = false) {
    const filePath = this.getStoragePath();
    if (filePath && fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, "utf8");
        if (!content.trim()) {
          this.notes = [];
          this.collapsedStates = {};
          this.fileGroupingStates = {};
        } else {
          const data: AuditNotesData = JSON.parse(content);
          this.notes = data.notes || [];
          this.collapsedStates = data.uiState?.collapsedStates || {};
          this.fileGroupingStates = data.uiState?.fileGroupingStates || {};
        }
      } catch (e) {
        console.error("Failed to load audit notes:", e);
        // Don't clear if it's just a temporary write lock issue or similar
      }
    } else {
      this.notes = [];
      this.collapsedStates = {};
      this.fileGroupingStates = {};
    }

    if (notify) {
      this.updateAllEditors();
      this._onDidNotesChange.fire();
    }
  }

  public saveNotes() {
    const filePath = this.getStoragePath();
    if (filePath) {
      const data: AuditNotesData = {
        version: "1.0",
        notes: this.notes,
        uiState: {
          collapsedStates: this.collapsedStates,
          fileGroupingStates: this.fileGroupingStates,
        },
      };
      try {
        this.lastSaveTime = Date.now();
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      } catch (e) {
        console.error("Failed to save audit notes:", e);
      }
    }
  }

  public getNotes(): AuditNote[] {
    return this.notes;
  }

  public setNotes(notes: AuditNote[]) {
    this.notes = notes;
    this.saveNotes();
    this.updateAllEditors();
    this._onDidNotesChange.fire();
  }

  public addNote(note: AuditNote) {
    this.notes.push(note);
    this.saveNotes();
    this.updateAllEditors();
    this._onDidNotesChange.fire();
  }

  public updateNote(updatedNote: AuditNote) {
    const index = this.notes.findIndex((n) => n.id === updatedNote.id);
    if (index !== -1) {
      this.notes[index] = updatedNote;
      this.saveNotes();
      this.updateAllEditors();
      // We don't necessarily fire onDidNotesChange here to avoid full sidebar refreshes 
      // if it's handled surgically by the provider.
    }
  }

  public deleteNote(noteId: string) {
    this.notes = this.notes.filter((n) => n.id !== noteId);
    this.saveNotes();
    this.updateAllEditors();
    this._onDidNotesChange.fire();
  }

  public setCollapsedState(key: string, isCollapsed: boolean) {
    if (this.collapsedStates[key] === isCollapsed) {
      return;
    }
    this.collapsedStates[key] = isCollapsed;
    this.saveNotes();
  }

  public getCollapsedStates(): { [key: string]: boolean } {
    return this.collapsedStates;
  }

  public setFileGroupingState(key: string, isGrouped: boolean) {
    if (this.fileGroupingStates[key] === isGrouped) {
      return;
    }
    this.fileGroupingStates[key] = isGrouped;
    this.saveNotes();
  }

  public getFileGroupingStates(): { [key: string]: boolean } {
    return this.fileGroupingStates;
  }

  public toggleVisibility() {
    this.isVisible = !this.isVisible;
    this.updateStatusBar();
    this.updateAllEditors();
  }

  private updateStatusBar() {
    this.statusBarItem.text = this.isVisible
      ? "$(eye) Audit Notes: Visible"
      : "$(eye-closed) Audit Notes: Hidden";
    this.statusBarItem.tooltip = "Click to toggle Audit Notes visibility";
  }

  public updateAllEditors() {
    vscode.window.visibleTextEditors.forEach((editor) =>
      this.updateDecorations(editor),
    );
  }

  private getVibrantColor(color: string): string {
    const auditColor = getAuditColorByBackground(color);
    if (auditColor) {
      return auditColor.vibrant;
    }

    if (color.startsWith("rgba")) {
      return color.replace(/[^,]+(?=\))/, "1.0");
    }

    return color;
  }

  public updateDecorations(editor: vscode.TextEditor) {
    this.decorationTypes.forEach((d) => editor.setDecorations(d, []));

    if (!this.isVisible) {
      return;
    }

    const filePath = vscode.workspace.asRelativePath(editor.document.uri);
    const editorNotes = this.notes.filter((n) => n.filePath === filePath);

    const notesByColor = new Map<string, AuditNote[]>();
    editorNotes.forEach((n) => {
      const colorNotes = notesByColor.get(n.color) || [];
      colorNotes.push(n);
      notesByColor.set(n.color, colorNotes);
    });

    notesByColor.forEach((colorNotes, color) => {
      let decorationType = this.decorationTypes.get(color);
      if (!decorationType) {
        const vibrantColor = this.getVibrantColor(color);

        decorationType = vscode.window.createTextEditorDecorationType({
          backgroundColor: color,
          borderWidth: "0 0 0 4px",
          borderStyle: "solid",
          borderColor: vibrantColor,
          isWholeLine: false,
          overviewRulerColor: vibrantColor,
          overviewRulerLane: vscode.OverviewRulerLane.Left,
        });
        this.decorationTypes.set(color, decorationType);
      }

      const decorationOptions: vscode.DecorationOptions[] = [];
      colorNotes.forEach((n) => {
        const startLine = n.range.startLine;
        const endLine = n.range.endLine;
        let firstContentLine = startLine;
        let lastContentLine = endLine;

        try {
          while (
            firstContentLine <= endLine &&
            editor.document.lineAt(firstContentLine).text.trim().length === 0
          ) {
            firstContentLine++;
          }

          while (
            lastContentLine >= startLine &&
            editor.document.lineAt(lastContentLine).text.trim().length === 0
          ) {
            lastContentLine--;
          }
        } catch (e) {
          // Line might not exist if file changed externally
        }

        for (let i = startLine; i <= endLine; i++) {
          try {
            const lineText = editor.document.lineAt(i).text;
            const isOutsideTrimmedRange =
              firstContentLine <= lastContentLine &&
              i < firstContentLine ||
              i > lastContentLine;

            if (isOutsideTrimmedRange) {
              continue;
            }

            decorationOptions.push({
              range: new vscode.Range(i, 0, i, lineText.length),
            });
          } catch (e) {
            // Line might not exist if file changed externally
          }
        }
      });

      editor.setDecorations(decorationType, decorationOptions);
    });
  }

  public findNoteAtCursor(editor: vscode.TextEditor): AuditNote | undefined {
    const cursor = editor.selection.active;
    const filePath = vscode.workspace.asRelativePath(editor.document.uri);

    return this.notes.find((n) => {
      if (n.filePath !== filePath) {
        return false;
      }
      const range = toVsCodeRange(n.range);
      return cursor.line >= range.start.line && cursor.line <= range.end.line;
    });
  }

  public dispose() {
    this.fileWatcher?.dispose();
    this.decorationTypes.forEach((d) => d.dispose());
    this.decorationTypes.clear();
    this.statusBarItem.dispose();
  }
}
