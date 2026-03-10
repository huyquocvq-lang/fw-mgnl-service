import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { computeSha256 } from '../utils/checksum.util';
import {
  getLatestVersion,
  isNewer,
  isValidVersion,
} from '../utils/semver.util';
import type {
  PackageInfoDto,
  PackageLatestDto,
  PackageCheckDto,
} from './dto/package-info.dto';

/** Parsed entry derived from a single `.tgz` filename. */
interface PackageEntry {
  service: string;
  version: string;
  filePath: string;
}

@Injectable()
export class PackagesService {
  private readonly logger = new Logger(PackagesService.name);

  /** Resolved absolute path to the package storage root directory. */
  private readonly storageRoot: string;

  constructor() {
    const defaultStorage = path.join(
      __dirname,
      '..',
      '..',
      'storage',
    );
    this.storageRoot = path.resolve(
      process.env.PACKAGE_STORAGE ?? defaultStorage,
    );
    this.logger.log(`Storage root: ${this.storageRoot}`);
  }

  // ─────────────────────────────────────────────
  //  Public API methods
  // ─────────────────────────────────────────────

  /**
   * Returns summary metadata for a service: list of versions + latest tag.
   */
  async getServiceInfo(service: string): Promise<PackageInfoDto> {
    const entries = await this.getEntriesForService(service);
    const versions = entries.map((e) => e.version);
    const latest = getLatestVersion(versions);
    return { service, latest, versions };
  }

  /**
   * Returns full metadata (checksum, download URL) for the latest release.
   */
  async getLatestMetadata(service: string): Promise<PackageLatestDto> {
    const entries = await this.getEntriesForService(service);
    const versions = entries.map((e) => e.version);
    const latest = getLatestVersion(versions);
    const entry = entries.find((e) => e.version === latest)!;

    const checksum = await this.safeComputeChecksum(entry.filePath);

    return {
      service,
      version: latest,
      checksum,
      download_url: `/packages/${service}/download/${latest}`,
    };
  }

  /**
   * Checks whether an update is available relative to `currentVersion`.
   */
  async checkForUpdate(
    service: string,
    currentVersion: string,
  ): Promise<PackageCheckDto> {
    if (!isValidVersion(currentVersion)) {
      throw new BadRequestException(
        `Invalid version format: "${currentVersion}"`,
      );
    }

    const entries = await this.getEntriesForService(service);
    const versions = entries.map((e) => e.version);
    const latest = getLatestVersion(versions);

    if (!isNewer(currentVersion, latest)) {
      return { update: false };
    }

    const entry = entries.find((e) => e.version === latest)!;
    const checksum = await this.safeComputeChecksum(entry.filePath);

    return {
      update: true,
      latest,
      checksum,
      download: `/packages/${service}/download/${latest}`,
    };
  }

  /**
   * Resolves the absolute file path for a specific (service, version) pair.
   * Throws NotFoundException if the file does not exist.
   */
  async resolveFilePath(service: string, version: string): Promise<string> {
    if (!isValidVersion(version)) {
      throw new BadRequestException(`Invalid version format: "${version}"`);
    }

    const filePath = this.buildFilePath(service, version);

    try {
      await fs.promises.access(filePath, fs.constants.R_OK);
    } catch {
      throw new NotFoundException(
        `Package ${service}@${version} not found`,
      );
    }

    return filePath;
  }

  /**
   * Resolves the absolute file path for the latest version of a service.
   */
  async resolveLatestFilePath(service: string): Promise<string> {
    const entries = await this.getEntriesForService(service);
    const versions = entries.map((e) => e.version);
    const latest = getLatestVersion(versions);
    return this.buildFilePath(service, latest);
  }

  // ─────────────────────────────────────────────
  //  Private helpers
  // ─────────────────────────────────────────────

  /**
   * Scans the service sub-directory and parses all `.tgz` files into
   * PackageEntry objects. Throws NotFoundException if the directory is
   * missing or contains no valid packages.
   */
  private async getEntriesForService(service: string): Promise<PackageEntry[]> {
    // Prevent path traversal: service name must not contain slashes or dots
    this.assertSafeSegment(service);

    const serviceDir = path.join(this.storageRoot, service);

    let files: string[];
    try {
      files = await fs.promises.readdir(serviceDir);
    } catch (err: unknown) {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code === 'ENOENT') {
        throw new NotFoundException(`Service "${service}" not found`);
      }
      this.logger.error(`Failed to read directory ${serviceDir}`, nodeErr.stack);
      throw new InternalServerErrorException('Failed to read storage directory');
    }

    const entries = files
      .filter((f) => f.endsWith('.tgz'))
      .map((f) => this.parseFilename(f, serviceDir))
      .filter((e): e is PackageEntry => e !== null)
      .filter((e) => e.service === service);

    if (entries.length === 0) {
      throw new NotFoundException(`No packages found for service "${service}"`);
    }

    return entries;
  }

  /**
   * Parses a filename like `zigbee-herdsman_0.15.0.tgz` into a PackageEntry.
   * Returns null if the filename does not match the expected convention.
   *
   * Convention: `{service_name}_{version}.tgz`
   * The last underscore is used as the separator so service names may
   * themselves contain underscores.
   */
  private parseFilename(
    filename: string,
    dir: string,
  ): PackageEntry | null {
    const base = filename.slice(0, -4); // strip .tgz
    const lastUnderscore = base.lastIndexOf('_');
    if (lastUnderscore === -1) return null;

    const service = base.slice(0, lastUnderscore);
    const version = base.slice(lastUnderscore + 1);

    if (!service || !isValidVersion(version)) return null;

    return { service, version, filePath: path.join(dir, filename) };
  }

  /**
   * Builds the expected file path for a (service, version) pair.
   */
  private buildFilePath(service: string, version: string): string {
    this.assertSafeSegment(service);
    const filename = `${service}_${version}.tgz`;
    return path.join(this.storageRoot, service, filename);
  }

  /**
   * Computes checksum with error wrapping so callers receive a clean 500.
   */
  private async safeComputeChecksum(filePath: string): Promise<string> {
    try {
      return await computeSha256(filePath);
    } catch (err: unknown) {
      this.logger.error(`Checksum failed for ${filePath}`, (err as Error).stack);
      throw new InternalServerErrorException('Failed to compute file checksum');
    }
  }

  /**
   * Guards against path traversal by rejecting path segments that contain
   * `/`, `\`, or `..`.
   */
  private assertSafeSegment(segment: string): void {
    if (!segment || /[/\\]/.test(segment) || segment.includes('..')) {
      throw new BadRequestException(`Invalid service name: "${segment}"`);
    }
  }
}
