import type { ActionNode, ActionsViewMessage, ActionsViewProviderMessage, SettingsContext } from '@/views/actions';
import { PermissionLevel } from '@vsc-neuropilot/api-types';

interface State {
    actions: ActionNode[];
    context: SettingsContext;
}

(function () {
    const vscode = acquireVsCodeApi<State>();

    const oldState = vscode.getState();
    const state: State = oldState ?? {
        actions: [],
        context: 'workspace',
    };
    if (!oldState) {
        vscode.setState(state);
    }
    vscode.postMessage({
        type: 'requestInitialization',
        currentContext: state.context,
    } satisfies ActionsViewMessage);

    updateContextSwitcher();
    updateActionsList();

    // Handle messages sent from the extension to the webview
    window.addEventListener('message', event => {
        const message: ActionsViewProviderMessage = event.data;
        switch (message.type) {
            case 'refreshActions': {
                state.actions = message.actions;
                vscode.setState(state);
                updateActionsList();
                break;
            }
        }
    });

    function updateActionsList() {
        const categories = state.actions.reduce<Record<string, ActionNode[]>>((acc, action) => {
            if (!acc[action.category]) {
                acc[action.category] = [];
            }
            acc[action.category].push(action);
            return acc;
        }, {});

        const actionsList = document.querySelector<HTMLUListElement>('.actions-list')!;
        actionsList.textContent = '';

        const categoryKeys = Object.keys(categories)
            .sort()
            .sort((a, b) => a === 'Miscellaneous' ? 1 : b === 'Miscellaneous' ? -1 : 0)
            .sort((a, b) => a === 'No Category Specified' ? 1 : b === 'No Category Specified' ? -1 : 0);
        categoryKeys.forEach(c => categories[c].sort((a, b) => a.label.localeCompare(b.label)));
        for (const category of categoryKeys) {
            // <div class="category-header">
            //   <span class="action-label">Category Name</span>
            //   [checkboxes]
            // </div>
            const categoryHeader = document.createElement('div');
            categoryHeader.className = 'category-header';
            actionsList.appendChild(categoryHeader);

            const categoryLabel = document.createElement('span');
            categoryLabel.className = 'category-label';
            categoryLabel.textContent = category;
            categoryHeader.appendChild(categoryLabel);

            const autopilotToggle = createCategoryCheckbox(category, categories[category], PermissionLevel.AUTOPILOT);
            categoryHeader.appendChild(autopilotToggle);
            const copilotToggle = createCategoryCheckbox(category, categories[category], PermissionLevel.COPILOT);
            categoryHeader.appendChild(copilotToggle);
            const offToggle = createCategoryCheckbox(category, categories[category], PermissionLevel.OFF);
            categoryHeader.appendChild(offToggle);

            for (const actionNode of categories[category]) {
                // <div class="action-entry" id="action-{id}">
                //   <span class="action-label" title="Action Description">Action Label</span>
                //   [checkboxes]
                // </div>
                const actionEntry = document.createElement('div');
                actionEntry.className = 'action-entry';
                actionEntry.id = `action-${actionNode.id}`;

                const actionLabel = document.createElement('span');
                actionLabel.classList.add('action-label');
                if (actionNode.modifiedExternally)
                    actionLabel.classList.add('modified-externally');
                // if (actionNode.modifiedInCurrentContext)
                //     actionLabel.classList.add('modified-in-current-context');
                if (!actionNode.isRegistered)
                    actionLabel.classList.add('unregistered-action');
                if (actionNode.description)
                    actionLabel.title = actionNode.description;
                actionLabel.textContent = actionNode.label;
                actionEntry.appendChild(actionLabel);

                const autopilotToggle = createActionRadioButton(actionNode, PermissionLevel.AUTOPILOT);
                actionEntry.appendChild(autopilotToggle);
                const copilotToggle = createActionRadioButton(actionNode, PermissionLevel.COPILOT);
                actionEntry.appendChild(copilotToggle);
                const offToggle = createActionRadioButton(actionNode, PermissionLevel.OFF);
                actionEntry.appendChild(offToggle);

                actionsList.appendChild(actionEntry);
            }
        }

        function createCategoryCheckbox(category: string, actionNodes: ActionNode[], permissionLevel: PermissionLevel): HTMLDivElement {
            // <div class="permission-radio-container">
            //   <input type="radio" class="permission-radio">
            // </div>
            const container = document.createElement('div');
            container.className = 'permission-radio-container';

            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.className = 'permission-radio';
            radio.name = `permission-category-${category}`;
            container.appendChild(radio);

            radio.checked = actionNodes.every(action => action.permissionLevel === permissionLevel);

            radio.addEventListener('change', () => {
                vscode.postMessage({
                    type: 'viewToggledPermissions',
                    actionIds: actionNodes.map(a => a.id),
                    newPermissionLevel: permissionLevel,
                } satisfies ActionsViewMessage);
            });

            return container;
        }

        function createActionRadioButton(actionNode: ActionNode, permissionLevel: PermissionLevel): HTMLDivElement {
            // <div class="permission-radio-container">
            //   <input type="radio" class="permission-radio">
            // </div>
            const container = document.createElement('div');
            container.className = 'permission-radio-container';

            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.className = 'permission-radio';
            radio.checked = actionNode.permissionLevel === permissionLevel;
            radio.name = `permission-${actionNode.id}`;
            container.appendChild(radio);

            radio.addEventListener('change', () => {
                vscode.postMessage({
                    type: 'viewToggledPermissions',
                    actionIds: [actionNode.id],
                    newPermissionLevel: permissionLevel,
                } satisfies ActionsViewMessage);
            });

            return container;
        }
    }

    function changeContext(newContext: SettingsContext) {
        state.context = newContext;
        vscode.setState(state);
        updateContextSwitcher();
        vscode.postMessage({
            type: 'changeContext',
            newContext: newContext,
        } satisfies ActionsViewMessage);
    }

    function updateContextSwitcher() {
        const switcherContainer = document.querySelector<HTMLParagraphElement>('.context-switcher')!;
        switcherContainer.textContent = '';
        const linkElement = document.createElement('a');
        const spanElement = document.createElement('span');
        const userElement = state.context === 'user' ? spanElement : linkElement;
        const workspaceElement = state.context === 'workspace' ? spanElement : linkElement;

        userElement.textContent = 'User';
        workspaceElement.textContent = 'Workspace';
        spanElement.className = 'current-context';
        linkElement.className = 'not-current-context';

        if (state.context === 'user') {
            linkElement.title = 'Switch to Workspace Settings';
            linkElement.onclick = () => changeContext('workspace');
        } else {
            linkElement.title = 'Switch to User Settings';
            linkElement.onclick = () => changeContext('user');
        }

        switcherContainer.appendChild(userElement);
        switcherContainer.appendChild(document.createTextNode(' | '));
        switcherContainer.appendChild(workspaceElement);
    }
}());
