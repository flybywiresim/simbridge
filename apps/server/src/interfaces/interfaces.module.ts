import { Module } from '@nestjs/common';
import { UtilitiesModule } from '../utilities/utilities.module';
import { McduGateway } from './mcdu.gateway';

@Module({
    imports: [UtilitiesModule],
    providers: [McduGateway],
})
export class InterfacesModule {}
