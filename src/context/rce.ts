import type { JSONSchema7Object } from 'json-schema';
import type { ActionValidationResult, RCEAction } from '@/utils/neuro_client';
import type { ActionData } from 'neuro-game-sdk';
import { Disposable, Progress } from 'vscode';
import { ActionStatus, updateActionStatus } from '@events/actions';
import { getAction } from '@/rce';

export type RCEStorage = Record<string | number | symbol, unknown>;

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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class RCEContext<T extends JSONSchema7Object | undefined = any, K = any> extends Disposable {
    name: string;
    private success: boolean | null;
    createdAt: string = new Date().toLocaleTimeString();

    data: ActionData<T>;
    action: RCEAction<T, K>;
    readonly forced: boolean;

    /** Lifecycle-specific data */
    readonly lifecycle: RCELifecycleMetadata = {};
    /** Request-specific data (copilot mode only) */
    request?: RCERequestState;
    /**
     * Ephemeral storage.
     * Can be used to store data that needs to be accessed across different lifecycle stages of
     * the action (validation, preview, handler), so that it doesn't need to be regenerated in 
     * each stage.
     * This data does not persist across different executions.
     */
    public storage?: RCEStorage;
    private _updateStatus: SimplifiedStatusUpdateHandler = (status: ActionStatus, message?: string) => updateActionStatus(this.data, status, message);
    /**
     * Updates the status of the action on the action execution history panel
     * @param status The new status to update to
     * @param message Message to update the status with
     */
    readonly updateStatus: SimplifiedStatusUpdateHandler = (status: ActionStatus, message?: string) => this._updateStatus(status, message);

    constructor(data: ActionData<T>, forced = false) {
        super(() => {
            // Clear timers and cancel events
            this.clearPreHandlerResources();

            // Dispose preview
            this.lifecycle.preview?.dispose();

            // Resolve and clear request
            this.request?.resolve();
            this.request = undefined;

            // Now clear lifecycle metadata and other fields.
            for (const k in this.lifecycle) {
                this.lifecycle[k as keyof typeof this.lifecycle] = undefined;
            }
            this.storage = undefined;
            this.data = {} as never;
            this.action = {} as never;
            this._updateStatus = (_status, _message) => undefined;
        });
        this.data = data;
        this.action = getAction(data.name)!;
        this.name = data.name;
        this.success = null;
        this.storage = {};
        this.forced = forced;
    }

    /**
     * Marks this context object as done and destroys it.
     * In normal circumstances you SHOULD NOT BE CALLING THIS FUNCTION, as RCE already handles this for you.
     * @param success Whether or not the action attempted that spawned this context was successful.
     */
    done(success: boolean): void {
        if (this.success !== null) throw new Error('Context object already destroyed!');
        this.success = success;
        this.dispose();
    };

    /**
     * Clears request timers and cancel events before handler execution.
     * This prevents timers/events from triggering during async handler execution.
     * Should be called immediately before invoking the handler.
     */
    clearPreHandlerResources(): void {
        // Clear timers
        if (this.request?.interval) {
            clearInterval(this.request.interval);
            this.request.interval = null;
        }
        if (this.request?.timeout) {
            clearTimeout(this.request.timeout);
            this.request.timeout = null;
        }

        // Dispose cancel events
        if (this.lifecycle.events) {
            for (const event of this.lifecycle.events) {
                event.dispose();
            }
            this.lifecycle.events = undefined;
        }
    }
}
