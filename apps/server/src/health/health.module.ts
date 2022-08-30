import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HttpModule } from '@nestjs/axios';
import { HealthController } from './health.controller';
import { UtilitiesModule } from '../utilities/utilities.module';

@Module({ imports: [HttpModule, TerminusModule, UtilitiesModule], controllers: [HealthController] })
export class HealthModule {}
