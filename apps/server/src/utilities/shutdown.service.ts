import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Subject } from 'rxjs';

@Injectable()
export class ShutDownService implements OnModuleDestroy {
    private readonly logger = new Logger(ShutDownService.name);

    private shutdownListener$: Subject<void> = new Subject();

    // Your hook will be executed
    onModuleDestroy() {
        this.logger.log('ShutDown Service being destroyed');
    }

    // Subscribe to the shutdown in your main.ts
    subscribeToShutdown(shutdownFn: () => void): void {
        this.shutdownListener$.subscribe(() => shutdownFn());
    }

    // Emit the shutdown event
    shutdown() {
        this.shutdownListener$.next();
    }
}
