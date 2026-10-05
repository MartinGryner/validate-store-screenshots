import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import { storeTargets, validateSet } from '@grunersoftware/store-screenshot-specs';

// Operational limits, not store requirements. Avoid decoding unbounded input in CI.
export const MAX_BYTES = 64 * 1024 * 1024;
export const MAX_PIXELS = 24_000_000;

export function inspectBuffer(buffer, name) {
  if (buffer.length > MAX_BYTES) throw new Error('Exceeds the validator safety limit of 64 MiB per file.');
  let width, height, mime, hasAlpha, pngBitDepth = null, pngColorType = null;
  if (buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
    if (buffer.length < 33 || buffer.toString('ascii', 12, 16) !== 'IHDR') throw new Error('Invalid PNG header.');
    width = buffer.readUInt32BE(16); height = buffer.readUInt32BE(20);
    if (!width || !height || width * height > MAX_PIXELS) throw new Error('Invalid dimensions or exceeds the 24 megapixel decoder safety limit.');
    pngBitDepth = buffer[24]; pngColorType = buffer[25];
    hasAlpha = [4,6].includes(pngColorType);
    let offset = 8, ended = false;
    while (offset + 12 <= buffer.length) {
      const length = buffer.readUInt32BE(offset);
      if (offset + 12 + length > buffer.length) throw new Error('Truncated PNG chunk.');
      const type = buffer.toString('ascii', offset + 4, offset + 8);
      if (type === 'tRNS') hasAlpha = true;
      offset += length + 12;
      if (type === 'IEND') { ended = true; break; }
    }
    if (!ended) throw new Error('Missing PNG end marker.');
    // Decode with CRC checking: a plausible header alone must never pass.
    PNG.sync.read(buffer, {checkCRC:true});
    mime = 'image/png';
  } else if (buffer[0] === 255 && buffer[1] === 216) {
    const decoded = jpeg.decode(buffer, {useTArray:true, tolerantDecoding:false, maxResolutionInMP:24, maxMemoryUsageInMB:256});
    width = decoded.width; height = decoded.height; mime = 'image/jpeg'; hasAlpha = false;
  } else {
    throw new Error('Unsupported image signature. Export a PNG or JPEG; renaming the extension does not convert it.');
  }
  return { name, width, height, size:buffer.length, mime, hasAlpha, pngBitDepth, pngColorType };
}

export async function validateDirectory(directory, target, workspace) {
  if (!Object.hasOwn(storeTargets, target)) throw new Error(`Unsupported target: ${target}. Choose ${Object.keys(storeTargets).join(', ')}.`);
  const root = await realpath(workspace);
  const folder = await realpath(path.resolve(root, directory));
  const rel = path.relative(root, folder);
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) throw new Error('Directory must be inside the workspace.');
  if (!(await stat(folder)).isDirectory()) throw new Error('Input must be a directory.');
  const entries = (await readdir(folder, {withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name));
  const inputs = [], errors = [];
  const files = entries.filter(e => !e.name.startsWith('.') && !e.isDirectory());
  if (!files.length) throw new Error('No files found. Select one non-empty locale/device screenshot directory.');
  if (files.length > 100) throw new Error('More than 100 files in the set; select one locale and device directory.');
  for (const entry of files) {
    const filename = path.join(folder, entry.name);
    const name = path.relative(root, filename).split(path.sep).join('/');
    try {
      if (!entry.isFile() || entry.isSymbolicLink()) throw new Error('Symlinks and special files are not supported.');
      if ((await stat(filename)).size > MAX_BYTES) throw new Error('Exceeds the validator safety limit of 64 MiB per file.');
      inputs.push(inspectBuffer(await readFile(filename), name));
    } catch (error) { errors.push({name, message:error.message}); }
  }
  const report = validateSet(inputs, target);
  return {...report, errors, failures:report.failures + errors.length, target, files:files.length};
}
