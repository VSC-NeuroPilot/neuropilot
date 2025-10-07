import * as vscode from 'vscode';
import { PromptGenerator } from './client_helpers';

export interface RCECancelEventInitializer {
    /** The reason that will be used to send to Neuro-sama. */
    reason?: PromptGenerator;
    /** The reason that will be used to log the cancellation. */
    logReason?: PromptGenerator;
    /** Events that will trigger the cancellation. If the predicate is null, the event will always trigger the cancellation. */
    events?: [vscode.Event<unknown>, ((data: unknown) => boolean | Promise<boolean>) | null][];
}

/** Still need to figure out some problems... */
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
    public fire(data: unknown): void;

    /**
     * Creates an instance of RCECancelEvent.
     * @param init Initialization parameters.
     */
    constructor(init?: RCECancelEventInitializer);
}
