/* eslint-disable @typescript-eslint/no-explicit-any */
import type { JSONSchema7Object } from 'json-schema';
import { Disposable, Progress, Event } from 'vscode';
import type { ActionValidationResult, RCEAction } from './types';
import type { ActionData } from 'neuro-game-sdk';

//#region RCE context

export type RCEStorage = Record<string | number | symbol, unknown>;

export type ActionStatus = 'pending' | 'success' | 'failure' | 'denied' | 'exception' | 'timeout' | 'schema' | 'cancelled';

export interface RCELifecycleMetadata {
    events?: Disposable[];
    preview?: { dispose: () => unknown };
    validatorResults?: {
        sync?: ActionValidationResult[];
    };
    setupHooks?: boolean;
}

export type SimplifiedStatusUpdateHandler = (status: ActionStatus, message?: string) => void;

export interface RCERequestState {
    prompt: string;
    notificationVisible: boolean;
    attachNotification: (progress: Progress<{ message?: string; increment?: number }>) => Promise<void>;
    resolve: () => void;
    resolved: boolean;
    interval?: NodeJS.Timeout | null;
    timeout?: NodeJS.Timeout | null;
}

/**
 * RCE executes the methods of {@link RCEAction} (and therefore passes the context object) in the following order:
 * 1. Setup hooks
 * 2. Validators (sync)
 * 3. Cancel events setup
 * 4. Prompt Generator
 * 5. Preview effects
 * 6. Some arbitrary time in between here, event listeners for cancel events may also be fired, and the predicate will receive the context object as well.
 * 7. Handler
 */
export interface RCEContext<T extends JSONSchema7Object | undefined = any, K = any> extends Disposable {
    name: string;
    createdAt: string;

    data: ActionData<T>;
    action: RCEAction<T, K>;
    readonly forced: boolean;

    /** Lifecycle-specific data */
    readonly lifecycle: RCELifecycleMetadata;
    /** Request-specific data (copilot mode only) */
    request?: RCERequestState;
    /**
     * Ephemeral storage.
     * Can be used to store data that needs to be accessed across different lifecycle stages of
     * the action (validation, preview, handler), so that it doesn't need to be regenerated in 
     * each stage.
     * This data does not persist across different executions.
     */
    storage?: RCEStorage;
    /**
     * Updates the status of the action on the action execution history panel
     * @param status The new status to update to
     * @param message Message to update the status with
     */
    readonly updateStatus: SimplifiedStatusUpdateHandler;

    /**
     * Marks this context object as done and destroys it.
     * In normal circumstances you SHOULD NOT BE CALLING THIS FUNCTION, as RCE already handles this for you.
     * @param success Whether or not the action attempted that spawned this context was successful.
     */
    done(success: boolean): void;

    /**
     * Clears request timers and cancel events before handler execution.
     * This prevents timers/events from triggering during async handler execution.
     * You usually shouldn't need to call this, but there is no harm in doing so one or more times.
     */
    clearPreHandlerResources(): void;
}

//#endregion

//#region RCE cancel events

export type ReasonGenerator<T = any> = string | ((context: RCEContext, data: T) => string);

export interface RCECancelEventInitializer<T = any> {
    /** The reason that will be used to send to Neuro-sama. */
    reason?: ReasonGenerator<T>;
    /** The reason that will be used to log the cancellation. */
    logReason?: ReasonGenerator<T>;
    /** Events that will trigger the cancellation. If the predicate is null, the event will always trigger the cancellation. */
    events?: [Event<T>, ((data: T) => boolean | Promise<boolean>) | null][];
}

export class RCECancelEvent<T = any> {
    /**
     * Publicly-exposed event.
     */
    public readonly event: Event<T>;

    /**
     * Event disposable using {@link Disposable VS Code's Disposable class}.
     */
    public readonly disposable: Disposable;

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
    public fire(data: T): void;

    /**
     * Creates an instance of RCECancelEvent.
     * @param init Initialization parameters.
     */
    constructor(init?: RCECancelEventInitializer<T>);
}

//#endregion
