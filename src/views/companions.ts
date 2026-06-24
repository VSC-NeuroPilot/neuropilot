import { BaseWebviewViewProvider } from './base';
import { onDidCompanionChange } from '@events/companions';
import { registry } from '@/plugins';
import { NEURO } from '@/constants';
import { ViewMessage, ViewProviderMessage } from '@typing/views/companions';

export class CompanionsViewProvider extends BaseWebviewViewProvider<ViewMessage, ViewProviderMessage> {
    static readonly viewId: string = 'neuropilot.companionsView';
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
