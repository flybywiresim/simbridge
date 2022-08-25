import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';

@Injectable()
export class ShutDownService implements OnApplicationShutdown {
  private readonly logger = new Logger(ShutDownService.name);

  onApplicationShutdown(signal: string) {
      this.logger.log(`Application shutting down with signal: ${signal}`);
      // Handle all graceful kill events
  }
}
