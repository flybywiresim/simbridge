import { Controller, Get, Query, StreamableFile, Response } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, rmSync, unlink } from 'fs';
import { contentType } from 'mime-types';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf';
import { FileService } from './file.service';

const pdf = require('pdf-poppler');

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
    async getPdf(@Query('filename') filename: string, @Query('pagenumber') pagenumber: number, @Response({ passthrough: true }) res): Promise<StreamableFile> {
        res.set({
            'Content-Type': 'image/png',
            'Content-Disposition': `attachment; filename=out-${pagenumber}.png}`,
        });

        const pagesFolder = `${process.cwd()}\\out\\${filename.replace('.pdf', '')}`;

        if (!existsSync(pagesFolder)) {
            mkdirSync(pagesFolder);
        }

        const options = {
            format: 'png',
            // FIXME: What if the user specifies a file like 'afile.pdf.pdf'?
            out_dir: pagesFolder,
            out_prefix: 'out',
            page: pagenumber,
            scale: 3072,
        };

        return pdf.convert(`${process.cwd()}\\resources\\pdfs\\${filename}`, options).then(() => {
            const fileList = readdirSync(pagesFolder, { withFileTypes: true });

            if (!fileList.length) {
                throw new Error('No files found in the output folder');
            }
            const pageNumberLength = fileList[0].name.replace('out-', '').replace('.png', '').length;
            const expectedFilePath = `${pagesFolder}\\out-${pagenumber.toString().padStart(pageNumberLength, '0')}.png`;

            if (existsSync(expectedFilePath)) {
                const file = new StreamableFile(readFileSync(expectedFilePath));

                rmSync(expectedFilePath);

                return file;
            }

            return undefined;
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

    @Get('pdf/numpages')
    @ApiResponse({
        status: 200,
        description: 'Returns the number of pages in the pdf',
        type: Number,
    })
    async getNumberOfPages(@Query('filename') filename: string): Promise<number> {
        const retrievedFile = readFileSync(`resources\\pdfs\\${filename}`);

        return getDocument({ data: retrievedFile }).promise.then((document) => document.numPages);
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
