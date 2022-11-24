import { Controller, Get, Inject, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import {
    HealthCheckService,
    HttpHealthIndicator,
    HealthCheck,
} from '@nestjs/terminus';
import { ShutDownService } from '../utilities/shutdown.service';
import serverConfig from '../config/server.config';

@ApiTags('HEALTH')
@Controller('health')
export class HealthController {
    constructor(
    @Inject(serverConfig.KEY) private serverConf: ConfigType<typeof serverConfig>,
    private health: HealthCheckService,
    private http: HttpHealthIndicator,
    private shutdownService: ShutDownService,
    ) {}

    private readonly logger = new Logger(HealthController.name);

    @Get()
    @HealthCheck()
    @ApiResponse({ description: 'The status of the different services' })
    checkServices() {
        return this.health.check([
            () => this.http.pingCheck('mcdu', `http://localhost:${this.serverConf.port}/interfaces/mcdu`),
            () => this.http.pingCheck('api', `http://localhost:${this.serverConf.port}/api`),
        ]);
    }

    // Is this safe?
    @Get('/kill')
    @ApiResponse({
        status: 200,
        description: 'Kills the server',
    })
    killApp() {
        this.logger.log('Server shutting down via endpoint call');
        this.shutdownService.shutdown();
    }
}
