import * as vscode from 'vscode';
import { PromptGenerator } from './client_helpers';

export interface RCECancelEventInitializer<T = unknown> {
    /** The reason that will be used to send to Neuro-sama. */
    reason?: PromptGenerator;
    /** The reason that will be used to log the cancellation. */
    logReason?: PromptGenerator;
    /** Events that will trigger the cancellation. If the predicate is null, the event will always trigger the cancellation. */
    events?: [vscode.Event<T>, ((data: T) => boolean | Promise<boolean>) | null][];
}

/** Still need to figure out some problems... */
export interface RCECancelEvent<T = unknown> {
    /**
     * Publicly-exposed event.
     */
    readonly event: vscode.Event<T>;

    /**
     * Event disposable using {@link vscode.Disposable VS Code's Disposable class}.
     */
    readonly disposable: vscode.Disposable;

    /**
     * The reason that will be used to send to Neuro-sama.
     */
    readonly reason?: PromptGenerator;

    /**
     * The reason that will be used to log the cancellation.
     */
    readonly logReason?: PromptGenerator;

    /**
     * Fires the event.
     * @param data The data to provide in the fire.
     */
    fire(data: T): void;
}
