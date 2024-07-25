import { Inject, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { OnGatewayConnection, OnGatewayInit, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, WebSocket } from 'ws';
import { PrinterService } from '../utilities/printer.service';
import serverConfig from '../config/server.config';
import { NetworkService } from '../utilities/network.service';

@WebSocketGateway({
  cors: { origin: '*' },
  path: '/interfaces/v1/mcdu',
})
export class McduGateway implements OnGatewayInit, OnGatewayConnection {
  constructor(
    @Inject(serverConfig.KEY) private serverConf: ConfigType<typeof serverConfig>,
    private printerService: PrinterService,
    private networkService: NetworkService,
  ) {}

  private readonly logger = new Logger(McduGateway.name);

  @WebSocketServer() server: Server;

  async afterInit(server: Server) {
    this.server = server;
    this.logger.log('Remote MCDU websocket initialised');
    this.logger.log(
      `Initialised on http://${await this.networkService.getLocalIp(true)}:${this.serverConf.port}${server.path}`,
    );
  }

  handleConnection(client: WebSocket) {
    this.logger.log('Client connected');
    client.on('message', (message: string) => {
      if (message === 'mcduConnected') {
        this.logger.log('Simulator connected');
      }
      this.server.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });
      if (message.startsWith('print:')) {
        const { lines } = JSON.parse(message.substring(6));
        this.printerService.print(lines);
      }
    });
  }
}
