import { Module } from '@nestjs/common';
import { McduGateway } from './mcdu.gateway';

@Module({ providers: [McduGateway] })
export class InterfacesModule {}
