import * as semver from 'semver';

/**
 * Returns the highest valid semver string from the provided list.
 * Throws if the array is empty or contains no valid semver strings.
 *
 * @param versions Array of version strings (e.g. ["0.14.0", "0.15.0"]).
 * @returns The latest version string.
 */
export function getLatestVersion(versions: string[]): string {
  const valid = versions.filter((v) => semver.valid(v) !== null);
  if (valid.length === 0) {
    throw new Error('No valid semver versions provided');
  }
  // semver.rsort sorts in descending order (highest first)
  return semver.rsort(valid)[0];
}

/**
 * Returns true when `candidate` is strictly greater than `current`
 * according to semver rules. Both values must be valid semver strings.
 *
 * @param current  The version the client is currently running.
 * @param candidate The version to compare against.
 */
export function isNewer(current: string, candidate: string): boolean {
  return semver.gt(candidate, current);
}

/**
 * Returns true when the version string is a valid semver value.
 */
export function isValidVersion(version: string): boolean {
  return semver.valid(version) !== null;
}
