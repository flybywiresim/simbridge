import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HttpModule } from '@nestjs/axios';
import { UtilitiesModule } from '../utilities/utilities.module';
import { HealthController } from './health.controller';

@Module({ imports: [HttpModule, TerminusModule, UtilitiesModule], controllers: [HealthController] })
export class HealthModule {}
