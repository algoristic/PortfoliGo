/** SPDX identifiers of the licenses of the shipped libraries and fonts. */
export const LICENSE_IDS = ['MIT', 'Apache-2.0', 'ISC', 'OFL-1.1', '0BSD'] as const;
export type LicenseId = (typeof LICENSE_IDS)[number];

/** A library or font that the build ships to the browser, with its license (US-UI-08). */
export interface ThirdPartyLicense {
  /** Stable key, used in test IDs. */
  id: string;
  name: string;
  /** npm packages it covers, as named in `package.json` (direct or transitive). */
  packages: readonly string[];
  license: LicenseId;
  copyright: string;
  url: string;
}
