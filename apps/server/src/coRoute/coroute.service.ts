import { Injectable, Logger } from '@nestjs/common';
import { FileService } from '../utilities/file.service';
import { CoRouteDto } from './dto/coroute.dto';
import { CoRouteConverter } from './coroute.converter';

@Injectable()
export class CoRouteService {
  constructor(
    private fileService: FileService,
    private coRouteConverter: CoRouteConverter,
  ) {}

  private coRouteDirectory = 'resources/coroutes/';

  private readonly logger = new Logger(CoRouteService.name);

  async getForRteNum(rteNumber: string): Promise<CoRouteDto> {
    this.logger.debug(`Searching for Company Route: ${rteNumber}`);

    const buffer = await this.fileService.getFile(this.coRouteDirectory, `${rteNumber}.xml`);

    const JsonString = await this.fileService.convertXmlToJson(buffer);

    const coRoute = this.coRouteConverter.convertJsonToDto(JSON.parse(JsonString), rteNumber);
    return this.coRouteConverter.validateCoRoute(coRoute, rteNumber).then(() => coRoute);
  }

  getNumOfRoutes(): Promise<number> {
    return this.fileService.getFileCount(this.coRouteDirectory);
  }

  async getRoutesForIcao(originIcao: string, destinationIcao: string): Promise<CoRouteDto[]> {
    this.logger.debug(`Searching for CoRoutes given origin: ${originIcao} and destination: ${destinationIcao}`);

    const fileBuffers = await this.fileService.getFiles(this.coRouteDirectory);

    const fileJsons = await Promise.all(
      fileBuffers.files.map(async (buffer) => this.fileService.convertXmlToJson(buffer)),
    );

    const coRoutes = fileJsons.map((jsonStrings, index) =>
      this.coRouteConverter.convertJsonToDto(JSON.parse(jsonStrings), fileBuffers.fileNames[index]),
    );

    const foundRoutes = (
      await Promise.all(
        coRoutes.map(async (coRoute) =>
          (await this.coRouteConverter.isCoRouteValid(coRoute, coRoute.name)) ? coRoute : null,
        ),
      )
    )
      .filter((coRoute) => coRoute)
      .filter((coRoute) => this.isRequestedOrigDest(coRoute, originIcao, destinationIcao));

    return foundRoutes;
  }

  private isRequestedOrigDest(coRoute: CoRouteDto, originIcao: string, destinationIcao: string) {
    if (coRoute.origin.icao_code === originIcao && coRoute.destination.icao_code === destinationIcao) {
      return true;
    }
    this.logger.debug(`coRoute didn't match req params, skipping: ${coRoute.name}`);
    return false;
  }
}
