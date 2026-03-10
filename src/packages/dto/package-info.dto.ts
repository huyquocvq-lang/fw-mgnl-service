/**
 * Response for GET /packages/:service
 * Lists all available versions and highlights the latest.
 */
export class PackageInfoDto {
  service!: string;
  latest!: string;
  versions!: string[];
}

/**
 * Response for GET /packages/:service/latest
 * Full metadata for the most recent release including checksum and download URL.
 */
export class PackageLatestDto {
  service!: string;
  version!: string;
  checksum!: string;
  download_url!: string;
}

/**
 * Response for GET /packages/:service/check?version=X.Y.Z
 * Indicates whether an OTA update is available.
 */
export type PackageCheckDto =
  | { update: false }
  | {
      update: true;
      latest: string;
      checksum: string;
      download: string;
    };
