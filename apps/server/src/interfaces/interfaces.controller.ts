import { Controller, Get, Render } from '@nestjs/common';

@Controller('interfaces/v1')
export class InterfacesController {
    @Get('/mcdu')
    @Render('index')
    renderMcdu() {

    }
}
