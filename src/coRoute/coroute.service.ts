import { Injectable, Logger } from '@nestjs/common';
import { FileService } from '../utilities/file.service';
import { CoRouteDto } from './dto/coroute.dto';
import { CoRouteConverter } from './coroute.converter';

@Injectable()
export class CoRouteService {
    constructor(private fileService: FileService, private coRouteConverter: CoRouteConverter) {}

    private coRouteDirectory = 'resources/coroutes/';

    private readonly logger = new Logger(CoRouteService.name);

    async getForRteNum(rteNumber: String): Promise<CoRouteDto> {
        this.logger.debug(`Searching for Company Route: ${rteNumber}`);

        const buffer = await this.fileService.getFile(
            this.coRouteDirectory,
            `${rteNumber}.xml`,
        );

        const JsonString = await this.fileService.convertXmlToJson(buffer);

        const coRoute = this.coRouteConverter.convertJsonToDto(JSON.parse(JsonString));
        return this.coRouteConverter.validateCoRoute(coRoute, rteNumber).then(() => coRoute);
    }

    getNumOfRoutes(): Promise<number> {
        return this.fileService.getFileCount(this.coRouteDirectory);
    }

    async getRoutesForIcao(originIcao: String, destinationIcao: String): Promise<CoRouteDto[]> {
        this.logger.debug(`Searching for CoRoutes given origin: ${originIcao} and destination: ${destinationIcao}`);

        const fileBuffers = await this.fileService.getFiles(this.coRouteDirectory);

        const fileJsons = await Promise.all(fileBuffers.map(async (buffer) => this.fileService.convertXmlToJson(buffer)));

        const coRoutes = fileJsons.map((jsonStrings) => this.coRouteConverter.convertJsonToDto(JSON.parse(jsonStrings)));

        const validatedCoRoutes: CoRouteDto[] = [];
        coRoutes.forEach((coRoute) => this.coRouteConverter.validateCoRoute(coRoute)
            .then(() => {
                if (coRoute.origin.icao_code === originIcao && coRoute.destination.icao_code) {
                    validatedCoRoutes.push(coRoute);
                } else {
                    this.logger.debug(`coRoute didn't match req params, skipping: ${JSON.stringify(coRoute)}`);
                }
            })
            // Should we print the entire coroute ?
            .catch(() => this.logger.warn(`coRoute failed validation: ${JSON.stringify(coRoute)}`)));

        return validatedCoRoutes;
    }
}
