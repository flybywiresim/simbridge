import { ApiTags } from '@nestjs/swagger';
import { Controller, Get, HttpException, HttpStatus, Param, Res, Response, StreamableFile } from '@nestjs/common';
import { contentType } from 'mime-types';
import { VfsService } from './vfs.service';
import * as path from 'node:path';
import { ExpressAdapter } from '@nestjs/platform-express';
import { HttpAdapterHost } from '@nestjs/core';

@ApiTags('VFS')
@Controller('api/v1/remote-app/vfs-proxy')
export class VfsController {
  constructor(
    private readonly vfsService: VfsService,
    private readonly httpAdapterHost: HttpAdapterHost<ExpressAdapter>,
  ) {}

  @Get('/:filePath(*)')
  async getFile(@Param('filePath') filePath: string, @Res({ passthrough: true }) res: Response) {
    if (this.vfsService.requestFile === null) {
      throw new HttpException(
        'The VFS service is not ready to serve files at this moment. Is an airplane client connected to the remote bridge?',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const ext = path.extname(filePath);

    if (ext === '') {
      throw new HttpException('Malformed request: Could not find a file extension', HttpStatus.BAD_REQUEST);
    }

    const contentTypeHeader = contentType(ext);

    if (contentTypeHeader === false) {
      throw new HttpException('Malformed request: Could not find a valid file extension', HttpStatus.BAD_REQUEST);
    }

    const data = await this.vfsService.requestFile(filePath);

    this.httpAdapterHost.httpAdapter.setHeader(res, 'Content-Type', contentTypeHeader);

    return new StreamableFile(data);
  }
}
