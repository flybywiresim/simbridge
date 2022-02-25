import { Logger } from '@nestjs/common';
import { MessageBody, OnGatewayConnection, OnGatewayInit, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, WebSocket } from 'ws';

@WebSocketGateway({
    cors: { origin: '*' },
    path: '/interfaces/mcdu',
})
export class McduGateway implements OnGatewayInit, OnGatewayConnection {
    private readonly logger = new Logger(McduGateway.name);

    @WebSocketServer() server: Server

    @SubscribeMessage('message')
    handleMessage(@MessageBody() message: string) {
        this.logger.debug(`Received message: ${message}`);
        if (message === 'mcduConnected') {
            this.logger.log('Simulator Connected');
        }
        this.server.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    }

    afterInit(server: Server) {
        this.server = server;
        this.logger.log(`MCDU Socket Server initialised on ${server.path} ${server.options.port}`);
    }

    handleConnection(_client: WebSocket) {
        this.logger.log('Client connected');
    }
}
