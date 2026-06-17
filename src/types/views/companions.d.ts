import { CompanionMetaWithName } from '@/plugins/utility-types';
import { Message } from '@typing/views';

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