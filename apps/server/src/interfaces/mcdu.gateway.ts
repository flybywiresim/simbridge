import { Logger } from '@nestjs/common';
import { OnGatewayConnection, OnGatewayInit, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, WebSocket } from 'ws';

@WebSocketGateway({
    cors: { origin: '*' },
    path: '/interfaces/mcdu',
})
export class McduGateway implements OnGatewayInit, OnGatewayConnection {
    private readonly logger = new Logger(McduGateway.name);

    @WebSocketServer() server: Server

    afterInit(server: Server) {
        this.server = server;
        this.logger.log(`Initialised on http://localhost3838:${server.path}`);
    }

    handleConnection(client: WebSocket) {
        this.logger.log('Client connected');
        client.on('message', (message: String) => {
            if (message === 'mcduConnected') {
                console.clear();
                this.logger.log('Simulator connected');
            }
            this.server.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(message);
                }
            });
            if (message.startsWith('print:')) {
                this.logger.debug('Printer called');
                // TODO Implement this
            }
        });
    }
}
