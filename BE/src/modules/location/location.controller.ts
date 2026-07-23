import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { LocationService } from './location.service';
import { UpdateAddressDto } from './dto/update-location.dto';
import { Public } from 'src/health/decorator/customize';
import { JwtAuthGuard } from 'src/auth/guards/jwt.auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/health/decorator/roles.decorator';

@Controller('locations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  @Public()
  @Get('provinces')
  getProvinces() {
    return this.locationService.getProvinces();
  }

  @Public()
  @Get('communes')
  getCommunes(@Query('provinceId') provinceId: string) {
    return this.locationService.getCommunes(provinceId);
  }

  @Get('addresses')
  @Roles('ADMIN', 'STAFF')
  listAddresses(
    @Query('current') current = '1',
    @Query('pageSize') pageSize = '10',
    @Query('q') q?: string,
  ) {
    return this.locationService.listAddresses(+current, +pageSize, q);
  }

  @Post('addresses')
  @Roles('ADMIN', 'STAFF')
  createAddress(@Body() body: any) {
    return this.locationService.createAddress(body);
  }

  @Patch('addresses/:id')
  @Roles('ADMIN', 'STAFF')
  updateAddress(@Param('id') id: string, @Body() dto: UpdateAddressDto) {
    return this.locationService.updateAddress(id, dto);
  }

  @Get('addresses/:id')
  @Roles('ADMIN', 'STAFF')
  getAddress(@Param('id') id: string) {
    return this.locationService.getAddressById(id);
  }
}
