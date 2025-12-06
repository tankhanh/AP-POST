import { PartialType } from '@nestjs/mapped-types';
import { CreatePayfakeDto } from './create-payfake.dto';

export class UpdatePayfakeDto extends PartialType(CreatePayfakeDto) {}
