import { Module } from '@nestjs/common';
import { UtilitiesModule } from '../utilities/utilities.module';
import { McduGateway } from './mcdu.gateway';
import { RemoteAppGateway } from './remote-app.gateway';

@Module({
  imports: [UtilitiesModule],
  providers: [McduGateway, RemoteAppGateway],
})
export class InterfacesModule {}
