import { Module } from '@nestjs/common';
import { UtilitiesModule } from '../utilities/utilities.module';
import { McduGateway } from './mcdu.gateway';
import { RemoteAppGateway } from './remote-app.gateway';
import { VfsModule } from '../utilities/vfs.module';

@Module({
  imports: [UtilitiesModule, VfsModule],
  providers: [McduGateway, RemoteAppGateway],
})
export class InterfacesModule {}
