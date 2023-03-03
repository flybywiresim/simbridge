import { Logger } from '@nestjs/common/services/logger.service';

export class Logging {
    constructor(private logger: Logger) {}

    public info(message: string): void {
        this.logger.log(message);
    }

    public warn(message: string): void {
        this.logger.warn(message);
    }

    public error(message: string): void {
        this.logger.error(message);
    }
}
