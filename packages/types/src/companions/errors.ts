import { CompanionContributions } from './register';

export class BaseCompanionError extends Error {
    readonly causedBy: string;
    readonly companion?: string;
    readonly feature: string;
    constructor(feature: string, error?: string, cause = 'Unknown cause.', companion?: string) {
        super(error);
        this.feature = feature;
        this.causedBy = cause;
        this.companion = companion;
    };
};

export class RegistryError extends BaseCompanionError {
    constructor(error?: string, cause = 'Unknown cause.', companion?: string) {
        super('companion registry', error, cause, companion);
    };
}

export class PermissionError extends BaseCompanionError {
    /**
     * The required contribution point to be allowed to perform this action.
     */
    readonly contributions: string[];
    constructor(feature: string, contributions: CompanionContributions[], error?: string, companion?: string) {
        super(feature, error, `${feature} without declaring any of these contributions: "${contributions.join('", "')}"`, companion);
        this.contributions = contributions;
    }
}
