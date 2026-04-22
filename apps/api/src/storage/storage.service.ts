import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client as MinioClient } from 'minio';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: MinioClient;
  private readonly bucket: string;
  private readonly publicUrl: string;

  constructor(config: ConfigService) {
    this.bucket = config.get<string>('MINIO_BUCKET') ?? 'neo-kodex-media';
    this.publicUrl =
      config.get<string>('MINIO_PUBLIC_URL') ?? 'http://localhost:9000';
    this.client = new MinioClient({
      endPoint: config.get<string>('MINIO_ENDPOINT') ?? 'localhost',
      port: Number(config.get<string>('MINIO_PORT') ?? 9000),
      useSSL: config.get<string>('MINIO_USE_SSL') === 'true',
      accessKey: config.get<string>('MINIO_ACCESS_KEY') ?? 'minioadmin',
      secretKey: config.get<string>('MINIO_SECRET_KEY') ?? 'minioadmin',
    });
  }

  async onModuleInit(): Promise<void> {
    const exists = await this.client
      .bucketExists(this.bucket)
      .catch(() => false);
    if (!exists) {
      await this.client.makeBucket(this.bucket);
      this.logger.log(`Bucket ${this.bucket} created`);
    } else {
      this.logger.log(`Bucket ${this.bucket} ready`);
    }
  }

  async uploadBuffer(
    buffer: Buffer,
    originalName: string,
    contentType: string,
    prefix = 'media',
  ): Promise<{ key: string; url: string }> {
    const ext = extname(originalName) || '';
    const key = `${prefix}/${randomUUID()}${ext}`;
    await this.client.putObject(this.bucket, key, buffer, buffer.length, {
      'Content-Type': contentType,
    });
    return {
      key,
      url: `${this.publicUrl}/${this.bucket}/${key}`,
    };
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.removeObject(this.bucket, key);
  }
}
