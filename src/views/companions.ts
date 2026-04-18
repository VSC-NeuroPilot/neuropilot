import { BaseWebviewViewProvider, Message } from './base';
import { onDidCompanionChange } from '@events/companions';
import { registry } from '@/plugins';
import { NEURO } from '@/constants';
import { CompanionMetaWithName } from '@/plugins/utility-types';

interface CompanionEnabledViewProviderMessage extends CompanionMetaWithName, Message {
    type: 'enabled';
}

export type ViewProviderMessage = CompanionEnabledViewProviderMessage | {
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
                this.postMessage(
                    {
                        ...enabledCompanion,
                        type: 'enabled',
                    },
                );
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
                ...c,
            });
        }
    }

    protected handleMessage(_message: ViewMessage): void {}
}
