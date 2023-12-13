import { Logger } from '@nestjs/common/services/logger.service';
import { Logger as ProcessingLogger } from './logger';

export class NestLogger implements ProcessingLogger {
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
