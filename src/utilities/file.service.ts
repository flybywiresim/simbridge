import { readdir, readFile } from 'fs/promises';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { PathLike } from 'fs';

@Injectable()
export class FileService {
    private readonly logger = new Logger(FileService.name);

    async getFileCount(directory: PathLike): Promise<number> {
        try {
            this.logger.debug(`Retrieving number of files in folder: ${directory}`);
            const retrievedDir = await readdir(directory);
            return retrievedDir.length;
        } catch (err) {
            const message = `Error reading directory: ${directory}`;
            this.logger.error(message, err);
            throw new HttpException(message, HttpStatus.NOT_FOUND);
        }
    }

    async getFile(directory: PathLike, fileName: PathLike): Promise<Buffer> {
        try {
            this.logger.debug(`Retreiving file: ${fileName} in folder: ${directory}`);
            const retrievedFile = await readFile(`${directory}${fileName}`);
            return retrievedFile;
        } catch (err) {
            const message = `Error retrieving file: ${fileName} in folder:${directory}`;
            this.logger.error(message);
            throw new HttpException(message, HttpStatus.NOT_FOUND);
        }
    }
}
