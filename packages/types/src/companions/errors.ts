import { Contributions } from './enum';

/**
 * The base class for all errors caused by companions.
 * Usually this class is extended by other classes that are thrown by NeuroPilot,
 * but there may also be cases where this class is used directly.
 * 
 * If you're wanting to ensure that errors are coming from NeuroPilot, simply check if the error is an instance of this class.
 */
export class BaseCompanionError extends Error {
    /**
     * An explanation of the cause that led to the error.
     */
    readonly causedBy: string;
    /**
     * The companion that caused the error.
     */
    readonly companion?: string;
    /**
     * The feature that caused the error.
     */
    readonly feature: string;
    constructor(feature: string, error?: string, cause = 'Unknown cause.', companion?: string) {
        super(error);
        this.feature = feature;
        this.causedBy = cause;
        this.companion = companion;
    };
};

/**
 * This class being thrown means that there was an error with the companion registry.
 */
export class CompanionRegistryError extends BaseCompanionError {
    constructor(error?: string, cause = 'Unknown cause.') {
        super('Companion registry', error, cause);
    };
}

export class PermissionError extends BaseCompanionError {
    /**
     * The list of contribution points that allow performing this action.
     */
    readonly contributions: string[];
    constructor(feature: string, contributions: Contributions[], error?: string) {
        super(feature, error, `${feature} without declaring any of these contributions: "${contributions.join('", "')}"`);
        this.contributions = contributions;
    }
}
