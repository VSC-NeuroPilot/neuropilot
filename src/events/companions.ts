import { Disposable, EventEmitter } from 'vscode';

interface CompanionChangeEvent {
    name: string;
    enabled: boolean;
}

const companionChangeEvent = new EventEmitter<CompanionChangeEvent>();

export function fireCompanionChangeEvent(data: CompanionChangeEvent) {
    companionChangeEvent.fire(data);
}

export const onDidCompanionChange = companionChangeEvent.event;
export const companionChangeEmitterDisposable = Disposable.from(companionChangeEvent);
