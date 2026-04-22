import type * as vscode from 'vscode';

import { Diff, DiffPlus, DiffRange, NeuroPilotAPI } from '@vsc-neuropilot/api-types';

import { actionHandlerFailure, actionHandlerRetry, actionHandlerSuccess, actionValidationAccept, actionValidationFailure, actionValidationRetry } from '@/utils/neuro_client';
import { RCECancelEvent } from '@events/utils';
import { Companion } from './companions';
import { getAction, getActions } from '@/rce';
import { findByToken } from '@/plugins';
import { getDiffRanges, getWorkspacePath, getWorkspaceUri, isPathNeuroSafe, normalizePath, showDiffRanges, simpleFileName } from '@/utils/misc';
import { patienceDiff, patienceDiffPlus } from '@/patience_diff';

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
            simpleFileName,
            normalizePath,
            isPathNeuroSafe,
        },
        workspace: {
            getWorkspaceUri,
            getWorkspacePath,
        },
        CancelEvent: RCECancelEvent,
    },
};
