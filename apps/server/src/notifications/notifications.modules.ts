import { Module } from '@nestjs/common';
import { PlatformChannel } from './platform.channel';

@Module({
    providers: [PlatformChannel],
    exports: [PlatformChannel],
})
export class NotificationsModule {}
