import fetch from 'node-fetch';
import { parse } from 'plist';
import { writeFile, mkdir, remove } from 'fs-extra';
import * as prettyBytes from 'pretty-bytes';

function getSwscanUrl(catalogId: 'customer-seed' | 'developer-seed' | 'public-seed' | 'public-release') {
  let prefix = '';
  switch (catalogId) {
    case 'customer-seed': prefix = 'index-10.14customerseed'; break;
    case 'developer-seed': prefix = 'index-10.14seed'; break;
    case 'public-seed': prefix = 'index-10.14beta'; break;
    case 'public-release': prefix = 'index'; break;
    default: throw new Error(`Unrecognized catalog ID '${catalogId}'.`)
  }

  return `https://swscan.apple.com/content/catalogs/others/${prefix}-10.14-10.13-10.12-10.11-10.10-10.9-mountainlion-lion-snowleopard-leopard.merged-1.sucatalog`;
}

const catalogId = 'public-release';
const catalogUrl = getSwscanUrl(catalogId);

// TODO: Accept this as a parameter
const productId = '091-95155'; // High Sierra

void async function main() {
  const response = await fetch(catalogUrl, { headers: { 'User-Agent': 'Software%20Update (unknown version) CFNetwork/807.0.1 Darwin/16.0.0 (x86_64)' } });
  const text = await response.text();
  const data = parse(text);
  const products = data['Products'];
  const installs: { productId: string; packages: readonly { url: string; size: number; integrityDataUrl: string; integrityDataSize: number; }[] }[] = [];
  for (let productId of Object.keys(products)) {
    const extendedMetaInfo = products[productId]['ExtendedMetaInfo'];
    if (extendedMetaInfo === undefined) {
      continue;
    }

    const installAssistantPackageIdentifiers = extendedMetaInfo['InstallAssistantPackageIdentifiers'];
    if (installAssistantPackageIdentifiers === undefined) {
      continue;
    }

    const osInstall = installAssistantPackageIdentifiers['OSInstall'];
    if (osInstall === 'com.apple.mpkg.OSInstall') {
      const packages = products[productId]['Packages'].map(p => {
        const url = p['URL'];
        const size = p['Size'];
        const integrityDataUrl = p['IntegrityDataURL'];
        const integrityDataSize = p['IntegrityDataSize'];
        return { url, size, integrityDataUrl, integrityDataSize };
      });

      installs.push({ productId, packages });
    }
  }

  console.log('Available installs:', installs.map(i => i.productId));

  const install = installs.find(i => i.productId === productId);
  if (!install) {
    throw new Error(`Product with ID '${productId} was not found in the catalog.`);
  }

  console.log(`Resetting ${productId} directory…`);
  await remove(productId);
  await mkdir(productId);

  for (let index = 0; index < install.packages.length; index++) {
    const pack = install.packages[index];

    console.log(`Downloading ${index + 1}/${install.packages.length}: ${pack.url} (${prettyBytes(pack.size)})…`);
    const response = await fetch(pack.url);
    const buffer = await response.buffer();

    const filename = productId + '/' + pack.url.split('/').slice(-1)[0];
    console.log(`Saving ${filename}…`);
    await writeFile(filename, buffer);
  }
}()
