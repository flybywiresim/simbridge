import { readdir, readFile } from 'fs/promises';
import { HttpException, HttpStatus, Injectable, Logger, StreamableFile } from '@nestjs/common';
import { existsSync, PathLike, rmSync } from 'fs';
import * as xml2js from 'xml2js';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf';
import * as pdf from 'pdf-poppler';

@Injectable()
export class FileService {
    private readonly logger = new Logger(FileService.name);

    async getFileCount(directory: PathLike): Promise<number> {
        this.logger.debug(`Retrieving number of files in folder: ${directory}`);
        const retrievedDir = await this.getFolderFilenames(directory);
        return retrievedDir.length;
    }

    async getFiles(directory: PathLike): Promise<{ fileNames: string[]; files: Buffer[]; }> {
        this.logger.debug(`Reading all files in directory: ${directory}`);

        const fileNames = await this.getFolderFilenames(directory);

        const files: Buffer[] = [];
        for (const fileName of fileNames) {
            files.push(await this.getFile(directory, fileName));
        }

        return { fileNames, files };
    }

    async getFolderFilenames(directory: PathLike): Promise<string[]> {
        try {
            this.logger.debug(`Reading all files in directory: ${directory}`);
            return await readdir(`${process.cwd()}/${directory}`);
        } catch (err) {
            const message = `Error reading directory: ${directory}`;
            this.logger.error(message, err);
            throw new HttpException(message, HttpStatus.NOT_FOUND);
        }
    }

    async getFile(directory: PathLike, fileName: PathLike): Promise<Buffer> {
        try {
            this.logger.debug(`Retreiving file: ${fileName} in folder: ${directory}`);
            return await readFile(`${process.cwd()}/${directory}${fileName}`);
        } catch (err) {
            const message = `Error retrieving file: ${fileName} in folder:${directory}`;
            this.logger.error(message, err);
            throw new HttpException(message, HttpStatus.NOT_FOUND);
        }
    }

    async getNumberOfPdfPages(fileName: string): Promise<number> {
        const retrievedFile = await this.getFile('resources\\pdfs\\', fileName);

        return getDocument({ data: retrievedFile }).promise
            .then((document) => document.numPages)
            .catch((error) => {
                const message = 'Failed to retrieve PDF pages';
                this.logger.error(message, error);
                throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
            });
    }

    /**
     * Calling this function checks the safety of the supplied file path and throws an error if it deemed not safe against various potential attacks.
     * @param filePath
     */
    checkFilePathSafety(filePath: string): void {
        if (filePath.indexOf('\0') !== -1) {
            throw new Error('Unexpected null byte encountered');
        }

        if (filePath.indexOf(process.cwd()) !== 0) {
            throw new Error('Unacceptable file path');
        }
    }

    async getConvertedPdfFile(fileName: string, pageNumber: number): Promise<StreamableFile> {
        const pdfFilePath = `${process.cwd()}/resources/pdfs/${fileName}.pdf`;
        const imagePath = `${fileName}-${pageNumber}.png`;

        if (!existsSync(pdfFilePath)) {
            this.logger.warn(`PDF File not found: ${fileName}`);
            throw new HttpException(`File not found: ${fileName}`, HttpStatus.NOT_FOUND);
        }

        try {
            this.checkFilePathSafety(pdfFilePath);
        } catch (error) {
            const message = 'File path failed sanitation';
            this.logger.error(message, error);
            throw new HttpException(message, HttpStatus.BAD_REQUEST);
        }

        try {
            const outFolderPath = `${process.cwd()}/resources/images`;
            const outFileName = `${fileName}`;

            const options = {
                format: 'png',
                out_dir: outFolderPath,
                out_prefix: `${outFileName}`,
                scale: 2048,
                page: pageNumber,
            };

            await pdf.convert(pdfFilePath, options);
        } catch (err) {
            const message = `Error converting PDF to PNG: ${fileName}`;
            this.logger.error('Error converting PDF to PNG', err);
            throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
        }

        return this.getFile('resources/images/', imagePath).then((file) => {
            rmSync(`resources/images/${imagePath}`);
            return new StreamableFile(file);
        });
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
