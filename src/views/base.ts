import * as vscode from 'vscode';
import { NEURO } from '../constants';
import { formatString } from '../utils';

export interface Message {
    type: string;
}

export abstract class BaseWebviewViewProvider<TViewMessage extends Message, TProviderMessage extends Message> implements vscode.WebviewViewProvider {
    protected _view?: vscode.WebviewView;

    constructor(private _htmlFile: string, private _script: string, private _styles: string[]) { }

    async resolveWebviewView(webviewView: vscode.WebviewView, _context: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken): Promise<void> {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [NEURO.context!.extensionUri],
        };

        webviewView.webview.html = await this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage((data: TViewMessage) => {
            this.handleMessage(data);
        });
    }

    protected abstract handleMessage(message: TViewMessage): void;

    protected async _getHtmlForWebview(webview: vscode.Webview, format?: Record<string, unknown>): Promise<string> {
        const codiconsStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(NEURO.context!.extensionUri, 'media', 'codicons', 'codicon.css'));
        const vscodeStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(NEURO.context!.extensionUri, 'webview', 'vscode.css'));

        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(NEURO.context!.extensionUri, 'out', 'webview', this._script));
        const styleUris = this._styles.map(style => webview.asWebviewUri(vscode.Uri.joinPath(NEURO.context!.extensionUri, 'webview', style)));
        const styles = [codiconsStyleUri, vscodeStyleUri, ...styleUris]
            .map(styleUri => `<link href="${styleUri}" rel="stylesheet">`)
            .join('\n');
        const nonce = getNonce();

        // Load HTML file
        const html = new TextDecoder('utf-8').decode(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(NEURO.context!.extensionUri, 'webview', this._htmlFile)));
        const fmt = { scriptUri, styles, nonce, webview };
        if (format) Object.assign(fmt, format);
        const renderedHtml = formatString(html, fmt);

        return renderedHtml;
    }

    protected postMessage(message: TProviderMessage) {
        this._view?.webview.postMessage(message);
    }
}

function getNonce() {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 32; i++) {
        result += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    }
    return result;
}
