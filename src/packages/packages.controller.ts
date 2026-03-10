import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  BadRequestException,
  StreamableFile,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import type { Response } from 'express';
import * as fs from 'fs';
import { PackagesService } from './packages.service';
import type {
  PackageInfoDto,
  PackageLatestDto,
  PackageCheckDto,
} from './dto/package-info.dto';

@ApiTags('packages')
@Controller('packages')
export class PackagesController {
  constructor(private readonly packagesService: PackagesService) {}

  @ApiOperation({ summary: 'List versions for a service' })
  @ApiParam({ name: 'service', example: 'zigbee-herdsman' })
  @Get(':service')
  async getServiceInfo(
    @Param('service') service: string,
  ): Promise<PackageInfoDto> {
    return this.packagesService.getServiceInfo(service);
  }

  @ApiOperation({ summary: 'Get latest version metadata' })
  @ApiParam({ name: 'service', example: 'zigbee-herdsman' })
  @Get(':service/latest')
  async getLatestMetadata(
    @Param('service') service: string,
  ): Promise<PackageLatestDto> {
    return this.packagesService.getLatestMetadata(service);
  }

  @ApiOperation({ summary: 'Check if update available' })
  @ApiParam({ name: 'service', example: 'zigbee-herdsman' })
  @ApiQuery({ name: 'version', required: true, example: '0.14.0' })
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

  @ApiOperation({ summary: 'Download latest .tgz' })
  @ApiParam({ name: 'service', example: 'zigbee-herdsman' })
  @Get(':service/download/latest')
  async downloadLatest(
    @Param('service') service: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const filePath = await this.packagesService.resolveLatestFilePath(service);
    return this.streamFile(filePath, service, res);
  }

  @ApiOperation({ summary: 'Download specific version .tgz' })
  @ApiParam({ name: 'service', example: 'zigbee-herdsman' })
  @ApiParam({ name: 'version', example: '0.14.0' })
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
