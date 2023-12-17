import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { plainToClass } from 'class-transformer';
import { validateOrReject, ValidationError } from 'class-validator';
import { Airport } from './dto/airport.dto';
import { CoRouteDto } from './dto/coroute.dto';
import { Fix } from './dto/fix.dto';
import { General } from './dto/general.dto';
import { Navlog } from './dto/navlog.dto';

@Injectable()
export class CoRouteConverter {
  private readonly logger = new Logger(CoRouteConverter.name);

  convertJsonToDto(parsedObject: any, routeNumber: string): CoRouteDto {
    try {
      const tempCoRouteDto = new CoRouteDto();
      const tempNavlog = new Navlog();
      tempCoRouteDto.destination = plainToClass(Airport, parsedObject.OFP.destination);
      tempCoRouteDto.origin = plainToClass(Airport, parsedObject.OFP.origin);
      tempCoRouteDto.alternate = plainToClass(Airport, parsedObject.OFP.alternate);
      tempCoRouteDto.general = plainToClass(General, parsedObject.OFP.general);
      parsedObject.OFP.navlog.fix.forEach((item: any) => tempNavlog.fix.push(plainToClass(Fix, item)));
      tempCoRouteDto.navlog = tempNavlog;
      tempCoRouteDto.name = routeNumber.replace('.xml', '');

      return tempCoRouteDto;
    } catch (errors) {
      const message = 'Failed to instantiate DTO';
      this.logger.error(message, errors);
      throw new HttpException(message, HttpStatus.UNPROCESSABLE_ENTITY);
    }
  }

  async validateCoRoute(coRoute: CoRouteDto, rteNumber: string = 'PLACEHOLDER') {
    try {
      await validateOrReject(coRoute, { whitelist: true });
    } catch (errors) {
      const message = `${rteNumber} failed validation, check logs`;
      (errors as ValidationError[]).forEach((element) => {
        delete element.target;
      });
      this.logger.error(`${rteNumber} failed validation`, errors);
      throw new HttpException(message, HttpStatus.UNPROCESSABLE_ENTITY);
    }
  }

  async isCoRouteValid(coRoute: CoRouteDto, rteNumber: string = 'PLACEHOLDER'): Promise<boolean> {
    try {
      await validateOrReject(coRoute, { whitelist: true });
      return true;
    } catch (errors) {
      (errors as ValidationError[]).forEach((element) => {
        delete element.target;
      });
      this.logger.error(`${rteNumber} failed validation while retrieving route list`, errors);
      return false;
    }
  }
}
