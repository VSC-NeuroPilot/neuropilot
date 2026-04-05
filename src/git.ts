import * as vscode from 'vscode';
import { EXTENSIONS, NEURO, PROMISE_REJECTION_STRING } from '@/constants';
import type { Change, CommitOptions, Commit, Repository, API, GitExtension } from '@typing/git.d';
import { ForcePushMode } from '@typing/git.d';
import { StatusStrings, RefTypeStrings } from '@typing/git_status';
import { logOutput, simpleFileName, isPathNeuroSafe, normalizePath, getWorkspacePath, getWorkspaceUri } from '@/utils/misc';
import { ActionValidationResult, actionValidationAccept, actionValidationFailure, RCEAction, actionValidationRetry, RCEHandlerReturns, actionHandlerSuccess, actionHandlerFailure, actionHandlerRetry } from '@/utils/neuro_client';
import assert from 'node:assert';
import { RCECancelEvent } from '@events/utils';
import { JSONSchema7Definition } from 'json-schema';
import { addActions, registerAction, reregisterAllActions, unregisterAction } from './rce';
import { RCEContext } from '@ctx/rce';
import { filePreviewProvider } from '@previews/files';

export const CATEGORY_GIT = 'Git';
export const CATEGORY_GIT_REMOTES = 'Git Remotes';
export const CATEGORY_GIT_CONFIG = 'Git Config';

// Get the Git extension
let git: API | null = null;
let repo: Repository | null = null;

export function getGitExtension() {
    NEURO.client?.unregisterActions(Object.keys(gitActions));
    if (EXTENSIONS.git) {
        git = EXTENSIONS.git.getAPI(1);
        logOutput('DEBUG', 'Git extension obtained.');
        repo = git.repositories[0];
        logOutput('DEBUG', 'Git repo obtained (if any).');
        addGitActions();
    } else {
        git = null;
        repo = null;
    }
}

function gitValidator(): ActionValidationResult {
    if (!git)
        return actionValidationFailure('Git extension not available.', 'Git extension not activated');
    if (!repo)
        return actionValidationFailure('You are not in a repository.', 'Not in a repo');

    return actionValidationAccept();
}

async function neuroSafeValidationHelper(filePath: string): Promise<ActionValidationResult> {
    const absolutePath = getAbsoluteFilePath(filePath);
    if (!isPathNeuroSafe(absolutePath)) {
        return actionValidationFailure('You are not allowed to access this file path.', 'Access to targeted file disallowed');
    }

    const fileUri = vscode.Uri.file(absolutePath);
    try {
        await vscode.workspace.fs.stat(fileUri);
        return actionValidationAccept();
    } catch {
        return actionValidationFailure(`File ${filePath} does not exist.`, 'Targeted file does not exist');
    }
}

async function filePathGitValidator(context: RCEContext): Promise<ActionValidationResult> {
    const actionData = context.data;
    if (actionData.params.filePath === '') {
        return actionValidationRetry('No file path specified.');
    };

    const filePath: string | string[] = actionData.params?.filePath;
    if (typeof filePath === 'string') {
        const result = await neuroSafeValidationHelper(filePath);
        if (!result.success) return result;
    }
    else if (Array.isArray(filePath)) {
        for (const file of filePath) {
            const result = await neuroSafeValidationHelper(file);
            if (!result.success) return result;
        }
    }

    return actionValidationAccept();
}

function gitDiffValidator(context: RCEContext): ActionValidationResult {
    const actionData = context.data;
    const diffType: string = actionData.params?.diffType ?? 'diffWithHEAD';
    const FAIL_NOTE = `Inputs did not match what was necessary to make a ${diffType}-type diff`;
    switch (diffType) {
        case 'diffWithHEAD':
            if (actionData.params?.ref1 || actionData.params?.ref2) {
                return actionValidationAccept('Neither "ref1" nor "ref2" is needed.');
            }
            return actionValidationAccept();
        case 'diffWith':
            if (actionData.params?.ref1 && actionData.params?.ref2) {
                return actionValidationAccept('Only "ref1" is needed for the "diffWith" diff type.');
            } else if (!actionData.params?.ref1) {
                return actionValidationRetry('"ref1" is required for the diff type of "diffWith"', FAIL_NOTE);
            } else {
                return actionValidationAccept();
            }
        case 'diffIndexWithHEAD':
            if (actionData.params?.ref1 || actionData.params?.ref2) {
                return actionValidationAccept('Neither "ref1" nor "ref2" is needed.');
            }
            return actionValidationAccept();
        case 'diffIndexWith':
            if (actionData.params?.ref1 && actionData.params?.ref2) {
                return actionValidationAccept('Only "ref1" is needed for the "diffIndexWith" diff type.');
            } else if (!actionData.params?.ref1) {
                return actionValidationRetry('"ref1" is required for the diff type of "diffIndexWith"', FAIL_NOTE);
            } else {
                return actionValidationAccept();
            }
        case 'diffBetween':
            if (!actionData.params?.ref1 || !actionData.params?.ref2) {
                return actionValidationRetry('"ref1" AND "ref2" is required for the diff type of "diffWith"', FAIL_NOTE);
            } else {
                return actionValidationAccept();
            }
        case 'fullDiff':
            if (actionData.params?.ref1 || actionData.params?.ref2) {
                return actionValidationAccept('Neither "ref1" nor "ref2" is needed.');
            }
            return actionValidationAccept();
        default:
            return actionValidationFailure('Unknown diff type.', 'Unknown/unhandled diff type specified');
    }
}
const commonCancelEvents: ((context: RCEContext) => RCECancelEvent | null)[] = [
    () => new RCECancelEvent({
        reason: 'the Git extension was disabled.',
        events: [
            [vscode.extensions.getExtension<GitExtension>('vscode.git')!.exports.onDidChangeEnablement, null],
        ],
    }),
];

export const gitActions = {
    init_git_repo: {
        name: 'init_git_repo',
        description: 'Initialize a new Git repository in the current workspace folder',
        category: CATEGORY_GIT,
        handler: handleNewGitRepo,
        preview: () => {
            const ws = getWorkspaceUri()!;
            return filePreviewProvider.mark([ws], 'initialize a Git repository');
        },
        promptGenerator: 'initialize a Git repository in the workspace.',
        cancelEvents: commonCancelEvents,
        validators: {
            sync: [
                () => {
                    if (!git) return actionValidationFailure('Git extension not available.', 'Git extension not activated');
                    return actionValidationAccept();
                }, () => {
                    if (getWorkspaceUri()) {
                        return actionValidationAccept();
                    } else {
                        return actionValidationFailure('No open workspace to get files from.', 'Workspace undefined.');
                    }
                },
            ],
        },
        registerCondition: () => !!git,
    },
    add_file_to_git: {
        name: 'add_file_to_git',
        description: 'Add a file to the staging area',
        category: CATEGORY_GIT,
        schema: {
            type: 'object',
            properties: {
                filePath: {
                    type: 'array',
                    description: 'Array of relative file paths to the files you want to add to staging.',
                    items: { type: 'string', examples: ['src/index.js', './README.md'] },
                    minItems: 1,
                    uniqueItems: true,
                },
            },
            required: ['filePath'],
            additionalProperties: false,
        },
        handler: handleAddFileToGit,
        preview: (ctx: RCEContext) => {
            const ws = getWorkspaceUri();
            if (!ws) return { dispose: () => { } };
            const filePaths: string[] = ctx.data.params!.filePath;
            const fileUris: vscode.Uri[] = filePaths.map((p) => {
                return vscode.Uri.joinPath(ws, p);
            });
            return filePreviewProvider.mark(fileUris, 'add this file to the Git staging area');
        },
        cancelEvents: commonCancelEvents,
        promptGenerator: (context: RCEContext) => `add the file "${context.data.params.filePath}" to the staging area.`,
        validators: {
            sync: [gitValidator, filePathGitValidator],
        },
        registerCondition: () => !!repo,
    },
    make_git_commit: {
        name: 'make_git_commit',
        description: 'Commit staged changes with a message',
        category: CATEGORY_GIT,
        schema: {
            type: 'object',
            properties: {
                message: { type: 'string', description: 'The commit message to add.' },
                options: {
                    type: 'array',
                    description: 'Extra options you can choose for committing.',
                    items: { type: 'string', enum: ['signoff', 'verbose', 'amend'] },
                    uniqueItems: true,
                },
            },
            required: ['message'],
            additionalProperties: false,
        },
        handler: handleMakeGitCommit,
        cancelEvents: commonCancelEvents,
        promptGenerator: (context: RCEContext) => `commit changes with the message "${context.data.params.message}".`,
        validators: {
            sync: [gitValidator],
        },
        registerCondition: () => !!repo,
    },
    merge_to_current_branch: {
        name: 'merge_to_current_branch',
        description: 'Merge another branch into the current branch.',
        category: CATEGORY_GIT,
        schema: {
            type: 'object',
            properties: {
                ref_to_merge: { type: 'string', description: 'The branch name to merge into the current branch.' },
            },
            required: ['ref_to_merge'],
            additionalProperties: false,
        },
        handler: handleGitMerge,
        cancelEvents: commonCancelEvents,
        promptGenerator: (context: RCEContext) => `merge "${context.data.params.ref_to_merge}" into the current branch.`,
        validators: {
            sync: [gitValidator],
        },
        registerCondition: () => !!repo,
    },
    git_status: {
        name: 'git_status',
        description: 'Get the current status of the Git repository',
        category: CATEGORY_GIT,
        handler: handleGitStatus,
        cancelEvents: commonCancelEvents,
        promptGenerator: 'get the repository\'s Git status.',
        validators: {
            sync: [gitValidator],
        },
        registerCondition: () => !!repo,
    },
    remove_file_from_git: {
        name: 'remove_file_from_git',
        description: 'Remove a file from the staging area',
        category: CATEGORY_GIT,
        schema: {
            type: 'object',
            properties: {
                filePath: {
                    type: 'array',
                    description: 'Array of relative file paths to remove from staging.',
                    items: { type: 'string', examples: ['src/index.js', './README.md'] },
                    minItems: 1,
                    uniqueItems: true,
                },
            },
            required: ['filePath'],
            additionalProperties: false,
        },
        handler: handleRemoveFileFromGit,
        preview: (ctx: RCEContext) => {
            const ws = getWorkspaceUri();
            if (!ws) return { dispose: () => { } };
            const filePaths: string[] = ctx.data.params!.filePath;
            const fileUris: vscode.Uri[] = filePaths.map((p) => {
                return vscode.Uri.joinPath(ws, p);
            });
            return filePreviewProvider.mark(fileUris, 'remove this file from the Git staging area');
        },
        cancelEvents: commonCancelEvents,
        promptGenerator: (context: RCEContext) => `remove the file "${context.data.params.filePath}" from the staging area.`,
        validators: {
            sync: [gitValidator, filePathGitValidator],
        },
        registerCondition: () => !!repo,
    },
    delete_git_branch: {
        name: 'delete_git_branch',
        description: 'Delete a branch in the current Git repository',
        category: CATEGORY_GIT,
        schema: {
            type: 'object',
            properties: {
                branchName: { type: 'string', description: 'Which branch in the Git repository should be deleted?' },
                force: { type: 'boolean', description: 'If true, forcibly deletes a branch.' },
            },
            required: ['branchName'],
            additionalProperties: false,
        },
        handler: handleDeleteGitBranch,
        cancelEvents: commonCancelEvents,
        promptGenerator: (context: RCEContext) => `delete the branch "${context.data.params.branchName}".`,
        validators: {
            sync: [gitValidator],
        },
        registerCondition: () => !!repo,
    },
    switch_git_branch: {
        name: 'switch_git_branch',
        description: 'Switch to a different branch in the current Git repository',
        category: CATEGORY_GIT,
        schema: {
            type: 'object',
            properties: {
                branchName: { type: 'string', description: 'The name of the branch to switch to.' },
            },
            required: ['branchName'],
            additionalProperties: false,
        },
        handler: handleSwitchGitBranch,
        cancelEvents: commonCancelEvents,
        promptGenerator: (context: RCEContext) => `switch to the branch "${context.data.params.branchName}".`,
        validators: {
            sync: [gitValidator],
        },
        registerCondition: () => !!repo,
    },
    new_git_branch: {
        name: 'new_git_branch',
        description: 'Create a new branch in the current Git repository',
        category: CATEGORY_GIT,
        schema: {
            type: 'object',
            properties: {
                branchName: { type: 'string', description: 'The name of the new branch.' },
            },
            required: ['branchName'],
            additionalProperties: false,
        },
        handler: handleNewGitBranch,
        cancelEvents: commonCancelEvents,
        promptGenerator: (context: RCEContext) => `create a new branch "${context.data.params.branchName}".`,
        validators: {
            sync: [gitValidator],
        },
        registerCondition: () => !!repo,
    },
    diff_files: {
        name: 'diff_files',
        description: 'Get the differences between two versions of a file in the Git repository',
        category: CATEGORY_GIT,
        schema: {
            type: 'object',
            oneOf: [
                {
                    properties: {
                        filePath: { type: 'string', description: 'A file to run diffs against. If omitted, will diff the entire ref.' },
                        diffType: { type: 'string', enum: ['diffWithHEAD', 'diffIndexWithHEAD', 'fullDiff'], description: 'The type of diff to run.' },
                    },
                    required: ['diffType'],
                    additionalProperties: false,
                },
                {
                    properties: {
                        ref1: { type: 'string', description: 'The ref to diff with.' },
                        filePath: { type: 'string', description: 'A file to run diffs against. If omitted, will diff the entire ref.' },
                        diffType: { type: 'string', enum: ['diffWith', 'diffIndexWith'], description: 'The type of diff to run.' },
                    },
                    required: ['ref1', 'diffType'],
                    additionalProperties: false,
                },
                {
                    properties: {
                        ref1: { type: 'string', description: 'The ref to diff with.' },
                        ref2: { type: 'string', description: 'The ref to diff ref1 against.' },
                        filePath: { type: 'string', description: 'A file to run diffs against. If omitted, will diff the entire ref.' },
                        diffType: { type: 'string', const: 'diffBetween', description: 'The type of diff to run.' },
                    },
                    required: ['ref1', 'ref2', 'diffType'],
                    additionalProperties: false,
                },
            ] as JSONSchema7Definition[],
        },
        // TODO: This fallback contains descriptions, which is not officially supported.
        //       I don't think it will be used in the next dev stream, so I'll leave it for now.
        //       Remove this comment once it is confirmed that descriptions are stable, or remove the descriptions if they are not.
        schemaFallback: {
            type: 'object',
            properties: {
                ref1: { type: 'string', description: 'The first ref to use to diff with. May not be used in some diff types.' },
                ref2: { type: 'string', description: 'The second ref to diff against the first ref. Will not be used in some diff types.' },
                filePath: { type: 'string', description: 'For certain diff types, you can specify a file to diff. If omitted, will usually diff the entire ref.' },
                diffType: { type: 'string', enum: ['diffWithHEAD', 'diffWith', 'diffIndexWithHEAD', 'diffIndexWith', 'diffBetween', 'fullDiff'], description: 'The type of diff to run. This will also affect what parameters are required.' },
            },
            additionalProperties: false,
        },
        handler: handleDiffFiles,
        preview: (ctx: RCEContext) => {
            const ws = getWorkspaceUri();
            if (!ws) return { dispose: () => { } };
            const filePath: string = ctx.data.params!.filePath;
            const fileUri: vscode.Uri = vscode.Uri.joinPath(ws, filePath);
            return filePreviewProvider.mark([fileUri], 'view the diff for this file');
        },
        cancelEvents: commonCancelEvents,
        promptGenerator: (context: RCEContext) => `obtain ${context.data.params?.filePath ? `"${context.data.params.filePath}"'s` : 'a'} Git diff${context.data.params?.ref1 && context.data.params?.ref2 ? ` between ${context.data.params.ref1} and ${context.data.params.ref2}` : context.data.params?.ref1 ? ` at ref ${context.data.params.ref1}` : ''}${context.data.params?.diffType ? ` (of type "${context.data.params.diffType}")` : ''}.`,
        validators: {
            sync: [gitValidator, filePathGitValidator, gitDiffValidator],
        },
        registerCondition: () => !!repo,
    },
    git_log: {
        name: 'git_log',
        description: 'Get the commit history of the current branch',
        category: CATEGORY_GIT,
        schema: {
            type: 'object',
            properties: {
                log_limit: {
                    type: 'integer',
                    minimum: 1,
                    description: 'Limits the number of items returned, starting from the latest commit.',
                },
            },
            additionalProperties: false,
        },
        handler: handleGitLog,
        cancelEvents: commonCancelEvents,
        promptGenerator: (context: RCEContext) => `get the ${context.data.params?.log_limit ? `${context.data.params.log_limit} most recent commits in the ` : ''}Git log.`,
        validators: {
            sync: [gitValidator],
        },
        registerCondition: () => !!repo,
    },
    git_blame: {
        name: 'git_blame',
        description: 'Get commit attributions for each line in a file.',
        category: CATEGORY_GIT,
        schema: {
            type: 'object',
            properties: {
                filePath: { type: 'string', description: 'The file to get attributions on.' },
            },
            required: ['filePath'],
            additionalProperties: false,
        },
        handler: handleGitBlame,
        preview: (ctx: RCEContext) => {
            const ws = getWorkspaceUri();
            if (!ws) return { dispose: () => { } };
            const filePath: string = ctx.data.params!.filePath;
            const fileUri: vscode.Uri = vscode.Uri.joinPath(ws, filePath);
            return filePreviewProvider.mark([fileUri], 'view the blame history for this file');
        },
        cancelEvents: commonCancelEvents,
        promptGenerator: (context: RCEContext) => `get the Git blame for the file "${context.data.params.filePath}".`,
        validators: {
            sync: [gitValidator, filePathGitValidator],
        },
        registerCondition: () => !!repo,
    },

    // Requires gitTags
    tag_head: {
        name: 'tag_head',
        description: 'Tag the current commit using Git.',
        category: CATEGORY_GIT,
        schema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'The name of the tag.' },
                upstream: { type: 'string', description: 'What commit/ref do you want to tag? If not set, will tag the current commit.' },
            },
            required: ['name'],
            additionalProperties: false,
        },
        handler: handleTagHEAD,
        cancelEvents: commonCancelEvents,
        promptGenerator: (context: RCEContext) => `tag the current commit with the name "${context.data.params.name}" and associate it with the "${context.data.params.upstream}" remote.`,
        validators: {
            sync: [gitValidator, (context: RCEContext) => {
                const tagPattern = /^(?![/.@])(?!.*[/.@]$)(?!.*[/.@]{2,})(?:[a-z]+(?:[/.@][a-z]+)*)$/;
                if (!tagPattern.test(context.data.params.name)) {
                    return actionValidationFailure('The Git tag does not conform to Git\'s tag naming rules.');
                }
                return actionValidationAccept();
            }],
        },
        registerCondition: () => !!repo,
    },
    delete_tag: {
        name: 'delete_tag',
        description: 'Delete a tag from Git.',
        category: CATEGORY_GIT,
        schema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'The name of the tag to delete.' },
            },
            required: ['name'],
            additionalProperties: false,
        },
        handler: handleDeleteTag,
        cancelEvents: commonCancelEvents,
        promptGenerator: (context: RCEContext) => `delete the tag "${context.data.params.name}".`,
        validators: {
            sync: [gitValidator],
        },
        registerCondition: () => !!repo,
    },

    // Requires gitConfigs
    set_git_config: {
        name: 'set_git_config',
        description: 'Set a Git configuration value',
        category: CATEGORY_GIT_CONFIG,
        schema: {
            type: 'object',
            properties: {
                key: { type: 'string', description: 'The config key to target.' },
                value: { type: 'string', description: 'The new value for the config key.' },
            },
            required: ['key', 'value'],
            additionalProperties: false,
        },
        handler: handleSetGitConfig,
        cancelEvents: commonCancelEvents,
        promptGenerator: (context: RCEContext) => `set the Git config key "${context.data.params.key}" to "${context.data.params.value}".`,
        validators: {
            sync: [gitValidator],
        },
        registerCondition: () => !!repo,
    },
    get_git_config: {
        name: 'get_git_config',
        description: 'Get a Git configuration value',
        category: CATEGORY_GIT_CONFIG,
        schema: {
            type: 'object',
            properties: {
                key: { type: 'string', description: 'The config key to get. If omitted, you will get the full list of config keys and their values.' },
            },
            additionalProperties: false,
        },
        handler: handleGetGitConfig,
        cancelEvents: commonCancelEvents,
        promptGenerator: (context: RCEContext) => context.data.params?.key ? `get the Git config key "${context.data.params.key}".` : 'get the Git config.',
        validators: {
            sync: [gitValidator],
        },
        registerCondition: () => !!repo,
    },

    // Requires gitRemotes
    fetch_git_commits: {
        name: 'fetch_git_commits',
        description: 'Fetch commits from the remote repository',
        category: CATEGORY_GIT_REMOTES,
        schema: {
            type: 'object',
            properties: {
                remoteName: { type: 'string', description: 'Which remote to fetch from. If omitted, will fetch from the default set repo.' },
                branchName: { type: 'string', description: 'Which branch to fetch from. If omitted, will fetch from the set remote branch of the current branch.' },
            },
            additionalProperties: false,
        },
        handler: handleFetchGitCommits,
        cancelEvents: commonCancelEvents,
        promptGenerator: (context: RCEContext) => {
            if (context.data.params.remoteName && context.data.params.branchName)
                return `fetch commits ${context.data.params.remoteName}/${context.data.params.branchName}.`;
            else if (context.data.params.remoteName)
                return `fetch commits from ${context.data.params.remoteName}.`;
            else if (context.data.params.branchName)
                return `fetch commits from ${context.data.params.branchName}.`;
            return 'fetch commits.';
        },
        validators: {
            sync: [gitValidator],
        },
        registerCondition: () => !!repo,
    },
    pull_git_commits: {
        name: 'pull_git_commits',
        description: 'Pull commits from the remote repository',
        category: CATEGORY_GIT_REMOTES,
        handler: handlePullGitCommits,
        cancelEvents: commonCancelEvents,
        promptGenerator: 'pull commits.',
        validators: {
            sync: [gitValidator],
        },
        registerCondition: () => !!repo,
    },
    push_git_commits: {
        name: 'push_git_commits',
        description: 'Push commits to the remote repository',
        category: CATEGORY_GIT_REMOTES,
        schema: {
            type: 'object',
            properties: {
                remoteName: { type: 'string', description: 'The remote to push to. If omitted, will push to the default remote.' },
                branchName: { type: 'string', description: 'The branch to push to. If omitted, will push to the set remote branch.' },
                forcePush: { type: 'boolean', description: 'If true, will forcibly push to remote.' },
            },
            additionalProperties: false,
        },
        handler: handlePushGitCommits,
        cancelEvents: commonCancelEvents,
        promptGenerator: (context: RCEContext) => {
            const force = context.data.params.forcePush ? 'force ' : '';
            if (context.data.params.remoteName && context.data.params.branchName)
                return `${force}push commits to ${context.data.params.remoteName}/${context.data.params.branchName}.`;
            else if (context.data.params.remoteName)
                return `${force}push commits to ${context.data.params.remoteName}.`;
            else if (context.data.params.branchName)
                return `${force}push commits to ${context.data.params.branchName}.`;
            return `${force}push commits.`;
        },
        validators: {
            sync: [gitValidator],
        },
        registerCondition: () => !!repo,
    },

    // Requires gitRemotes and editRemoteData
    add_git_remote: {
        name: 'add_git_remote',
        description: 'Add a new remote to the Git repository',
        category: CATEGORY_GIT_REMOTES,
        schema: {
            type: 'object',
            properties: {
                remoteName: { type: 'string', description: 'The nickname set for the remote. You will use this name for inputs to other remote-related actions if you wish to use their remote parameters.' },
                remoteURL: { type: 'string', description: 'The URL that the remote name is aliased to. It must be either SSH (which will only work if SSH is properly set up) or HTTPS.' },
            },
            required: ['remoteName', 'remoteURL'],
            additionalProperties: false,
        },
        handler: handleAddGitRemote,
        cancelEvents: commonCancelEvents,
        promptGenerator: (context: RCEContext) => `add a new remote "${context.data.params.remoteName}" with URL "${context.data.params.remoteURL}".`,
        validators: {
            sync: [gitValidator],
        },
        registerCondition: () => !!repo,
    },
    remove_git_remote: {
        name: 'remove_git_remote',
        description: 'Remove a remote from the Git repository',
        category: CATEGORY_GIT_REMOTES,
        schema: {
            type: 'object',
            properties: {
                remoteName: { type: 'string', description: 'Name of the remote Git repository to remove.' },
            },
            required: ['remoteName'],
            additionalProperties: false,
        },
        handler: handleRemoveGitRemote,
        cancelEvents: commonCancelEvents,
        promptGenerator: (context: RCEContext) => `remove the remote "${context.data.params.remoteName}".`,
        validators: {
            sync: [gitValidator],
        },
        registerCondition: () => !!repo,
    },
    rename_git_remote: {
        name: 'rename_git_remote',
        description: 'Rename a remote in the Git repository',
        category: CATEGORY_GIT_REMOTES,
        schema: {
            type: 'object',
            properties: {
                oldRemoteName: { type: 'string', description: 'The current remote name.' },
                newRemoteName: { type: 'string', description: 'The new remote name.' },
            },
            required: ['oldRemoteName', 'newRemoteName'],
            additionalProperties: false,
        },
        handler: handleRenameGitRemote,
        cancelEvents: commonCancelEvents,
        promptGenerator: (context: RCEContext) => `rename the remote "${context.data.params.oldRemoteName}" to "${context.data.params.newRemoteName}".`,
        validators: {
            sync: [gitValidator],
        },
        registerCondition: () => !!repo,
    },
    // Special: Only registered during a merge conflict
    abort_merge: {
        name: 'abort_merge',
        description: 'Abort the current merge operation.',
        category: CATEGORY_GIT,
        handler: handleAbortMerge,
        cancelEvents: commonCancelEvents,
        promptGenerator: 'abort the current merge operation.',
        validators: {
            sync: [gitValidator],
        },
        autoRegister: false,
    },
} satisfies Record<string, RCEAction>;

// Get the current Git repository
// let repo: Repository | undefined = git.repositories[0];
// Handle git repo checks in each handler
// eg.
// if (!git)
//     return actionResultFailure(NO_GIT_STRING);

// Register all git commands
export function addGitActions() {
    const actionsToRegister = [
        gitActions.add_file_to_git,
        gitActions.make_git_commit,
        gitActions.merge_to_current_branch,
        gitActions.git_status,
        gitActions.remove_file_from_git,
        gitActions.delete_git_branch,
        gitActions.switch_git_branch,
        gitActions.new_git_branch,
        gitActions.diff_files,
        gitActions.git_log,
        gitActions.git_blame,
        gitActions.tag_head,
        gitActions.delete_tag,
        gitActions.set_git_config,
        gitActions.get_git_config,
        gitActions.fetch_git_commits,
        gitActions.pull_git_commits,
        gitActions.push_git_commits,
        gitActions.add_git_remote,
        gitActions.remove_git_remote,
        gitActions.rename_git_remote,
    ];

    if (git) {
        addActions([gitActions.init_git_repo]);

        const root = vscode.workspace.workspaceFolders?.[0].uri;
        if (!root) {
            // Register actions immediately, but they will be disabled due to no repo being found
            addActions([...actionsToRegister, gitActions.abort_merge], false);
            return;
        }

        git.openRepository(root).then((r) => {
            repo = r;

            addActions(actionsToRegister);

            // Don't register abort_merge unless there is a merge in progress
            addActions([gitActions.abort_merge], false);
        });
    }
}

/*
 * Actions with the Git repo
 * Requires neuropilot.permission.gitConfig to be enabled.
 */

export function handleNewGitRepo(): RCEHandlerReturns {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        return actionHandlerFailure('No workspace folder is open.', 'Not in a workspace');
    }

    const folderPath = workspaceFolders[0].uri.fsPath;

    return git!.init(vscode.Uri.file(folderPath)).then(() => {
        repo = git!.repositories[0]; // Update the repo reference to the new repository, just in case
        reregisterAllActions(true);
        return actionHandlerSuccess('Initialized a new Git repository in the workspace folder. You should now be able to use git commands.', 'Repo initialized');
    }, (erm: string) => {
        logOutput('ERROR', `Failed to initialize Git repository: ${erm}`);
        return actionHandlerFailure('Failed to initialize Git repository', PROMISE_REJECTION_STRING);
    });
}

export function handleGetGitConfig(context: RCEContext): RCEHandlerReturns {
    const { data: actionData } = context;
    assert(repo);
    const configKey: string | undefined = actionData.params.key;

    if (!configKey) {
        return repo.getConfigs().then((configs: { key: string; value: string; }[]) => {
            return actionHandlerSuccess(`Git config:\n${configs.map((config) => `- ${config.key}: ${config.value}`).join('\n')}`, `Sent ${configs.length} repo Git config(s)`);
        });
    }
    else {
        return repo.getConfig(configKey).then((configValue: string) => {
            return actionHandlerSuccess(`Git config key "${configKey}": ${configValue}`, `Sent repo config value for key "${configKey}"`);
        }, (erm: string) => {
            logOutput('ERROR', `Failed to get Git config key "${configKey}": ${erm}`);
            return actionHandlerFailure(`Failed to get Git config key "${configKey}"`, PROMISE_REJECTION_STRING);
        });
    }
}

export function handleSetGitConfig(context: RCEContext): RCEHandlerReturns {
    const { data: actionData } = context;
    assert(repo);
    const configKey: string = actionData.params.key;
    const configValue: string = actionData.params.value;

    return repo.setConfig(configKey, configValue).then(() => {
        return actionHandlerSuccess(`Set Git config key "${configKey}" to: ${configValue}`, `Wrote new repo config value of "${configKey}"`);
    }, (erm: string) => {
        logOutput('ERROR', `Failed to set Git config key "${configKey}": ${erm}`);
        return actionHandlerFailure(`Failed to set Git config key "${configKey}"`, PROMISE_REJECTION_STRING);
    });
}

/*
 * Actions with Git branches
 */

export function handleNewGitBranch(context: RCEContext): RCEHandlerReturns {
    const { data: actionData } = context;
    assert(repo);
    const branchName: string = actionData.params.branchName;

    return repo.createBranch(branchName, true).then(() => {
        return actionHandlerSuccess(`Created and switched to new branch ${branchName}.`, `Branch "${branchName}" created`);
    }, (erm: string) => {
        logOutput('ERROR', `Failed to create branch: ${erm}`);
        return actionHandlerFailure(`Failed to create branch ${branchName}`, PROMISE_REJECTION_STRING);
    });
}

export function handleSwitchGitBranch(context: RCEContext): RCEHandlerReturns {
    const { data: actionData } = context;
    assert(repo);
    const branchName: string = actionData.params.branchName;

    return repo.checkout(branchName).then(() => {
        return actionHandlerSuccess(`Switched to branch ${branchName}.`, `Branch "${branchName}" checked out`);
    }, (erm: string) => {
        logOutput('ERROR', `Failed to switch branch: ${erm}`);
        return actionHandlerFailure(`Failed to switch to branch ${branchName}`, PROMISE_REJECTION_STRING);
    });
}

export function handleDeleteGitBranch(context: RCEContext): RCEHandlerReturns {
    const { data: actionData } = context;
    assert(repo);
    const branchName: string = actionData.params.branchName;
    const forceDelete: boolean = actionData.params.force ?? false;

    return repo.deleteBranch(branchName, forceDelete).then(() => {
        return actionHandlerSuccess(`Deleted branch ${branchName}.`, `Branch "${branchName}"${forceDelete ? ' forcibly' : ''} deleted`);
    }, (erm: string) => {
        logOutput('ERROR', `Failed to delete branch: ${erm}`);
        return actionHandlerFailure(`Failed to delete branch "${branchName}".${forceDelete === false ? '\nEnsure the branch is merged before deleting, or force delete it to discard changes.' : ''}`, PROMISE_REJECTION_STRING);
    });
}

/*
 * Actions with the Git index
 */

interface StateStringProps {
    fileName?: string;
    originalFileName?: string;
    renamedFileName?: string;
    status: string
}

export function handleGitStatus(): RCEHandlerReturns {
    assert(repo);

    return repo.status().then(() => {
        function translateChange(change: Change) {
            const isRename = change.renameUri !== undefined;
            return {
                fileName: !isRename ? simpleFileName(change.uri.fsPath) : undefined,
                originalFileName: isRename ? simpleFileName(change.originalUri.fsPath) : undefined,
                renamedFileName: isRename ? simpleFileName(change.renameUri.fsPath) : undefined,
                status: StatusStrings[change.status],
            };
        }
        // Can't stringify the repo state directly (because of getters I assume)
        if (!repo) return actionHandlerFailure('Repo unavailable', 'Repo unavailable');
        const state = {
            indexChanges: repo.state.indexChanges.map((change: Change) => translateChange(change)),
            workingTreeChanges: repo.state.workingTreeChanges.map((change: Change) => translateChange(change)),
            mergeChanges: repo.state.mergeChanges.map((change: Change) => translateChange(change)),
            HEAD: {
                name: repo.state.HEAD?.name,
                type: repo.state.HEAD !== undefined ? RefTypeStrings[repo.state.HEAD.type] : undefined,
                ahead: repo.state.HEAD?.ahead,
                behind: repo.state.HEAD?.behind,
                commit: repo.state.HEAD?.commit,
                remote: repo.state.HEAD?.remote,
                upstream: repo.state.HEAD?.upstream,
            },
        };

        // Helper function to map changes
        function mapChanges(array: StateStringProps[], prefix?: string) {
            const changes: string[] = [];
            array.map((change: StateStringProps) => {
                if (change.originalFileName && change.renamedFileName) {
                    changes.push(`${prefix ?? ''}(${change.status}) ${change.originalFileName} -> ${change.renamedFileName}`);
                } else if (change.fileName) {
                    changes.push(`${prefix ?? ''}(${change.status}) ${change.fileName}`);
                } else {
                    const a = 'aeiou'.includes(change.status[0]) ? 'an' : 'a';
                    changes.push(`${prefix ?? ''}${a} ${change.status} file had some missing data.`);
                }
            });
            return changes;
        }

        // Constructing the state string
        const mergeStateString: string =
            `Index changes:\n${mapChanges(state.indexChanges, '- ').join('\n')}\n\n` +
            `Working tree changes:\n${mapChanges(state.workingTreeChanges, '- ').join('\n')}\n\n` +
            `Merge changes:\n${mapChanges(state.mergeChanges, '- ').join('\n')}\n\n`;


        const HEADUpstreamState: string =
            `       Remote branch name: ${state.HEAD.upstream?.name}\n` +
            `       On remote ${state.HEAD.upstream?.remote}\n` +
            `       ${state.HEAD.upstream?.commit ? `At commit ${state.HEAD.upstream?.commit}\n` : 'No commit on remote.\n'}`;


        const HEADStateString: string =
            'Current HEAD:\n' +
            `   Name: ${state.HEAD.name}\n` +
            `   Type: ${state.HEAD.type}\n` +
            `   At commit ${state.HEAD.commit}\n` +
            `   ${state.HEAD.upstream ? `Remote branch details:\n${HEADUpstreamState}\n` : 'No remote branch details.\n'}` +
            `   ${state.HEAD.upstream ? `Changes since last pull/push: ${state.HEAD.ahead} ahead | ${state.HEAD.behind} behind\n}` : 'No remote, so no pull/push info available.\n'}`;


        const stateStringArray: string[] = [mergeStateString, HEADStateString];

        return actionHandlerSuccess(`Git status:\n\n${stateStringArray.join('\n')}`, `${repo.state.indexChanges.length + repo.state.workingTreeChanges.length + repo.state.mergeChanges.length} changes + more info sent`);
    }, (erm: string) => {
        logOutput('ERROR', `Failed to get Git status: ${erm}`);
        return actionHandlerFailure('Failed to get Git repository status', PROMISE_REJECTION_STRING);
    });
}

// Helper to convert a provided file path (or wildcard) to an absolute path using the workspace folder (or repo root if not available)
function getAbsoluteFilePath(filePath = '.'): string {
    // Get the workspace folder; if not available, fall back to repo root.
    const workspaceFolder = getWorkspacePath() || repo!.rootUri.fsPath;
    // Compute absolute path by joining the workspace folder with the normalized path.
    return normalizePath(workspaceFolder + '/' + filePath);
}

export function handleAddFileToGit(context: RCEContext): RCEHandlerReturns {
    const { data: actionData } = context;
    assert(repo);
    const filePath: string[] = actionData.params.filePath;
    const absolutePaths: string[] = [];

    for (const path of filePath) {
        absolutePaths.push(getAbsoluteFilePath(path));
    }

    return repo.add(absolutePaths).then(() => {
        return actionHandlerSuccess(`Added files "${filePath.join(', ')}" to staging area.`, `Added ${filePath.length} files to staging`);
    }, (erm: string) => {
        logOutput('ERROR', `Failed to git add: ${erm}\nTried to add ${absolutePaths}`);
        return actionHandlerFailure('Adding files to staging area failed', PROMISE_REJECTION_STRING);
    });
}

export function handleRemoveFileFromGit(context: RCEContext): RCEHandlerReturns {
    const { data: actionData } = context;
    assert(repo);
    const filePath: string[] = actionData.params.filePath;
    const absolutePaths: string[] = [];

    for (const path of filePath) {
        absolutePaths.push(getAbsoluteFilePath(path));
    }

    return repo.revert(absolutePaths).then(() => {
        return actionHandlerSuccess(`Removed "${filePath.join(', ')}" from the index.`, `${absolutePaths.length} files removed from staging`);
    }, (erm: string) => {
        logOutput('ERROR', `Git remove failed: ${erm}\nTried to remove ${absolutePaths}`);
        return actionHandlerFailure('Removing files from the index failed', PROMISE_REJECTION_STRING);
    });
}

export function handleMakeGitCommit(context: RCEContext): RCEHandlerReturns {
    const { data: actionData } = context;
    assert(repo);
    const message = `${NEURO.currentController} committed: ${actionData.params?.message}`;
    const commitOptions: string[] | undefined = actionData.params?.options;
    let ExtraCommitOptions: CommitOptions | undefined = {};

    if (!commitOptions) {
        ExtraCommitOptions = undefined;
    }
    else {
        let invalidCommitOptionCheck: boolean | undefined;
        const invalidCommitOptions: string[] = [];
        commitOptions.map((option) => {
            if (!ExtraCommitOptions) return;
            switch (option) {
                case 'amend':
                    ExtraCommitOptions.amend = true;
                    break;
                case 'signoff':
                    ExtraCommitOptions.signoff = true;
                    break;
                case 'verbose':
                    ExtraCommitOptions.verbose = true;
                    break;
                default:
                    invalidCommitOptionCheck = true;
                    invalidCommitOptions.push(option);
                    break;
            }
        });
        if (invalidCommitOptionCheck === true) {
            return actionHandlerFailure(`Invalid commit options: ${invalidCommitOptions.join(', ')}`, `${invalidCommitOptions.length} invalid commit options provided`);
        }
    }

    repo.inputBox.value = message;
    return repo.commit(message, ExtraCommitOptions).then(() => {
        return actionHandlerSuccess(`Committed with message: "${message}"\nCommit options used: ${commitOptions ? commitOptions : 'None'}`, `${ExtraCommitOptions?.amend ? 'Amended c' : 'C'}ommit applied${ExtraCommitOptions?.signoff ? ' with signoff' : ''}`);
    }, (erm: string) => {
        logOutput('ERROR', `Failed to commit: ${erm}`);
        return actionHandlerFailure('Failed to record commit', PROMISE_REJECTION_STRING);
    });
}

export function handleGitMerge(context: RCEContext): RCEHandlerReturns {
    const { data: actionData } = context;
    assert(repo);
    const refToMerge = actionData.params.ref_to_merge;

    return repo.merge(refToMerge).then(() => {
        return actionHandlerSuccess(`Cleanly merged ${refToMerge} into the current branch.`, `Cleanly merged ${refToMerge}`);
    }, (erm: string) => {
        if (repo?.state.mergeChanges.some(() => true)) {
            registerAction(gitActions.abort_merge.name);
            return actionHandlerSuccess(`Encountered merge conflicts while merging ref "${refToMerge}", fix and execute the merge action again once resolved`, `Merged ${refToMerge} - conflict resolution required`);
        } else {
            logOutput('ERROR', `Encountered an error when merging ${refToMerge}: ${erm}`);
            return actionHandlerFailure(`Couldn't merge ${refToMerge}.`, PROMISE_REJECTION_STRING);
        }
    });
}

export function handleAbortMerge(): RCEHandlerReturns {
    assert(repo);

    return repo.mergeAbort().then(() => {
        unregisterAction(gitActions.abort_merge.name);
        return actionHandlerSuccess('Merge aborted.', 'Aborted merging');
    }, (erm: string) => {
        logOutput('ERROR', `Failed to abort merge: ${erm}`);
        return actionHandlerFailure("Couldn't abort merging!", PROMISE_REJECTION_STRING);
    });
}

export function handleDiffFiles(context: RCEContext): RCEHandlerReturns {
    const { data: actionData } = context;
    assert(repo);

    const ref1: string | undefined = actionData.params.ref1;
    const ref2: string | undefined = actionData.params.ref2;
    const filePath: string = actionData.params.filePath ?? '.';
    const diffThisFile = getAbsoluteFilePath(filePath);

    const diffType: string = actionData.params.diffType ?? 'diffWithHEAD'; // Default to diffWithHEAD

    switch (diffType) {
        case 'diffWithHEAD':
            return repo.diffWithHEAD(diffThisFile)
                .then((diff: string) => {
                    return actionHandlerSuccess(`Diff with HEAD for ${filePath || 'workspace root'}:\n${diff}`, 'Sent diff with HEAD');
                })
                .catch((erm: string) => {
                    logOutput('ERROR', `Failed to get diff with HEAD for ${filePath || 'workspace root'}: ${erm}`);
                    return actionHandlerFailure(`Failed to get diff with HEAD for ${filePath || 'workspace root'}.`, PROMISE_REJECTION_STRING);
                });

        case 'diffWith':
            if (ref1) {
                return repo.diffWith(ref1, diffThisFile)
                    .then((diff: string) => {
                        return actionHandlerSuccess(`Diff with ref "${ref1}" for ${filePath || 'workspace root'}:\n${diff}`, `Sent diff with ref "${ref1}"`);
                    })
                    .catch((erm: string) => {
                        logOutput('ERROR', `Failed to get diff with ref "${ref1}" for ${filePath || 'workspace root'}: ${erm}`);
                        return actionHandlerFailure(`Failed to get diff with ref "${ref1}" for ${filePath || 'workspace root'}.`, PROMISE_REJECTION_STRING);
                    });
            } else {
                return actionHandlerRetry('Ref1 is required for diffWith.', 'Missing ref1 parameter');
            }

        case 'diffIndexWithHEAD':
            return repo.diffIndexWithHEAD(diffThisFile)
                .then((diff: string) => {
                    return actionHandlerSuccess(`Diff index with HEAD for ${filePath || 'workspace root'}:\n${diff}`, 'Sent diff index with HEAD');
                })
                .catch((erm: string) => {
                    logOutput('ERROR', `Failed to get diff index with HEAD for ${filePath || 'workspace root'}: ${erm}`);
                    return actionHandlerFailure(`Failed to get diff index with HEAD for ${filePath || 'workspace root'}.`, PROMISE_REJECTION_STRING);
                });

        case 'diffIndexWith':
            if (ref1) {
                return repo.diffIndexWith(ref1, diffThisFile)
                    .then((diff: string) => {
                        return actionHandlerSuccess(`Diff index with ref "${ref1}" for ${filePath || 'workspace root'}:\n${diff}`, `Sent diff index with ref "${ref1}"`);
                    })
                    .catch((erm: string) => {
                        logOutput('ERROR', `Failed to get diff index with ref "${ref1}" for ${filePath || 'workspace root'}: ${erm}`);
                        return actionHandlerFailure(`Failed to get diff index with ref "${ref1}" for ${filePath || 'workspace root'}.`, PROMISE_REJECTION_STRING);
                    });
            } else {
                return actionHandlerRetry('Ref1 is required for diffIndexWith.', 'Missing ref1 parameter');
            }

        case 'diffBetween':
            if (ref1 && ref2) {
                return repo.diffBetween(ref1, ref2, diffThisFile)
                    .then((diff: string) => {
                        return actionHandlerSuccess(`Diff between refs "${ref1}" and "${ref2}" for ${filePath || 'workspace root'}:\n${diff}`, `Sent diff between "${ref1}" and "${ref2}"`);
                    })
                    .catch((erm: string) => {
                        logOutput('ERROR', `Failed to get diff between refs "${ref1}" and "${ref2}" for ${filePath || 'workspace root'}: ${erm}`);
                        return actionHandlerFailure(`Failed to get diff between refs "${ref1}" and "${ref2}" for ${filePath || 'workspace root'}.`, PROMISE_REJECTION_STRING);
                    });
            } else {
                return actionHandlerRetry('Both ref1 and ref2 are required for diffBetween.', 'Missing ref1 or ref2 parameter');
            }

        case 'fullDiff':
            return repo.diffWithHEAD(diffThisFile)
                .then((diff: string) => {
                    return actionHandlerSuccess(`Full diff for workspace root:\n${diff}`, 'Sent full diff');
                })
                .catch((erm: string) => {
                    logOutput('ERROR', `Failed to get full diff for workspace root: ${erm}`);
                    return actionHandlerFailure('Failed to get full diff for workspace root.', PROMISE_REJECTION_STRING);
                });

        default:
            return actionHandlerFailure(`Invalid diffType "${diffType}".`, `Invalid diffType "${diffType}"`);
    }
}

export function handleGitLog(context: RCEContext): RCEHandlerReturns {
    const { data: actionData } = context;
    assert(repo);

    const logLimit: number | undefined = actionData.params?.log_limit;

    return repo.log().then((commits: Commit[]) => {
        // If log_limit is defined, restrict number of commits to that value.
        if (logLimit) {
            commits = commits.slice(0, logLimit);
        }
        // Build a readable commit log string.
        const commitLog = commits.map(commit =>
            `Commit: ${commit.hash}\nMessage: ${commit.message}\nAuthor: ${commit.authorName}\nDate: ${commit.authorDate}\n`,
        ).join('\n');

        return actionHandlerSuccess(`Commit log:\n${commitLog}`, `Sent ${commits.length} commit${commits.length !== 1 ? 's' : ''}`);
    }, (erm: string) => {
        logOutput('ERROR', `Failed to get git log: ${erm}`);
        return actionHandlerFailure('Failed to get git log.', PROMISE_REJECTION_STRING);
    });
}

export function handleGitBlame(context: RCEContext): RCEHandlerReturns {
    const { data: actionData } = context;
    assert(repo);
    const filePath: string = actionData.params.filePath;
    const absolutePath: string = getAbsoluteFilePath(filePath);

    if (!isPathNeuroSafe(absolutePath)) {
        return actionHandlerFailure('The provided file path is not allowed.', 'Access to targeted file disallowed');
    }

    return repo.blame(absolutePath).then((blame: string) => {
        return actionHandlerSuccess(`Blame attribution for ${filePath}:\n${blame}`, `Sent blame for ${filePath}`);
    }, (erm: string) => {
        logOutput('ERROR', `Error getting blame attribs for ${filePath}: ${erm}`);
        return actionHandlerFailure('Failed to get blame attribution.', PROMISE_REJECTION_STRING);
    });
}

/**
 * Actions with Git tags
 * Requires neuropilot.permission.gitTags to be enabled.
 */

export function handleTagHEAD(context: RCEContext): RCEHandlerReturns {
    const { data: actionData } = context;
    assert(repo);
    const name: string = actionData.params.name;
    const upstream: string = actionData.params.upstream ?? 'HEAD';

    return repo.tag(name, upstream).then(() => {
        return actionHandlerSuccess(`Tag ${name} created for ${upstream}.`, `Tag "${name}" created`);
    }, (erm: string) => {
        logOutput('ERROR', `Error trying to tag: ${erm}`);
        return actionHandlerFailure('There was an error during tagging.', PROMISE_REJECTION_STRING);
    });
}

export function handleDeleteTag(context: RCEContext): RCEHandlerReturns {
    const { data: actionData } = context;
    assert(repo);
    const name: string = actionData.params.name;

    return repo.deleteTag(name).then(() => {
        return actionHandlerSuccess(`Deleted tag ${name}`, `Tag "${name}" deleted`);
    }, (erm: string) => {
        logOutput('ERROR', `Failed to delete tag ${name}: ${erm}`);
        return actionHandlerFailure(`Couldn't delete tag "${name}"`, PROMISE_REJECTION_STRING);
    });
}

/*
 * Actions with Git remotes
 * Requires neuropilot.permission.gitRemotes to be enabled.
 */

export function handleFetchGitCommits(context: RCEContext): RCEHandlerReturns {
    const { data: actionData } = context;
    assert(repo);
    const remoteName: string = actionData.params.remoteName;
    const branchName: string = actionData.params.branchName;

    return repo.fetch(remoteName, branchName).then(() => {
        return actionHandlerSuccess(`Fetched commits from ${remoteName ? 'remote ' + remoteName : 'default remote'}${branchName ? `, branch "${branchName}"` : ''}.`, `Fetched from ${remoteName || 'default remote'}`);
    }, (erm: string) => {
        logOutput('ERROR', `Failed to fetch commits: ${erm}`);
        return actionHandlerFailure(`Failed to fetch commits from remote "${remoteName}"`, PROMISE_REJECTION_STRING);
    });
}

export function handlePullGitCommits(): RCEHandlerReturns {
    assert(repo);

    return repo.pull().then(() => {
        return actionHandlerSuccess('Pulled commits from remote.', 'Pulled commits');
    }, (erm: string) => {
        logOutput('ERROR', `Failed to pull commits: ${erm}`);
        return actionHandlerFailure(`Failed to pull commits from remote: ${erm}`, PROMISE_REJECTION_STRING);
    });
}

export function handlePushGitCommits(context: RCEContext): RCEHandlerReturns {
    const { data: actionData } = context;
    assert(repo);
    const remoteName: string | undefined = actionData.params.remoteName;
    const branchName: string | undefined = actionData.params.branchName;
    const forcePush: boolean = actionData.params.forcePush ?? false;

    const forcePushMode: ForcePushMode | undefined = forcePush === true ? ForcePushMode.Force : undefined;

    return repo.push(remoteName, branchName, true, forcePushMode).then(() => {
        return actionHandlerSuccess(`Pushed commits${remoteName ? ` to remote "${remoteName}"` : ''}${branchName ? `, branch "${branchName}"` : ''}.${forcePush === true ? ' (forced push)' : ''}`, `Pushed to ${remoteName || 'remote'}${forcePush ? ' (forced)' : ''}`);
    }, (erm: string) => {
        logOutput('ERROR', `Failed to push commits: ${erm}`);
        return actionHandlerFailure(`Failed to push commits to remote "${remoteName}": ${erm}`, PROMISE_REJECTION_STRING);
    });
}

/*
 * THESE ACTIONS ARE CONSIDERED DANGEROUS REMOTE OPERATIONS
 * Requires neuropilot.permission.editRemoteData to be enabled, IN ADDITION to neuropilot.permission.gitRemotes.
 */

export function handleAddGitRemote(context: RCEContext): RCEHandlerReturns {
    const { data: actionData } = context;
    assert(repo);

    const remoteName: string = actionData.params.remoteName;
    const remoteUrl: string = actionData.params.remoteURL;

    return repo.addRemote(remoteName, remoteUrl).then(() => {
        return actionHandlerSuccess(`Added remote "${remoteName}" with URL: ${remoteUrl}`, `Remote "${remoteName}" added`);
    }, (erm: string) => {
        logOutput('ERROR', `Failed to add remote: ${erm}`);
        return actionHandlerFailure(`Failed to add remote "${remoteName}"`, PROMISE_REJECTION_STRING);
    });
}

export function handleRemoveGitRemote(context: RCEContext): RCEHandlerReturns {
    const { data: actionData } = context;
    assert(repo);
    const remoteName: string = actionData.params.remoteName;

    return repo.removeRemote(remoteName).then(() => {
        return actionHandlerSuccess(`Removed remote "${remoteName}".`, `Remote "${remoteName}" removed`);
    }, (erm: string) => {
        logOutput('ERROR', `Failed to remove remote: ${erm}`);
        return actionHandlerFailure(`Failed to remove remote "${remoteName}"`, PROMISE_REJECTION_STRING);
    });
}

export function handleRenameGitRemote(context: RCEContext): RCEHandlerReturns {
    const { data: actionData } = context;
    assert(repo);
    const oldRemoteName: string = actionData.params.oldRemoteName;
    const newRemoteName: string = actionData.params.newRemoteName;

    return repo.renameRemote(oldRemoteName, newRemoteName).then(() => {
        return actionHandlerSuccess(`Renamed remote "${oldRemoteName}" to "${newRemoteName}".`, `Remote "${oldRemoteName}" renamed to "${newRemoteName}"`);
    }, (erm: string) => {
        logOutput('ERROR', `Failed to rename remote ${oldRemoteName}: ${erm}`);
        return actionHandlerFailure(`Failed to rename remote "${oldRemoteName}" to "${newRemoteName}"`, PROMISE_REJECTION_STRING);
    });
}
