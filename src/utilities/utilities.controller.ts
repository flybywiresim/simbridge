import { Controller, Get, Query, StreamableFile, Response } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { contentType } from 'mime-types';
import { FileService } from './file.service';

@ApiTags('UTILITIES')
@Controller('utility/v1')
export class UtiliyController {
    constructor(private fileService: FileService) {}

    @Get('pdf')
    @ApiResponse({
        status: 200,
        description: 'A Streamed PDF',
        type: StreamableFile,
    })
    async getPdf(@Query('filename') filename: string, @Response({ passthrough: true }) res): Promise<StreamableFile> {
        return this.fileService.getFileStream('resources/pdfs/', `${filename}`).then((file) => {
            res.set({
                'Content-Type': contentType(filename),
                'Content-Disposition': `attachment; filename=${filename}`,
            });
            return file;
        });
    }

    @Get('pdf/list')
    @ApiResponse({
        status: 200,
        description: 'An array of all the filenames within the pdfs folder',
        type: [String],
    })
    async getPdfFileList() {
        return this.fileService.getFolderFilenames('resources/pdfs/');
    }

    @Get('image')
    @ApiResponse({
        status: 200,
        description: 'A Streamed Image',
        type: StreamableFile,
    })
    async getImage(@Query('filename') filename: string, @Response({ passthrough: true }) res): Promise<StreamableFile> {
        return this.fileService.getFileStream('resources/images/', `${filename}`).then((file) => {
            res.set({
                'Content-Type': contentType(filename),
                'Content-Disposition': `attachment; filename=${filename}`,
            });
            return file;
        });
    }

    @Get('image/list')
    @ApiResponse({
        status: 200,
        description: 'An array of all the filenames within the images folder',
        type: [String],
    })
    async getImageFileList() {
        return this.fileService.getFolderFilenames('resources/images/');
    }
}
