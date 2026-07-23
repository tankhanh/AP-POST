import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import { extname, resolve, sep } from 'path';
import {
  BadRequestException,
  Injectable,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import {
  MulterModuleOptions,
  MulterOptionsFactory,
} from '@nestjs/platform-express';
import { diskStorage } from 'multer';

const allowedMimeTypes = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/gif', '.gif'],
  ['image/heic', '.heic'],
  ['image/heif', '.heif'],
  ['application/pdf', '.pdf'],
  ['application/msword', '.doc'],
  [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.docx',
  ],
]);

@Injectable()
export class MulterConfigService implements MulterOptionsFactory {
  createMulterOptions(): MulterModuleOptions {
    const uploadRoot = resolve(process.cwd(), 'public', 'images');

    return {
      storage: diskStorage({
        destination: (request, _file, callback) => {
          try {
            const rawFolder = String(request.headers.folder_type ?? 'default');
            if (!/^[a-zA-Z0-9_-]{1,40}$/.test(rawFolder)) {
              throw new BadRequestException('Invalid upload folder');
            }

            const destination = resolve(uploadRoot, rawFolder);
            if (
              destination !== uploadRoot &&
              !destination.startsWith(`${uploadRoot}${sep}`)
            ) {
              throw new BadRequestException('Invalid upload destination');
            }

            mkdirSync(destination, { recursive: true });
            callback(null, destination);
          } catch (error) {
            callback(error, '');
          }
        },
        filename: (_request, file, callback) => {
          const expectedExtension = allowedMimeTypes.get(file.mimetype);
          const suppliedExtension = extname(file.originalname).toLowerCase();
          const extension =
            suppliedExtension === '.jpeg'
              ? '.jpg'
              : expectedExtension || suppliedExtension || '.jpg';

          if (!expectedExtension && !extension) {
            callback(
              new UnsupportedMediaTypeException('Invalid file type'),
              '',
            );
            return;
          }

          callback(null, `${randomUUID()}${extension}`);
        },
      }),
      fileFilter: (_request, file, callback) => {
        if (!allowedMimeTypes.has(file.mimetype)) {
          callback(
            new UnsupportedMediaTypeException('Invalid file type'),
            false,
          );
          return;
        }
        callback(null, true);
      },
      limits: {
        files: 1,
        fileSize: 20 * 1024 * 1024,
      },
    };
  }
}
