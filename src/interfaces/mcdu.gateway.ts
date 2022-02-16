import { Logger } from '@nestjs/common';
import { OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, WebSocket } from 'ws';

@WebSocketGateway({
    cors: { origin: '*' },
    path: '/interfaces/v1/mcdu',
    serveClient: true,
})
export class McduGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    private readonly logger = new Logger(McduGateway.name);

    @WebSocketServer() server: Server

    @SubscribeMessage('test')
    handleTest(client: WebSocket, payload: string): void {
        client.send(`Hello: ${payload}`);
    }

    async afterInit(server: Server): Promise<void> {
        this.logger.log(`MCDU interface initialized ${server.options}`);
    }

    async handleDisconnect(_client: WebSocket): Promise<void> {
        this.logger.log('Client disconnected');
    }

    async handleConnection(_client: WebSocket): Promise<void> {
        this.logger.log('Client connected');
    }
}
