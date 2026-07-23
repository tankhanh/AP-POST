import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  UseGuards,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ResponseMessage } from 'src/health/decorator/customize';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt.auth.guard';
import { Request } from 'express';

@ApiTags('files')
@UseGuards(JwtAuthGuard)
@Controller('files')
export class FilesController {
  @Post('upload')
  @ResponseMessage('Upload Single File')
  @UseInterceptors(FileInterceptor('fileUpload'))
  uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Req() request: Request,
  ) {
    if (!file) {
      throw new BadRequestException('A file is required');
    }
    const folder = String(request.headers.folder_type ?? 'default');
    return {
      fileName: file.filename,
      publicPath: `/images/${folder}/${encodeURIComponent(file.filename)}`,
    };
  }
}
