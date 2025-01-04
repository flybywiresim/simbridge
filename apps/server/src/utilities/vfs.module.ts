import { Module } from '@nestjs/common';
import { VfsController } from './vfs.controller';
import { VfsService } from './vfs.service';

@Module({
  controllers: [VfsController],
  providers: [VfsService],
  exports: [VfsService],
})
export class VfsModule {}
