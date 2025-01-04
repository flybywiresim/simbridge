import { OnGatewayConnection, OnGatewayInit, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Inject, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Server, WebSocket } from 'ws';
import serverConfig from '../config/server.config';
import { NetworkService } from '../utilities/network.service';
import { protocolV0 } from '@flybywiresim/remote-bridge-types';
import { VfsService } from '../utilities/vfs.service';
import { v4 } from 'uuid';

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
    private readonly vfsService: VfsService,
  ) {}

  private readonly logger = new Logger(RemoteAppGateway.name);

  @WebSocketServer() server: Server;

  private aircraftClient: WebSocket | null = null;

  async afterInit(server: Server) {
    this.server = server;
    this.logger.log('Remote app gateway websocket initialised');
    this.logger.log(
      `Initialised on http://${await this.networkService.getLocalIp(true)}:${this.serverConf.port}${server.path}`,
    );

    this.vfsService.requestFile = async (path) => {
      const data = await this.downloadFile(`/${path}`);

      return Buffer.from(data);
    };
  }

  private readonly sessions = new Map<WebSocket, RemoteBridgeConnection>();

  private awaitedMessagesTypesToKeys = new Map<string, string>();

  private queuedUnhandledMessages: protocolV0.Messages[] = [];

  private awaitedMessagesPromiseFns: Record<string, [(arg: any) => void, (arg: any) => void][]> = {};

  public async downloadFile(fileVfsPath: string): Promise<Uint8Array> {
    if (!this.aircraftClient) {
      throw new Error('Cannot download a file without an aircraft client');
    }

    const requestID = v4();

    try {
      this.sendMessage(this.aircraftClient, {
        type: 'remoteDownloadFile',
        requestID,
        fileVfsPath,
        fromClientID: 'gateway',
      });

      const chunks: Uint8Array[] = [];

      let doneDownloading = false;
      while (!doneDownloading) {
        const nextChunk = await this.awaitMessageOfType<protocolV0.AircraftSendFileChunkMessage>(
          'aircraftSendFileChunk',
          requestID,
        );

        if (nextChunk.requestID !== requestID) {
          continue;
        }

        console.log(
          `[RemoteClient](downloadFile) Received chunk #${nextChunk.chunkIndex + 1} / ${
            nextChunk.chunkCount
          } for request ${requestID}`,
        );

        const chunk = await (await fetch(`data:application/octet-stream;base64,${nextChunk.data}`))
          .arrayBuffer()
          .then((it) => new Uint8Array(it));

        chunks.push(chunk);

        if (nextChunk.chunkIndex === nextChunk.chunkCount - 1) {
          console.log(`[RemoteClient](downloadFile) Done downloading for request ${requestID}`);
          this.stopAwaitingMessages('aircraftSendFileChunk', requestID);
          doneDownloading = true;
        }
      }

      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.byteLength, 0);
      const mergedArray = new Uint8Array(totalLength);

      let offset = 0;
      for (const item of chunks) {
        mergedArray.set(item, offset);
        offset += item.length;
      }

      return mergedArray;
    } catch (e) {
      this.stopAwaitingMessages('aircraftSendFileChunk', requestID);
      throw e;
    }
  }

  private async awaitMessageOfType<M extends protocolV0.Messages>(
    type: M['type'] & string,
    uniqueKey: string,
  ): Promise<M> {
    if (this.awaitedMessagesTypesToKeys.has(type) && this.awaitedMessagesTypesToKeys.get(type) !== uniqueKey) {
      throw new Error(
        '[RemoteClient](awaitMessageOfType) Messages can only be awaited by one consumer at a time. Make sure to call stopAwaitingMessages after you are done handling messages',
      );
    }

    this.awaitedMessagesTypesToKeys.set(type, uniqueKey);

    const firstUnhandledMessagesIndex = this.queuedUnhandledMessages.findIndex((it) => it.type === type);

    if (firstUnhandledMessagesIndex !== -1) {
      const msg = this.queuedUnhandledMessages[firstUnhandledMessagesIndex];

      this.queuedUnhandledMessages.splice(firstUnhandledMessagesIndex, 1);

      return msg as M;
    }

    return new Promise((resolve, reject) => {
      let array = this.awaitedMessagesPromiseFns[type];
      if (!array) {
        array = this.awaitedMessagesPromiseFns[type] = [];
      }

      array.push([resolve, reject]);
    });
  }

  private stopAwaitingMessages(type: string, uniqueKey: string): void {
    if (this.awaitedMessagesTypesToKeys.get(type) === uniqueKey) {
      this.awaitedMessagesTypesToKeys.delete(type);
      return;
    }
  }

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

          this.aircraftClient = client;

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

      if (this.awaitedMessagesPromiseFns[msg.type]) {
        while (this.awaitedMessagesPromiseFns[msg.type].length > 0) {
          const [resolve] = this.awaitedMessagesPromiseFns[msg.type][0];

          resolve(msg);

          this.awaitedMessagesPromiseFns[msg.type].shift();
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

        this.aircraftClient = null;
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
