import * as vscode from 'vscode';
import { PromptGenerator } from '../rce';

export interface RCECancelEventInitializer {
    /** The reason that will be used to send to Neuro-sama. */
    reason?: PromptGenerator;
    /** The reason that will be used to log the cancellation. */
    logReason?: PromptGenerator;
    /** Events that will trigger the cancellation. If the predicate is null, the event will always trigger the cancellation. */
    events?: [vscode.Event<unknown>, ((data: unknown) => boolean | Promise<boolean>) | null][];
}

export class RCECancelEvent {
    /**
     * Private emitter constructed by the class constructor.
     */
    private readonly emitter: vscode.EventEmitter<unknown>;

    /**
     * Publicly-exposed event.
     */
    public readonly event: vscode.Event<unknown>;

    /**
     * Event disposable using {@link vscode.Disposable VS Code's Disposable class}.
     */
    public readonly disposable: vscode.Disposable;

    /**
     * The reason that will be used to send to Neuro-sama.
     */
    public readonly reason?: PromptGenerator;

    /**
     * The reason that will be used to log the cancellation.
     */
    public readonly logReason?: PromptGenerator;

    /**
     * Fires the event.
     * @param data The data to provide in the fire.
     */
    public fire(data: unknown): void {
        this.emitter.fire(data);
        this.disposable.dispose();
    }

    /**
     * Creates an instance of RCECancelEvent.
     * @param init Initialization parameters.
     */
    constructor(init?: RCECancelEventInitializer) {
        this.emitter = new vscode.EventEmitter<never>();
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
