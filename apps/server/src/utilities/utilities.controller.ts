import { Controller, Get, Query, StreamableFile, Response, ParseIntPipe } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { contentType } from 'mime-types';
import { FileService } from './file.service';

@ApiTags('UTILITIES')
@Controller('api/v1/utility')
export class UtiliyController {
    constructor(private fileService: FileService) {}

    @Get('pdf')
    @ApiResponse({
        status: 200,
        description: 'A streamed converted png image',
        type: StreamableFile,
    })
    async getPdf(
        @Query('filename') filename: string,
        @Query('pagenumber', ParseIntPipe) pagenumber: number,
        @Response({ passthrough: true }) res,
    ): Promise<StreamableFile> {
        const convertedPdfFile = await this.fileService.getConvertedPdfFile(filename, pagenumber);

        res.set({
            'Content-Type': 'image/png',
            'Content-Disposition': `attachment; filename=out-${pagenumber}.png}`,
        });

        return convertedPdfFile;
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

    @Get('pdf/numpages')
    @ApiResponse({
        status: 200,
        description: 'Returns the number of pages in the pdf',
        type: Number,
    })
    async getNumberOfPages(@Query('filename') filename: string): Promise<number> {
        return this.fileService.getNumberOfPdfPages(filename);
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
