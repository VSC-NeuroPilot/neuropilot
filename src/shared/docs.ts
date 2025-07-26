import * as vscode from 'vscode';
import { logOutput } from '../utils';
import { CONFIG } from '../config';

// Shared docs management
export const docsOptions: Record<string, string> = {
    'NeuroPilot': CONFIG.docsURL,
    'NeuroPilot (Local Dev Default)': 'http://127.0.0.1:4321/neuropilot',
};
export let docsItems: string[] = Object.keys(docsOptions);

export function registerDocsLink(name: string, link: string) {
    docsOptions[name] = link;
    docsItems = Object.keys(docsOptions);
}

export function openDocsPage(docsSite: string, subpage = '/'): string {
    let constructedDocsPage: string = docsSite;
    if (subpage.startsWith('/')) {
        constructedDocsPage += subpage;
    } else {
        constructedDocsPage += '/' + subpage;
    }

    logOutput('DEBUG', `Constructed docs page is ${constructedDocsPage}`);

    const docsOrigin = new URL(docsSite).origin;

    const htmlpage =
        '<!DOCTYPE html>' +
        '<html lang="en">' +
        '<head>' +
        '   <meta charset="UTF-8">' +
        `   <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src ${docsOrigin}; script-src 'none'; style-src 'unsafe-inline';">` +
        '   <meta name="viewport" content="width=device-width, initial-scale=1.0">' +
        '   <title>NeuroPilot Docs WebView</title>' +
        '   <style>' +
        '       html, body, iframe {' +
        '           width: 100%;' +
        '           height: 100%;' +
        '           margin: 0;' +
        '           padding: 0;' +
        '           overflow: hidden;' +
        '       }' +
        '       iframe {' +
        '           display: block;' +
        '       }' +
        '   </style>' +
        '</head>' +
        '<body>' +
        `   <iframe src="${constructedDocsPage}" frameborder="0"></iframe>` +
        '</body>' +
        '</html>';

    return htmlpage;
}

export function openDocsPanel(selectedOption: string, baseUrl: string, subpage?: string): void {
    const panel = vscode.window.createWebviewPanel(
        'docsWebView',
        `${selectedOption} Docs (WebView)`,
        vscode.ViewColumn.Active,
        { enableScripts: true },
    );
    panel.webview.html = openDocsPage(baseUrl, subpage);
}

export async function openDocsOnTarget(selectedOption: string, baseUrl: string, subpage?: string) {
    if (CONFIG.defaultOpenDocsWindow === 'ask') {
        const windowPanel = vscode.window.createQuickPick();
        windowPanel.items = [
            {
                label: 'Default web browser',
            },
            {
                label: 'In-editor WebView',
            },
        ];
        windowPanel.placeholder = 'Where do you want to open this?';

        windowPanel.onDidAccept(async () => {
            const selectedTarget = windowPanel.selectedItems[0].label;
            if (selectedTarget === 'Default web browser') {
                vscode.env.openExternal(await vscode.env.asExternalUri(vscode.Uri.parse(baseUrl, true)));
            } else if (selectedTarget === 'In-editor WebView') {
                openDocsPanel(selectedOption, baseUrl, subpage);
            } else {
                logOutput('ERROR', 'Unknown target option supplied for opening docs.');
                return;
            };
            windowPanel.hide();
        });
        windowPanel.show();
    }
    else if (CONFIG.defaultOpenDocsWindow === 'alwaysBrowser') vscode.env.openExternal(await vscode.env.asExternalUri(vscode.Uri.parse(baseUrl, true)));
    else if (CONFIG.defaultOpenDocsWindow === 'alwaysWebView') openDocsPanel(selectedOption, baseUrl, subpage);
}

export function registerDocsCommands() {
    const showDocsCommand = vscode.commands.registerCommand('neuropilot.showDocsHomepage', async () => {
        const quickPick = vscode.window.createQuickPick();
        quickPick.items = docsItems.map(key => ({ label: key }));
        quickPick.placeholder = 'Select a documentation base URL';

        quickPick.onDidAccept(async () => {
            const selectedOption = quickPick.selectedItems[0]?.label;
            if (!selectedOption) {
                vscode.window.showErrorMessage('No documentation option selected.');
                quickPick.hide();
                return;
            }

            const baseUrl = docsOptions[selectedOption];
            logOutput('DEBUG', `Opening ${selectedOption}'s docs at URL ${baseUrl}`);

            await openDocsOnTarget(selectedOption, baseUrl);

            quickPick.hide();
        });

        quickPick.show();
    });

    const openSpecificDocsCommand = vscode.commands.registerCommand('neuropilot.openSpecificDocsPage', async (args?: { subpage?: string }) => {
        const quickPick = vscode.window.createQuickPick();
        quickPick.items = docsItems.map(key => ({ label: key }));
        quickPick.placeholder = 'Select a documentation base URL';

        quickPick.onDidAccept(async () => {
            const selectedOption = quickPick.selectedItems[0].label;
            if (!selectedOption) {
                vscode.window.showErrorMessage('No documentation option selected.');
                quickPick.hide();
                return;
            }

            const baseUrl = docsOptions[selectedOption];

            let subpage: string | undefined;
            if (args && typeof args.subpage === 'string') {
                subpage = args.subpage;
            } else {
                subpage = await vscode.window.showInputBox({
                    prompt: 'Enter the docs subpath (e.g., /guide, /api, etc.)',
                    placeHolder: '/',
                });
            }

            if (!subpage) {
                vscode.window.showErrorMessage('No subpage specified.');
                quickPick.hide();
                return;
            }

            logOutput('DEBUG', `Opening ${selectedOption}'s docs at URL ${baseUrl}${subpage}`);

            await openDocsOnTarget(selectedOption, baseUrl, subpage);

            quickPick.hide();
        });

        quickPick.show();
    });

    return [showDocsCommand, openSpecificDocsCommand];
}
