import { OnGatewayConnection, OnGatewayInit, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Inject, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Server, WebSocket } from 'ws';
import serverConfig from '../config/server.config';
import { NetworkService } from '../utilities/network.service';
import { protocolV0 } from '@flybywiresim/remote-bridge-types';

type ClientType = 'aircraft' | 'remote';

interface RemoteBridgeConnection {
  type: ClientType;
  clientName: string;
  clientID: string;
}

@WebSocketGateway({
  cors: { origin: '*' },
  path: '/interfaces/v1/remote-app',
})
export class RemoteAppGateway implements OnGatewayInit, OnGatewayConnection {
  constructor(
    @Inject(serverConfig.KEY) private serverConf: ConfigType<typeof serverConfig>,
    private networkService: NetworkService,
  ) {}

  private readonly logger = new Logger(RemoteAppGateway.name);

  @WebSocketServer() server: Server;

  async afterInit(server: Server) {
    this.server = server;
    this.logger.log('Remote app gateway websocket initialised');
    this.logger.log(
      `Initialised on http://${await this.networkService.getLocalIp(true)}:${this.serverConf.port}${server.path}`,
    );
  }

  private readonly sessions = new Map<WebSocket, RemoteBridgeConnection>();

  handleConnection(client: WebSocket) {
    this.logger.log('Client connected');

    this.sendMessage(client, {
      type: 'protocolGatewayIntroductionMessage',
      server: `SimBridge v0.5.2`,
      minProtocolVersion: 0,
      maxProtocolVersion: 0,
      heartbeatMinInterval: 2_000,
      heartbeatMaxInterval: 5_000,
      messageMaxSizeBytes: 1024 * 1024, // 1 MiB
      fromClientID: 'gateway',
    });

    client.on('message', (message: Buffer) => {
      const json = JSON.parse(message.toString());

      if (!('type' in json)) {
        return;
      }

      const existingSession = this.sessions.get(client);

      const msg: protocolV0.Messages = json;

      if (!existingSession && msg.type !== 'remoteSignin' && msg.type !== 'aircraftSignin') {
        client.send(
          JSON.stringify({
            type: 'error',
            code: 2000,
            message: "Cannot send any other messages than 'remoteSignin' or 'aircraftSignin' before signing in",
          }),
        );
        return;
      }

      switch (msg.type) {
        case 'aircraftSignin': {
          this.logger.log(`Aircraft client signed in (clientName='${msg.clientName}')`);
          this.sessions.set(client, { type: 'aircraft', clientName: msg.clientName, clientID: msg.fromClientID });

          this.broadcastMessage(msg, msg.fromClientID, 'remote');
          break;
        }
        case 'remoteSignin': {
          this.logger.log(`Remote client signed in (clientName='${msg.clientName}')`);
          this.sessions.set(client, { type: 'remote', clientName: msg.clientName, clientID: msg.fromClientID });

          this.broadcastMessage(msg, msg.fromClientID, 'aircraft');
          break;
        }
        default: {
          const session = this.sessions.get(client);

          if (!session) {
            break;
          }

          this.broadcastMessage(msg, session.clientID, session.type === 'remote' ? 'aircraft' : 'remote');
        }
      }
    });

    client.on('close', () => {
      const session = this.sessions.get(client);

      this.logger.log(`Session closed (type=${session?.type ?? '<no session>'})`);
      this.sessions.delete(client);

      if (session && session.type === 'aircraft') {
        this.broadcastMessage(
          { type: 'aircraftClientDisconnect', clientID: session.clientID, fromClientID: 'gateway' },
          session.clientID,
          'remote',
        );
      } else if (session) {
        this.broadcastMessage(
          { type: 'remoteClientDisconnect', clientID: session.clientID, fromClientID: 'gateway' },
          session.clientID,
          'aircraft',
        );
      }
    });
  }

  private broadcastMessage(message: protocolV0.Messages, excludeClientID?: string, toSessionType?: ClientType) {
    for (const [ws, session] of this.sessions) {
      if (excludeClientID !== undefined && session.clientID === excludeClientID) {
        continue;
      }

      if (toSessionType !== undefined && session.type !== toSessionType) {
        continue;
      }

      this.sendMessage(ws, message);
    }
  }

  private sendMessage(ws: WebSocket, message: protocolV0.Messages) {
    ws.send(JSON.stringify(message));
  }
}
