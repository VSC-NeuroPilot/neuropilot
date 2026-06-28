import * as vscode from 'vscode';

import type { RCECancelEventInitializer, ReasonGenerator, RCECancelEvent as _RCECancelEvent } from '@vsc-neuropilot/api-types';

export class RCECancelEvent<T = unknown> implements _RCECancelEvent<T> {
    /**
     * Private emitter constructed by the class constructor.
     */
    private readonly emitter: vscode.EventEmitter<T>;

    /**
     * Publicly-exposed event.
     */
    public readonly event: vscode.Event<T>;

    /**
     * Event disposable using {@link vscode.Disposable VS Code's Disposable class}.
     */
    public readonly disposable: vscode.Disposable;

    /**
     * The reason that will be used to send to Neuro-sama.
     */
    public readonly reason?: ReasonGenerator<T>;

    /**
     * The reason that will be used to log the cancellation.
     */
    public readonly logReason?: ReasonGenerator<T>;

    /**
     * Fires the event.
     * @param data The data to provide in the fire.
     */
    public fire(data: T): void {
        this.emitter.fire(data);
        this.disposable.dispose();
    }

    /**
     * Creates an instance of RCECancelEvent.
     * @param init Initialization parameters.
     */
    constructor(init?: RCECancelEventInitializer<T>) {
        this.emitter = new vscode.EventEmitter<T>();
        this.event = this.emitter.event;

        // Subscribe to all events
        const disposables: vscode.Disposable[] = [];
        for (const [event, predicate] of init?.events ?? []) {
            disposables.push(
                event(async (data) => {
                    if (predicate === null || await predicate(data)) {
                        this.fire(data);
                    }
                }),
            );
        }

        // Clean up all disposables when this is disposed
        this.disposable = vscode.Disposable.from(...disposables, this.emitter);

        this.reason = init?.reason;
        this.logReason = init?.logReason;
    }
}

export function createRCECancelEvent<const TEventData>(init?: RCECancelEventInitializer<TEventData>): RCECancelEvent<TEventData> {
    return new RCECancelEvent<TEventData>(init);
}
