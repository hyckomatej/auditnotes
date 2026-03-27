import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AuditNote, AuditNotesData, toVsCodeRange } from '../models/AuditNote';
import { getAuditColorByBackground } from '../constants/colors';

export class NoteManager {
    private static instance: NoteManager;
    private notes: AuditNote[] = [];
    private isVisible = true;
    private decorationTypes: Map<string, vscode.TextEditorDecorationType> = new Map();
    private readonly STORAGE_FILE = '.audit-notes.json';
    private statusBarItem: vscode.StatusBarItem;

    private constructor() {
        this.loadNotes();
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.statusBarItem.command = 'auditnotes.toggleVisibility';
        this.updateStatusBar();
        this.statusBarItem.show();
    }

    public static getInstance(): NoteManager {
        if (!NoteManager.instance) {
            NoteManager.instance = new NoteManager();
        }
        return NoteManager.instance;
    }

    private getStoragePath(): string | undefined {
        const folders = vscode.workspace.workspaceFolders;
        if (folders && folders.length > 0) {
            return path.join(folders[0].uri.fsPath, this.STORAGE_FILE);
        }
        return undefined;
    }

    private loadNotes() {
        const filePath = this.getStoragePath();
        if (filePath && fs.existsSync(filePath)) {
            try {
                const content = fs.readFileSync(filePath, 'utf8');
                const data: AuditNotesData = JSON.parse(content);
                this.notes = data.notes || [];
            } catch (e) {
                console.error('Failed to load audit notes:', e);
                this.notes = [];
            }
        } else {
            this.notes = [];
        }
    }

    public saveNotes() {
        const filePath = this.getStoragePath();
        if (filePath) {
            const data: AuditNotesData = {
                version: '1.0',
                notes: this.notes
            };
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        }
    }

    public getNotes(): AuditNote[] {
        return this.notes;
    }

    public setNotes(notes: AuditNote[]) {
        this.notes = notes;
        this.saveNotes();
        this.updateAllEditors();
    }

    public addNote(note: AuditNote) {
        this.notes.push(note);
        this.saveNotes();
        this.updateAllEditors();
    }

    public updateNote(updatedNote: AuditNote) {
        const index = this.notes.findIndex(n => n.id === updatedNote.id);
        if (index !== -1) {
            this.notes[index] = updatedNote;
            this.saveNotes();
            this.updateAllEditors();
        }
    }

    public deleteNote(noteId: string) {
        this.notes = this.notes.filter(n => n.id !== noteId);
        this.saveNotes();
        this.updateAllEditors();
    }

    public toggleVisibility() {
        this.isVisible = !this.isVisible;
        this.updateStatusBar();
        this.updateAllEditors();
    }

    private updateStatusBar() {
        this.statusBarItem.text = this.isVisible ? '$(eye) Audit Notes: Visible' : '$(eye-closed) Audit Notes: Hidden';
        this.statusBarItem.tooltip = 'Click to toggle Audit Notes visibility';
    }

    public updateAllEditors() {
        vscode.window.visibleTextEditors.forEach(editor => this.updateDecorations(editor));
    }

    private getVibrantColor(color: string): string {
        const auditColor = getAuditColorByBackground(color);
        if (auditColor) {
            return auditColor.vibrant;
        }

        if (color.startsWith('rgba')) {
            return color.replace(/[^,]+(?=\))/, '1.0');
        }
        
        return color;
    }

    public updateDecorations(editor: vscode.TextEditor) {
        this.decorationTypes.forEach(d => editor.setDecorations(d, []));

        if (!this.isVisible) {
            return;
        }

        const filePath = vscode.workspace.asRelativePath(editor.document.uri);
        const editorNotes = this.notes.filter(n => n.filePath === filePath);

        const notesByColor = new Map<string, AuditNote[]>();
        editorNotes.forEach(n => {
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
                    borderWidth: '0 0 0 4px',
                    borderStyle: 'solid',
                    borderColor: vibrantColor,
                    isWholeLine: false,
                    overviewRulerColor: vibrantColor,
                    overviewRulerLane: vscode.OverviewRulerLane.Left,
                });
                this.decorationTypes.set(color, decorationType);
            }

            const decorationOptions: vscode.DecorationOptions[] = [];
            colorNotes.forEach(n => {
                const startLine = n.range.startLine;
                const endLine = n.range.endLine;

                for (let i = startLine; i <= endLine; i++) {
                    const lineText = editor.document.lineAt(i).text;
                    const isEmpty = lineText.trim().length === 0;
                    
                    let skip = false;
                    if (isEmpty) {
                        let hasTextAbove = false;
                        for (let j = startLine; j < i; j++) {
                            if (editor.document.lineAt(j).text.trim().length > 0) {
                                hasTextAbove = true;
                                break;
                            }
                        }
                        let hasTextBelow = false;
                        for (let j = i + 1; j <= endLine; j++) {
                            if (editor.document.lineAt(j).text.trim().length > 0) {
                                hasTextBelow = true;
                                break;
                            }
                        }
                        if (!hasTextAbove || !hasTextBelow) {
                            skip = true;
                        }
                    }

                    if (!skip) {
                        // Decoration covers from start of line to end of text
                        decorationOptions.push({
                            range: new vscode.Range(i, 0, i, lineText.length)
                        });
                    }
                }
            });

            editor.setDecorations(decorationType, decorationOptions);
        });
    }

    public findNoteAtCursor(editor: vscode.TextEditor): AuditNote | undefined {
        const cursor = editor.selection.active;
        const filePath = vscode.workspace.asRelativePath(editor.document.uri);

        return this.notes.find(n => {
            if (n.filePath !== filePath) {
                return false;
            }
            const range = toVsCodeRange(n.range);
            return cursor.line >= range.start.line && cursor.line <= range.end.line;
        });
    }

    public dispose() {
        this.decorationTypes.forEach(d => d.dispose());
        this.decorationTypes.clear();
        this.statusBarItem.dispose();
    }
}
