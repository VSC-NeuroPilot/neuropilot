import type * as vscode from 'vscode';

import { ConfigValue, Diff, DiffPlus, DiffRange, NeuroPilotAPI, NeuroPilotConfig } from '@vsc-neuropilot/api-types';

import { actionHandlerFailure, actionHandlerRetry, actionHandlerSuccess, actionValidationAccept, actionValidationFailure, actionValidationRetry } from '@/utils/neuro_client';
import { Companion } from './companions';
import { getAction, getActions } from '@/rce';
import { findByToken } from '@/plugins';
import { formatContext, getDiffRanges, getPositionContext, isPathNeuroSafe, showDiffRanges } from '@/utils/misc';
import { patienceDiff, patienceDiffPlus } from '@/patience_diff';
import { CONFIG, CONNECTION } from '@/config';

class Config implements NeuroPilotConfig {
    get beforeContext(): ConfigValue<number>
    { return {settingID: 'beforeContext', value: CONFIG.beforeContext}; }

    get afterContext(): ConfigValue<number>
    { return {settingID: 'afterContext', value: CONFIG.afterContext}; }

    get cursorFollowsNeuro(): ConfigValue<boolean>
    { return {settingID: 'cursorFollowsNeuro', value: CONFIG.cursorFollowsNeuro}; }

    get sendContentsOnFileChange(): ConfigValue<boolean>
    { return {settingID: 'sendContentsOnFileChange', value: CONFIG.sendContentsOnFileChange}; }

    get cursorPositionContextStyle(): ConfigValue<'off' | 'inline' | 'lineAndColumn' | 'both'>
    { return {settingID: 'cursorPositionContextStyle', value: CONFIG.cursorPositionContextStyle}; }

    get lineNumberContextFormat(): ConfigValue<string>
    { return {settingID: 'lineNumberContextFormat', value: CONFIG.lineNumberContextFormat}; }

    get websocketUrl(): ConfigValue<string>
    { return {settingID: 'connection.websocketUrl', value: CONNECTION.websocketUrl}; }

    get gameName(): ConfigValue<string>
    { return {settingID: 'connection.gameName', value: CONNECTION.gameName}; }

    get userName(): ConfigValue<string>
    { return {settingID: 'connection.userName', value: CONNECTION.userName}; }

    get nameOfAPI(): ConfigValue<string>
    { return {settingID: 'connection.nameOfAPI', value: CONNECTION.nameOfAPI}; }
}

export const api: NeuroPilotAPI = {
    Companion,
    utils: {
        actionValidation: {
            success: actionValidationAccept,
            failure: actionValidationFailure,
            retry: actionValidationRetry,
        },
        actionHandler: {
            success: actionHandlerSuccess,
            failure: actionHandlerFailure,
            retry: actionHandlerRetry,
        },
        actionsListing: {
            getActions(action?: string | string[]) {
                if (typeof action === 'string') {
                    const foundAction = getAction(action);
                    if (!foundAction) return foundAction;
                    const actionReturn = {...foundAction, source: findByToken(foundAction.sourceToken)?.name };
                    delete actionReturn?.sourceToken;
                    return actionReturn;
                } else {
                    const actions = getActions(action);
                    return actions.map((a) => {
                        const newObject = {...a, source: findByToken(a.sourceToken)?.name };
                        delete newObject.sourceToken;
                        return newObject;
                    });
                };
            },
        },
        context: {
            getPositionContext,
            formatContext,
        },
        diffs: {
            calculateDiff(oldLines: string[], newLines: string[]) {
                const diff = patienceDiff(oldLines, newLines);
                return {
                    lines: diff.lines.map(line => ({
                        text: line.line,
                        oldIndex: line.aIndex,
                        newIndex: line.bIndex,
                    })),
                    lineCountDeleted: diff.lineCountDeleted,
                    lineCountInserted: diff.lineCountInserted,
                } satisfies Diff;
            },
            calculateDiffPlus(oldLines: string[], newLines: string[]) {
                const diff = patienceDiffPlus(oldLines, newLines);
                return {
                    lines: diff.lines.map(line => ({
                        text: line.line,
                        oldIndex: line.aIndex,
                        newIndex: line.bIndex,
                        moved: line.moved ?? false,
                    })),
                    lineCountDeleted: diff.lineCountDeleted,
                    lineCountInserted: diff.lineCountInserted,
                    lineCountMoved: diff.lineCountMoved,
                } satisfies DiffPlus;
            },
            calculateDiffRanges: getDiffRanges,
            applyDiffHighlighting(editor: vscode.TextEditor, diffRanges: DiffRange[]) {
                showDiffRanges(editor, ...diffRanges);
            },
        },
        filePaths: {
            isPathNeuroSafe,
        },
    },
    config: new Config(),
};
