import { render } from 'preact';
import { useState, useEffect, useMemo } from 'preact/hooks';
import type { ViewProviderMessage } from '@/views/companions';
import type { CompanionContributions } from '@vsc-neuropilot/api-types';

interface CompanionInfo {
    name: string;
    author: string;
    docs: string;
    contributions: CompanionContributions[];
}

interface State {
    companions: Record<string, CompanionInfo>;
}

const contributionLabels: Record<CompanionContributions, string> = {
    'actions:manage': 'Manage its own actions',
    'actions:manage_others': 'Manage other companions\' actions',
    'actions:inject': 'Inject into vanilla actions',
    'actions:process': 'Process actions by Neuro',
    'actions:force': 'Force actions from Neuro',
    'changelog': 'Provide changelogs',
    'context': 'Send context to Neuro',
    'cursor:get': 'View Neuro\'s cursor',
    'cursor:set': 'Move Neuro\'s cursor',
    'images': 'Add images to the image carousel',
};

function CompanionsView() {
    const vscode = useMemo(acquireVsCodeApi<State>, []);
    const oldState = useMemo(vscode.getState, [vscode]);
    const [companions, setCompanions] = useState<Record<string, CompanionInfo>>(oldState?.companions ?? {});

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
                            name: message.name,
                            author: message.author,
                            docs: message.docs,
                            contributions: message.contributions,
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
                            {companion.contributions.length > 0 &&
                                <div class="contributions">
                                    <span class="contributions-label">Provides:</span>
                                    <ul class="contributions-list">
                                        {companion.contributions.map(contribution =>
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
