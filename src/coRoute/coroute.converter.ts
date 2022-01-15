import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { plainToClass } from 'class-transformer';
import { validateOrReject } from 'class-validator';
import { Airport } from './dto/airport.dto';
import { CoRouteDto } from './dto/coroute.dto';
import { Fix } from './dto/fix.dto';
import { General } from './dto/general.dto';
import { Navlog } from './dto/navlog.dto';

@Injectable()
export class CoRouteConverter {
    private readonly logger = new Logger(CoRouteConverter.name)

    convertJsonToDto(parsedObject: any): CoRouteDto {
        try {
            const tempCoRouteDto = new CoRouteDto();
            const tempNavlog = new Navlog();
            tempCoRouteDto.destination = plainToClass(Airport, parsedObject.OFP.destination);
            tempCoRouteDto.origin = plainToClass(Airport, parsedObject.OFP.origin);
            tempCoRouteDto.general = plainToClass(General, parsedObject.OFP.general);
            parsedObject.OFP.navlog.fix.forEach((item: any) => tempNavlog.fix.push(plainToClass(Fix, item)));
            tempCoRouteDto.navlog = tempNavlog;

            return tempCoRouteDto;
        } catch (errors) {
            const message = 'Failed to instantiate DTO';
            this.logger.warn(message, errors);
            throw new HttpException(message, HttpStatus.UNPROCESSABLE_ENTITY);
        }
    }

    async validateCoRoute(coRoute: CoRouteDto, rteNumber: String = 'PLACEHOLDER') {
        try {
            await validateOrReject(coRoute, { whitelist: true });
        } catch (errors) {
            const message = `${rteNumber} failed validation`;
            this.logger.warn(`${rteNumber} failed validation`, errors);
            throw new HttpException(message, HttpStatus.UNPROCESSABLE_ENTITY);
        }
    }
}
