export interface NeuroMessage {
    id: string;
    content: string;
    timestamp: Date;
    type: 'request' | 'response' | 'notification';
    metadata?: Record<string, unknown>;
}
