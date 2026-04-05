import * as vscode from 'vscode';

export function createPreviewCursor() {
    const cursorDecoration = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(0, 0, 0, 0)',
        border: '1px solid rgb(0, 225, 255)',
        borderRadius: '1px',
        overviewRulerColor: 'rgb(0, 102, 255)',
        overviewRulerLane: vscode.OverviewRulerLane.Right,
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
        before: {
            contentText: 'ᛙ',
            margin: '0 0 0 -0.25ch',
            textDecoration: 'none; position: absolute; display: inline-block; top: 0; font-size: 200%; font-weight: bold; z-index: 1',
            color: 'rgb(0, 102, 255)',
        },
    });
    return cursorDecoration;
}

export function createPreviewHighlight(bgColor = 'rgba(0, 47, 255, 0.42)', rulerColor = 'rgb(0, 102, 255)') {
    const highlightDecoration = vscode.window.createTextEditorDecorationType({
        backgroundColor: bgColor,
        border: '1px solid rgb(0, 225, 255)',
        borderRadius: '0px',
        overviewRulerColor: rulerColor,
        overviewRulerLane: vscode.OverviewRulerLane.Left,
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });
    return highlightDecoration;
}
