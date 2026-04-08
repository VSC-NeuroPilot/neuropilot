import { EventEmitter } from 'vscode';

const companionChangeEvent = new EventEmitter<{ name: string; }>();

export function fireCompanionChangeEvent(name: string) {
    companionChangeEvent.fire({ name });
}

export const onDidCompanionChange = companionChangeEvent.event;
