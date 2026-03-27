import * as vscode from 'vscode';
import { NoteManager } from '../services/NoteManager';
import { NoteSidebarProvider } from '../providers/NoteSidebarProvider';
import { AuditNote } from '../models/AuditNote';

export async function addNote(sidebarProvider: NoteSidebarProvider) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {return;}

    const selection = editor.selection;
    if (selection.isEmpty) {
        vscode.window.showWarningMessage('Please select some code to add a note.');
        return;
    }

    // Smart Trim: find first and last non-empty lines in selection
    let startLine = selection.start.line;
    let endLine = selection.end.line;

    while (startLine <= endLine && editor.document.lineAt(startLine).text.trim().length === 0) {
        startLine++;
    }
    while (endLine >= startLine && editor.document.lineAt(endLine).text.trim().length === 0) {
        endLine--;
    }

    if (startLine > endLine) {
        // Selection is only whitespace, but let's keep it if they really want it
        startLine = selection.start.line;
        endLine = selection.end.line;
    }

    const config = vscode.workspace.getConfiguration('auditnotes');
    const defaultColor = config.get<string>('defaultColor') || 'rgba(255, 255, 255, 0.2)';

    const newNote: AuditNote = {
        id: Math.random().toString(36).substr(2, 9),
        filePath: vscode.workspace.asRelativePath(editor.document.uri),
        range: {
            startLine: startLine,
            startChar: 0,
            endLine: endLine,
            endChar: editor.document.lineAt(endLine).text.length
        },
        text: '',
        color: defaultColor
    };

    NoteManager.getInstance().addNote(newNote);
    sidebarProvider.update(newNote);
    sidebarProvider.refreshNoteList();
}

export async function editNote(sidebarProvider: NoteSidebarProvider) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {return;}

    const noteManager = NoteManager.getInstance();
    const note = noteManager.findNoteAtCursor(editor);
    if (!note) {
        vscode.window.showInformationMessage('No audit note found at cursor.');
        return;
    }

    sidebarProvider.update(note);
}

export async function deleteNote(sidebarProvider: NoteSidebarProvider) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {return;}

    const noteManager = NoteManager.getInstance();
    const note = noteManager.findNoteAtCursor(editor);
    if (!note) {
        vscode.window.showInformationMessage('No audit note found at cursor.');
        return;
    }

    noteManager.deleteNote(note.id);
    sidebarProvider.clear();
    sidebarProvider.refreshNoteList();
}

export function toggleVisibility() {
    NoteManager.getInstance().toggleVisibility();
}
