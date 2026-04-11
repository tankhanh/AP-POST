import { Module } from '@nestjs/common';
import { VietQrService } from './vietqr.service';

@Module({
  providers: [VietQrService],
  exports: [VietQrService],
})
export class VietQrModule {}