import { BadRequestException, type CallHandler, type ExecutionContext, Injectable, type NestInterceptor, PayloadTooLargeException, type Type, mixin } from "@nestjs/common";
import multer from "multer";
import type { Observable } from "rxjs";
import { UPLOAD_OPTIONS } from "../common/uploads.js";
import { getFileSizeLimits, largestBytes } from "./file-size-limits.js";

/**
 * Takes in a song file, or several (`maxCount`), up to the largest limit set
 * in Admin > Storage (issue #163) - read on each request, unlike
 * FileInterceptor's, fixed when the app starts. Uploads are held in memory
 * until they're stored: this is what stops one bigger than any type allows.
 * The file's own type's limit is checked once the body is parsed.
 */
export function SongFileInterceptor(field: string, maxCount?: number): Type<NestInterceptor> {
  @Injectable()
  class Interceptor implements NestInterceptor {
    async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
      const http = context.switchToHttp();
      const limit = largestBytes(await getFileSizeLimits());
      const upload = multer({ ...UPLOAD_OPTIONS, limits: { fileSize: limit } });
      const handler = maxCount === undefined ? upload.single(field) : upload.array(field, maxCount);
      await new Promise<void>((resolve, reject) =>
        handler(http.getRequest(), http.getResponse(), (error: unknown) => (error ? reject(asHttpError(error, limit)) : resolve())),
      );
      return next.handle();
    }
  }
  return mixin(Interceptor);
}

function asHttpError(error: unknown, limit: number) {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") return new PayloadTooLargeException(`Files can be up to ${Math.round(limit / (1024 * 1024))} MB`);
    return new BadRequestException(error.message);
  }
  return error;
}
