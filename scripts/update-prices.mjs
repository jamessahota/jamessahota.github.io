// Refresh observations only; forecasts, entry references and outcomes never change here.
// npm run prices. The deployment restores/saves the last-good cache between builds.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { mergeCachedPrices, priceCache, refreshPrices } from './lib/market-prices.mjs';
import { fetchBalticPrices } from './lib/baltic-prices.mjs';
import { fetchJkmReference } from './lib/jkm-reference.mjs';

const file = new URL('../src/data/latest-prices.json', import.meta.url);
const cacheFile = new URL('../.cache/market-prices.json', import.meta.url);
const config = JSON.parse(await readFile(file, 'utf8'));
let cache;
try {
  cache = JSON.parse(await readFile(cacheFile, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') console.warn('Price cache unavailable; using committed observations.');
}
const now = new Date();
const restored = mergeCachedPrices(config, cache, now);
const { prices, failures } = await refreshPrices(restored, {
  now, balticLoader: fetchBalticPrices, jkmLoader: fetchJkmReference, log: console.log,
});
await writeFile(file, `${JSON.stringify(prices, null, 2)}\n`);
await mkdir(new URL('../.cache/', import.meta.url), { recursive: true });
await writeFile(cacheFile, `${JSON.stringify(priceCache(prices), null, 2)}\n`);
if (failures) process.exitCode = 1;
