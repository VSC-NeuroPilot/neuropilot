import * as vscode from 'vscode';

export interface DeprecatedSetting {
    old: string;
    new: string | ((target: vscode.ConfigurationTarget) => Promise<void>);
}
