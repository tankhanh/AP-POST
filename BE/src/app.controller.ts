import { Controller, Get } from '@nestjs/common';
import { Public } from './health/decorator/customize';

@Controller()
export class AppController {
  @Public()
  @Get('health')
  health() {
    return { status: 'ok' };
  }
}
