abstract class AbstractPipeline {
    abstract readonly name: string;
}

export class ProductionPipeline extends AbstractPipeline {
    readonly name: string = 'production';
}
