import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { SysTrayService } from 'apps/server/src/utilities/systray.service';

@Injectable()
export class ShutDownService implements OnApplicationShutdown {
  private readonly logger = new Logger(ShutDownService.name);

  constructor(private systrayService: SysTrayService) {}

  onApplicationShutdown(signal: string) {
      this.logger.log(`Application shutting down with signal: ${signal}`);
      // Handle all graceful kill events
      this.systrayService.kill();
  }
}
