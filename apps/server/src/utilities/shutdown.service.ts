import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Subject } from 'rxjs';

@Injectable()
export class ShutDownService implements OnModuleDestroy {
    private readonly logger = new Logger(ShutDownService.name);

    private shutdownListener: Subject<void> = new Subject();

    onModuleDestroy() {
        this.logger.log(`Destroying ${ShutDownService.name}`);
    }

    subscribeToShutdown(shutdownFn: () => void): void {
        this.shutdownListener.subscribe(() => shutdownFn());
    }

    // Emit the shutdown event
    shutdown() {
        this.shutdownListener.next();
    }
}
