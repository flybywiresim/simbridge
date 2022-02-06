import { readdir, readFile } from 'fs/promises';
import { HttpException, HttpStatus, Injectable, Logger, StreamableFile } from '@nestjs/common';
import { existsSync, mkdirSync, PathLike, readdirSync, rmSync, readFileSync } from 'fs';
import * as xml2js from 'xml2js';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf';

const pdf = require('pdf-poppler');

@Injectable()
export class FileService {
    private readonly logger = new Logger(FileService.name);

    async getFileCount(directory: PathLike): Promise<number> {
        try {
            this.logger.debug(`Retrieving number of files in folder: ${directory}`);
            const retrievedDir = await readdir(`${process.cwd()}/${directory}`);
            return retrievedDir.length;
        } catch (err) {
            const message = `Error reading directory: ${directory}`;
            this.logger.error(message, err);
            throw new HttpException(message, HttpStatus.NOT_FOUND);
        }
    }

    async getFiles(directory: PathLike): Promise<{ fileNames: string[]; files: Buffer[]; }> {
        try {
            this.logger.debug(`Reading all files in directory: ${directory}`);

            const fileNames = await readdir(`${process.cwd()}/${directory}`);

            const files: Buffer[] = [];
            for (const fileName of fileNames) {
                files.push(await this.getFile(directory, fileName));
            }

            return { fileNames, files };
        } catch (err) {
            const message = `Error reading directory: ${directory}`;
            this.logger.error(message, err);
            throw new HttpException(message, HttpStatus.NOT_FOUND);
        }
    }

    async getFolderFilenames(directory: PathLike): Promise<string[]> {
        try {
            this.logger.debug(`Reading all files in directory: ${directory}`);
            return readdir(`${process.cwd()}/${directory}`);
        } catch (err) {
            const message = `Error reading directory: ${directory}`;
            this.logger.error(message, err);
            throw new HttpException(message, HttpStatus.NOT_FOUND);
        }
    }

    async getFile(directory: PathLike, fileName: PathLike): Promise<Buffer> {
        try {
            this.logger.debug(`Retreiving file: ${fileName} in folder: ${directory}`);
            return readFile(`${process.cwd()}/${directory}${fileName}`);
        } catch (err) {
            const message = `Error retrieving file: ${fileName} in folder:${directory}`;
            this.logger.error(message, err);
            throw new HttpException(message, HttpStatus.NOT_FOUND);
        }
    }

    async getNumberOfPdfPages(fileName: string): Promise<number> {
        const retrievedFile = await this.getFile('resources\\pdfs\\', fileName);

        return getDocument({ data: retrievedFile }).promise.then((document) => document.numPages);
    }

    async getConvertedPdfFile(fileName: string, pageNumber: number): Promise<StreamableFile> {
        const pagesFolder = `${process.cwd()}\\out\\${fileName.replace('.pdf', '')}`;

        if (!existsSync(pagesFolder)) {
            mkdirSync(pagesFolder);
        }

        const options = {
            format: 'png',
            out_dir: pagesFolder,
            out_prefix: 'out',
            page: pageNumber,
            scale: 2048,
        };

        try {
            return pdf.convert(`${process.cwd()}\\resources\\pdfs\\${fileName}`, options).then(() => {
                const fileList = readdirSync(pagesFolder, { withFileTypes: true });

                if (!fileList.length) {
                    throw new Error('No files found in the output folder');
                }
                const pageNumberLength = fileList[0].name.replace('out-', '').replace('.png', '').length;
                const expectedFilePath = `${pagesFolder}\\out-${pageNumber.toString().padStart(pageNumberLength, '0')}.png`;

                if (existsSync(expectedFilePath)) {
                    const file = new StreamableFile(readFileSync(expectedFilePath));

                    rmSync(expectedFilePath);

                    return file;
                }

                throw new Error('No file found in the output folder');
            });
        } catch (err) {
            const message = `Error converting PDF to PNG: ${fileName}`;
            this.logger.log(message, err);
            throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    async getFileStream(directory: PathLike, fileName: PathLike): Promise<StreamableFile> {
        return new StreamableFile(await this.getFile(directory, fileName));
    }

    async convertXmlToJson(xmlBuffer: Buffer): Promise<string> {
        return xml2js.parseStringPromise(xmlBuffer.toString(), { mergeAttrs: true, explicitChildren: true, explicitArray: false })
            .then((result) => JSON.stringify(result))
            .catch((err) => {
                const message = 'Error converting XML to JSON';
                this.logger.error(message, err);
                throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
            });
    }
}
