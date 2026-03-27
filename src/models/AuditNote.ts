import * as vscode from 'vscode';

export interface AuditNoteRange {
    startLine: number;
    startChar: number;
    endLine: number;
    endChar: number;
}

export interface AuditNote {
    id: string;
    filePath: string;
    range: AuditNoteRange;
    text: string;
    color: string;
}

export interface AuditNotesData {
    version: string;
    notes: AuditNote[];
}

export function toVsCodeRange(range: AuditNoteRange): vscode.Range {
    return new vscode.Range(range.startLine, range.startChar, range.endLine, range.endChar);
}
