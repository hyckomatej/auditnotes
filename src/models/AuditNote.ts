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
    categories?: string[];
}

export interface AuditNotesData {
    version: string;
    notes: AuditNote[];
    uiState?: {
        collapsedStates?: { [key: string]: boolean };
        fileGroupingStates?: { [key: string]: boolean };
    };
}

export function toVsCodeRange(range: AuditNoteRange): vscode.Range {
    return new vscode.Range(range.startLine, range.startChar, range.endLine, range.endChar);
}
