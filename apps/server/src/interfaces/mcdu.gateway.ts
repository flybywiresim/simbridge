import { Inject, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, WebSocket } from 'ws';
import { PrinterService } from '../utilities/printer.service';
import serverConfig from '../config/server.config';
import { NetworkService } from '../utilities/network.service';

@WebSocketGateway({
  cors: { origin: '*' },
  path: '/interfaces/v1/mcdu',
})
export class McduGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  constructor(
    @Inject(serverConfig.KEY) private serverConf: ConfigType<typeof serverConfig>,
    private printerService: PrinterService,
    private networkService: NetworkService,
  ) {}

  private readonly logger = new Logger(McduGateway.name);

  @WebSocketServer() server: Server;

  private simulatorClient: WebSocket | undefined;

  async afterInit(server: Server) {
    this.server = server;
    this.logger.log('Remote MCDU websocket initialised');
    this.logger.log(
      `Initialised websocket gateway on ws://${await this.networkService.getLocalIp(true)}:${this.serverConf.port}${server.path}`,
    );
  }

  handleConnection(client: WebSocket) {
    this.logger.log('Client connected');
    client.on('message', (message: Buffer) => {
      const messageString = message.toString();
      if (messageString === 'mcduConnected') {
        this.logger.log('Simulator connected');
        this.simulatorClient = client;
      }
      this.server.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(messageString);
        }
      });
      if (messageString.startsWith('print:')) {
        const { lines } = JSON.parse(messageString.substring(6));
        this.printerService.print(lines);
      }
    });
  }

  handleDisconnect(client: WebSocket) {
    this.logger.log('Client disconnected');
    if (client === this.simulatorClient) {
      this.logger.log('Simulator disconnected');
      this.simulatorClient = undefined;
      this.server.clients.forEach((remainingClient) => {
        if (remainingClient.readyState === WebSocket.OPEN) {
          remainingClient.send('mcduDisconnected');
        }
      });
    }
  }
}
