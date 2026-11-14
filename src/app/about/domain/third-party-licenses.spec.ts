import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { THIRD_PARTY_LICENSES } from './third-party-licenses';

interface PackageJson {
  license?: string;
  dependencies?: Record<string, string>;
}

function readPackage(path: string): PackageJson {
  return JSON.parse(readFileSync(resolve(path, 'package.json'), 'utf8')) as PackageJson;
}

// The oracle is the installed packages: the dependencies of `package.json` and the `license`
// field each package declares (US-UI-08).
const app = readPackage('.');
const runtime = Object.keys(app.dependencies ?? {});
// Shipped as well: the dependency of lightweight-charts and the base styles of Tailwind CSS.
const shipped = [
  ...runtime,
  ...Object.keys(readPackage('node_modules/lightweight-charts').dependencies ?? {}),
  'tailwindcss',
];
const listed = THIRD_PARTY_LICENSES.flatMap((entry) =>
  entry.packages.map((name) => ({ name, license: entry.license })),
);

describe('THIRD_PARTY_LICENSES', () => {
  it.each(shipped)('lists the shipped package %s', (name) => {
    expect(listed.map((entry) => entry.name)).toContain(name);
  });

  it.each(listed)('names the license that $name declares', ({ name, license }) => {
    expect(readPackage(`node_modules/${name}`).license).toBe(license);
  });

  it('lists every package once', () => {
    const names = listed.map((entry) => entry.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
