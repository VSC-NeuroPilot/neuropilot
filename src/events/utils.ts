import * as vscode from 'vscode';
import { PromptGenerator } from '../rce';

export interface RCECancelEventInitializer<T = unknown> {
    /** The reason that will be used to send to Neuro-sama. */
    reason?: PromptGenerator;
    /** The reason that will be used to log the cancellation. */
    logReason?: PromptGenerator;
    /** Events that will trigger the cancellation. If the predicate is null, the event will always trigger the cancellation. */
    events?: [vscode.Event<T>, ((data: T) => boolean | Promise<boolean>) | null][];
}

export class RCECancelEvent<T = unknown> {
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
    public readonly reason?: PromptGenerator;

    /**
     * The reason that will be used to log the cancellation.
     */
    public readonly logReason?: PromptGenerator;

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
