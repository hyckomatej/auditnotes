import * as vscode from 'vscode';
import { NoteManager } from './services/NoteManager';
import * as commands from './commands';
import { toVsCodeRange } from './models/AuditNote';
import { NoteSidebarProvider } from './providers/NoteSidebarProvider';

export function activate(context: vscode.ExtensionContext) {
    const noteManager = NoteManager.getInstance();
    const sidebarProvider = new NoteSidebarProvider(context.extensionUri);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            NoteSidebarProvider.viewType,
            sidebarProvider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true
                }
            }
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('auditnotes.addNote', () => commands.addNote(sidebarProvider)),
        vscode.commands.registerCommand('auditnotes.editNote', () => commands.editNote(sidebarProvider)),
        vscode.commands.registerCommand('auditnotes.deleteNote', () => commands.deleteNote(sidebarProvider)),
        vscode.commands.registerCommand('auditnotes.toggleVisibility', commands.toggleVisibility)
    );

    // Register Hover Provider
    context.subscriptions.push(
        vscode.languages.registerHoverProvider({ scheme: 'file' }, {
            provideHover(document, position) {
                const filePath = vscode.workspace.asRelativePath(document.uri);
                const notes = noteManager.getNotes().filter(n => n.filePath === filePath);
                
                const noteAtPosition = notes.find(n => toVsCodeRange(n.range).contains(position));
                
                if (noteAtPosition && noteAtPosition.text && noteAtPosition.text.trim().length > 0) {
                    const contents = new vscode.MarkdownString();
                    contents.appendMarkdown(`**Audit Note:**\n\n${noteAtPosition.text}`);
                    contents.isTrusted = true;
                    return new vscode.Hover(contents, toVsCodeRange(noteAtPosition.range));
                }
                return null;
            }
        })
    );

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) {
                noteManager.updateDecorations(editor);
            }
        }),
        vscode.window.onDidChangeTextEditorSelection(event => {
            const editor = event.textEditor;
            const note = noteManager.findNoteAtCursor(editor);
            if (note) {
                sidebarProvider.update(note, undefined, false);
            } else {
                sidebarProvider.clear();
            }
        }),
        vscode.workspace.onDidChangeTextDocument(event => {
            const editor = vscode.window.activeTextEditor;
            if (editor && event.document === editor.document) {
                noteManager.updateDecorations(editor);
            }
        }),
        noteManager.onDidNotesChange(() => {
            sidebarProvider.syncWithNotes();
        }),
        { dispose: () => noteManager.dispose() }
    );

    // Initial update for visible editors
    noteManager.updateAllEditors();
}

export function deactivate() {}
