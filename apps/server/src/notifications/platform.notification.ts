import { Type } from '@nestjs/common';
import { INestjsNotificationChannel, NestJsNotification } from '@sinuos/nestjs-notification';
import { PlatformChannel } from './platform.channel';

export interface platformDataFormat {
    message: String
}

export class ErrorNotification implements NestJsNotification {
    private data: platformDataFormat;

    constructor(data: platformDataFormat) {
        this.data = data;
    }

    public sendToChannels(): Type<INestjsNotificationChannel>[] {
        return [
            PlatformChannel,
        ];
    }

    toPayload?(): Record<string, any> {
        return { message: this.data.message };
    }
}
