import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { plainToClass } from 'class-transformer';
import { validateOrReject } from 'class-validator';
import { FileService } from '../utilities/file.service';
import { CoRouteDto } from './dto/coroute.dto';

@Injectable()
export class CoRouteService {
    constructor(private fileService: FileService) {}

    private coRouteDirectory = 'resources/coroutes/';

    private readonly logger = new Logger(CoRouteService.name);

    async getForRteNum(rteNumber: String): Promise<CoRouteDto> {
        this.logger.debug(`Searching for Company Route: ${rteNumber}`);

        const buffer = await this.fileService.getFile(
            this.coRouteDirectory,
            `${rteNumber}.json`,
        );

        const coRoute = plainToClass(CoRouteDto, JSON.parse(buffer.toString()));
        return this.validateRetrievedCoRoute(rteNumber, coRoute).then(() => coRoute);
    }

    getNumOfRoutes(): Promise<number> {
        return this.fileService.getFileCount(this.coRouteDirectory);
    }

    private async validateRetrievedCoRoute(
        rteNumber: String,
        coRoute: CoRouteDto,
    ) {
        try {
            await validateOrReject(coRoute, {
                whitelist: true,
                forbidNonWhitelisted: true,
            });
        } catch (errors) {
            const message = `${rteNumber} failed validation`;
            this.logger.warn(`${rteNumber} failed validation`, errors);
            throw new HttpException(message, HttpStatus.UNPROCESSABLE_ENTITY);
        }
    }
}
