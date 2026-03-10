import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  BadRequestException,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import * as fs from 'fs';
import { PackagesService } from './packages.service';
import type {
  PackageInfoDto,
  PackageLatestDto,
  PackageCheckDto,
} from './dto/package-info.dto';

@Controller('packages')
export class PackagesController {
  constructor(private readonly packagesService: PackagesService) {}

  /**
   * GET /packages/:service
   * Returns all available versions and the latest tag for a service.
   *
   * Example: GET /packages/zigbee-herdsman
   */
  @Get(':service')
  async getServiceInfo(
    @Param('service') service: string,
  ): Promise<PackageInfoDto> {
    return this.packagesService.getServiceInfo(service);
  }

  /**
   * GET /packages/:service/latest
   * Returns full metadata (version, checksum, download URL) for the
   * most recent release.
   *
   * Example: GET /packages/zigbee-herdsman/latest
   */
  @Get(':service/latest')
  async getLatestMetadata(
    @Param('service') service: string,
  ): Promise<PackageLatestDto> {
    return this.packagesService.getLatestMetadata(service);
  }

  /**
   * GET /packages/:service/check?version=X.Y.Z
   * OTA-friendly endpoint: returns whether an update is available
   * relative to the supplied version.
   *
   * Example: GET /packages/zigbee-herdsman/check?version=0.14.0
   */
  @Get(':service/check')
  async checkForUpdate(
    @Param('service') service: string,
    @Query('version') version: string,
  ): Promise<PackageCheckDto> {
    if (!version) {
      throw new BadRequestException('Query parameter "version" is required');
    }
    return this.packagesService.checkForUpdate(service, version);
  }

  /**
   * GET /packages/:service/download/latest
   * Streams the latest version `.tgz` file directly to the client.
   * The file is never loaded into memory — it is piped from disk.
   *
   * Example: GET /packages/zigbee-herdsman/download/latest
   */
  @Get(':service/download/latest')
  async downloadLatest(
    @Param('service') service: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const filePath = await this.packagesService.resolveLatestFilePath(service);
    return this.streamFile(filePath, service, res);
  }

  /**
   * GET /packages/:service/download/:version
   * Streams a specific version `.tgz` file directly to the client.
   *
   * Example: GET /packages/zigbee-herdsman/download/0.14.0
   */
  @Get(':service/download/:version')
  async downloadVersion(
    @Param('service') service: string,
    @Param('version') version: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const filePath = await this.packagesService.resolveFilePath(service, version);
    return this.streamFile(filePath, service, res);
  }

  // ─────────────────────────────────────────────
  //  Private helpers
  // ─────────────────────────────────────────────

  /**
   * Creates a `StreamableFile` from a disk path and sets the appropriate
   * response headers. NestJS pipes the stream to the HTTP response
   * without buffering the file in memory.
   */
  private streamFile(
    filePath: string,
    service: string,
    res: Response,
  ): StreamableFile {
    const filename = filePath.split('/').pop() ?? `${service}.tgz`;
    res.set({
      'Content-Type': 'application/gzip',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    const stream = fs.createReadStream(filePath);
    return new StreamableFile(stream);
  }
}
