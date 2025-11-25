import { render } from 'preact';
import { useState, useEffect, useMemo, useId } from 'preact/hooks';
import type { ActionNode, ActionsViewMessage, ActionsViewProviderMessage, SettingsContext } from '@/views/actions';
import { PermissionLevel } from '@/config';

interface State {
    actions: ActionNode[];
    context: SettingsContext;
}

interface PermissionLevelRadioProps {
    currentLevel: PermissionLevel | undefined;
    onChange: (level: PermissionLevel) => void;
}

const levels: { level: PermissionLevel; icon: string; title: string; description: string }[] = [
    { level: PermissionLevel.AUTOPILOT, icon: 'codicon-check', title: 'Autopilot', description: 'Allow' },
    { level: PermissionLevel.COPILOT, icon: 'codicon-question', title: 'Copilot', description: 'Ask for permission' },
    { level: PermissionLevel.OFF, icon: 'codicon-chrome-close', title: 'Off', description: 'Do not allow' },
];

function PermissionLevelRadio({ currentLevel, onChange }: PermissionLevelRadioProps) {
    const id = useId();

    return (
        <div class="permission-level-radio">
            {levels.map(({ level, icon, title, description }) =>
                <label
                    key={level}
                    data-permission-level={level}
                    title={`${title} - ${description}`}
                >
                    <i class={`codicon ${icon}`}></i>
                    <input
                        type="radio"
                        name={id}
                        value={level}
                        checked={level === currentLevel}
                        onChange={() => onChange(level)}
                    />
                </label>,
            )}
        </div>
    );
}

interface CategorySectionProps {
    category: string;
    actions: ActionNode[];
    onPermissionChange: (actionIds: string[], newLevel: PermissionLevel) => void;
}

function CategorySection({ category, actions, onPermissionChange }: CategorySectionProps) {
    // Determine if all actions in this category share the same permission level
    let commonLevel: PermissionLevel | undefined = undefined;
    if (actions.every((n) => n.permissionLevel === PermissionLevel.AUTOPILOT)) {
        commonLevel = PermissionLevel.AUTOPILOT;
    } else if (actions.every((n) => n.permissionLevel === PermissionLevel.COPILOT)) {
        commonLevel = PermissionLevel.COPILOT;
    } else if (actions.every((n) => n.permissionLevel === PermissionLevel.OFF)) {
        commonLevel = PermissionLevel.OFF;
    }

    return (
        <>
            <div class="category-header">
                <span class="category-label">{category}</span>
                <PermissionLevelRadio
                    currentLevel={commonLevel}
                    onChange={(level) => onPermissionChange(actions.map(a => a.id), level)}
                />
            </div>
            {actions.map((action) =>
                <div class="action-entry" key={action.id}>
                    <span
                        class={`
                            action-label
                            ${action.modifiedExternally ? 'modified-externally' : ''}
                            ${!action.isRegistered ? 'unregistered-action' : ''}
                        `}
                        title={action.description || ''}
                    >
                        {action.label}
                    </span>
                    <PermissionLevelRadio
                        currentLevel={action.permissionLevel}
                        onChange={(level) => onPermissionChange([action.id], level)}
                    />
                </div>,
            )}
        </>
    );
}

interface ContextSwitcherProps {
    currentContext: SettingsContext;
    onContextChange: (newContext: SettingsContext) => void;
}

function ContextSwitcher({ currentContext, onContextChange }: ContextSwitcherProps) {
    const UserLink = currentContext === 'user' ? 'span' : 'a';
    const WorkspaceLink = currentContext === 'workspace' ? 'span' : 'a';

    return (
        <p class="context-switcher">
            <UserLink
                class={currentContext === 'user' ? 'current-context' : 'not-current-context'}
                title={currentContext === 'workspace' ? 'Switch to User Settings' : ''}
                onClick={currentContext === 'workspace' ? () => onContextChange('user') : undefined}
            >
                User
            </UserLink>
            {' | '}
            <WorkspaceLink
                class={currentContext === 'workspace' ? 'current-context' : 'not-current-context'}
                title={currentContext === 'user' ? 'Switch to Workspace Settings' : ''}
                onClick={currentContext === 'user' ? () => onContextChange('workspace') : undefined}
            >
                Workspace
            </WorkspaceLink>
        </p>
    );
}

function ActionsView() {
    const vscode = useMemo(acquireVsCodeApi<State>, []);

    // Initialize state from saved state or defaults
    const oldState = useMemo(vscode.getState, [vscode]);
    const [actions, setActions] = useState<ActionNode[]>(oldState?.actions ?? []);
    const [context, setContext] = useState<SettingsContext>(oldState?.context ?? 'workspace');

    // Save state whenever it changes
    useEffect(() => {
        vscode.setState({ actions, context });
    }, [actions, context]);

    // Request initialization on mount
    useEffect(() => {
        vscode.postMessage({
            type: 'requestInitialization',
            currentContext: context,
        } satisfies ActionsViewMessage);

        const messageHandler = (event: MessageEvent<ActionsViewProviderMessage>) => {
            const message = event.data;
            switch (message.type) {
                case 'refreshActions':
                    setActions(message.actions);
                    break;
            }
        };

        // Listen for messages from the extension
        window.addEventListener('message', messageHandler);
        return () => window.removeEventListener('message', messageHandler);
    }, [context]);

    // Organize actions by category
    const categories = useMemo(() => actions.reduce<Record<string, ActionNode[]>>((acc, action) => {
        if (!acc[action.category]) {
            acc[action.category] = [];
        }
        acc[action.category].push(action);
        return acc;
    }, {}), [actions]);

    // Sort categories and actions
    const categoryKeys = useMemo(() => {
        const categoryKeys = Object.keys(categories)
            .sort()
            .sort((a, b) => a === 'Miscellaneous' ? 1 : b === 'Miscellaneous' ? -1 : 0)
            .sort((a, b) => a === 'No Category Specified' ? 1 : b === 'No Category Specified' ? -1 : 0);

        categoryKeys.forEach(c => categories[c].sort((a, b) => a.label.localeCompare(b.label)));

        return categoryKeys;
    }, [categories]);

    return (
        <>
            <details>
                <summary>
                    <i class='codicon codicon-info'></i>
                    <span>Help</span>
                </summary>
                <p><i>Italics = Actual permission is controlled by the other context or the action's default permission.</i></p>
                <p><span class="disabled">Grayed out = Permission is not registered</span></p>
                <p>Some actions may have secondary registration conditions and not be registered even if permission is granted.</p>
                <p>
                    {levels.map(({level, icon, title, description}) =>
                        <div class="permission-level-description">
                            <div class="permission-level-radio">
                                <label data-show-checked data-permission-level={level}>
                                    <i class={`codicon ${icon}`}></i>
                                </label>
                            </div>
                            <div>- {title} ({description})</div>
                        </div>,
                    )}
                </p>
            </details>

            <ContextSwitcher
                currentContext={context}
                onContextChange={(newContext) => {
                    setContext(newContext);
                    vscode.postMessage({
                        type: 'changeContext',
                        newContext,
                    } satisfies ActionsViewMessage);
                }}
            />

            <div class="actions-list">
                {categoryKeys.map((category) =>
                    <CategorySection
                        key={category}
                        category={category}
                        actions={categories[category]}
                        onPermissionChange={(actionIds, newLevel) => {
                            vscode.postMessage({
                                type: 'viewToggledPermissions',
                                actionIds,
                                newPermissionLevel: newLevel,
                            } satisfies ActionsViewMessage);
                        }}
                    />,
                )}
            </div>
        </>
    );
}

// Render immediately when script loads
render(<ActionsView />, document.getElementById('root')!);
