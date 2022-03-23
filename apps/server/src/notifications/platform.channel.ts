import { Injectable } from '@nestjs/common';
import { INestjsNotificationChannel, NestJsNotification } from '@sinuos/nestjs-notification';
import { notify } from 'node-notifier';
import { join } from 'path';

@Injectable()
export class PlatformChannel implements INestjsNotificationChannel {
    async send(notification: NestJsNotification): Promise<void> {
        notify({
            title: 'Test',
            message: notification.toPayload().message,
            sound: true,
            icon: join(__dirname, '..', '/assets/images/tail.png'),
        });
    }
}
