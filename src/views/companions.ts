import { CompanionContributions } from '@vsc-neuropilot/api-types';

import { BaseWebviewViewProvider, Message } from './base';
import { onDidCompanionChange } from '@events/companions';
import { registry } from '@/plugins';
import { NEURO } from '@/constants';

export type ViewProviderMessage = {
    type: 'enabled';
    name: string;
    author: string;
    docs: string;
    contributions: CompanionContributions[];
} | {
    type: 'disabled';
    name: string;
};

export interface ViewMessage extends Message {
    type: 'disconnect'
    name: string;
}

export class CompanionsViewProvider extends BaseWebviewViewProvider<ViewMessage, ViewProviderMessage> {
    constructor() {
        super('companions/main.js', ['companions/style.css']);
        const event = onDidCompanionChange((c) => {
            if (c.enabled) {
                const enabledCompanion = Object.values(registry).find((m) => m.name === c.name)!;
                this.postMessage({
                    type: 'enabled',
                    name: c.name,
                    author: enabledCompanion.author,
                    docs: enabledCompanion.docs,
                    contributions: enabledCompanion.contributes,
                });
            } else {
                this.postMessage({
                    type: 'disabled',
                    name: c.name,
                });
            }
        });
        NEURO.context!.subscriptions.push(
            event,
        );
    }

    protected onViewReady(): void | Promise<void> {
        const companions = Object.values(registry);
        for (const c of companions) {
            this.postMessage({
                type: 'enabled',
                name: c.name,
                author: c.author,
                docs: c.docs,
                contributions: c.contributes,
            });
        }
    }

    protected handleMessage(_message: ViewMessage): void {}
}
