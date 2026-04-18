import { render } from 'preact';
import { useState, useEffect, useMemo } from 'preact/hooks';
import type { ViewProviderMessage } from '@/views/companions';
import { Contributions } from '@vsc-neuropilot/api-types';
import { CompanionMetaWithName } from '@/plugins/utility-types';

interface State {
    companions: Record<string, CompanionMetaWithName>;
}

const contributionLabels: Record<Contributions, string> = {
    [Contributions.ACTIONS_MANAGE]: 'Manage its own actions',
    [Contributions.ACTIONS_MANAGE_OTHERS]: 'Manage other companions\' actions',
    [Contributions.ACTIONS_INJECT]: 'Inject into other actions',
    [Contributions.ACTIONS_PROCESS]: 'Process actions by Neuro',
    [Contributions.ACTIONS_FORCE]: 'Force actions from Neuro',
    [Contributions.CHANGELOG]: 'Provide changelogs',
    [Contributions.CONTEXT]: 'Send context to Neuro',
    [Contributions.CURSOR_GET]: 'View Neuro\'s cursor',
    [Contributions.CURSOR_SET]: 'Move Neuro\'s cursor',
    [Contributions.IMAGES]: 'Try an unimplemented feature',
};

function CompanionsView() {
    const vscode = useMemo(acquireVsCodeApi<State>, []);
    const oldState = useMemo(vscode.getState, [vscode]);
    const [companions, setCompanions] = useState<Record<string, CompanionMetaWithName>>(oldState?.companions ?? {});

    // Save state whenever it changes
    useEffect(() => {
        vscode.setState({ companions });
    }, [companions, vscode]);

    // Listen for messages from the extension
    useEffect(() => {
        const messageHandler = (event: MessageEvent<ViewProviderMessage>) => {
            const message = event.data;
            switch (message.type) {
                case 'enabled':
                    setCompanions(prev => ({
                        ...prev,
                        [message.name]: {
                            ...message,
                            type: undefined,
                        },
                    }));
                    break;
                case 'disabled':
                    setCompanions(prev => {
                        const updated = { ...prev };
                        delete updated[message.name];
                        return updated;
                    });
                    break;
            }
        };

        window.addEventListener('message', messageHandler);
        return () => window.removeEventListener('message', messageHandler);
    }, []);

    const companionList = useMemo(() => Object.values(companions), [companions]);

    return (
        <div class="companions-container">
            <div class="header">
                <h3>Active Companions</h3>
                <span class="companion-count">{companionList.length}</span>
            </div>
            {companionList.length === 0 ?
                <div class="empty-state">
                    <i class="codicon codicon-extensions"></i>
                    <p>No companions currently active</p>
                    <p class="hint">Companions extend NeuroPilot's functionality</p>
                </div>
                :
                <div class="companions-list">
                    {companionList.map(companion =>
                        <div key={companion.name} class="companion-card">
                            <div class="companion-header">
                                <div class="companion-info">
                                    <h4 class="companion-name">{companion.name}</h4>
                                    <span class="companion-author">by {companion.author}</span>
                                </div>
                                {companion.docs &&
                                    <a
                                        href={companion.docs}
                                        class="docs-link"
                                        title="View documentation"
                                    >
                                        <i class="codicon codicon-book"></i>
                                    </a>
                                }
                            </div>
                            {companion.contributes.length > 0 &&
                                <div class="contributions">
                                    <span class="contributions-label">Provides:</span>
                                    <ul class="contributions-list">
                                        {companion.contributes.map(contribution =>
                                            <li key={contribution} class="contribution-item">
                                                <i class="codicon codicon-check"></i>
                                                <span>{contributionLabels[contribution] || contribution}</span>
                                            </li>,
                                        )}
                                    </ul>
                                </div>
                            }
                        </div>,
                    )}
                </div>
            }
        </div>
    );
}

render(<CompanionsView />, document.getElementById('root')!);
