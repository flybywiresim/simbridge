
import { Controller, Get } from '@nestjs/common';

@Controller('dashboard')
export class DashboardController {
  @Get()
  findAll(): string {
    return 'This action returns all cats';
  }
}
