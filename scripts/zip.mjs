// Minimal, dependency-free ZIP writer for extension packages.
//
// Why not PowerShell Compress-Archive? Windows PowerShell 5.1 stores entry names with backslashes
// (e.g. `popup\popup.html`). The ZIP spec requires `/`, so Firefox could read manifest.json at the
// root but reported every file inside a folder as "file not found". This writer always uses `/`,
// puts the folder's contents at the archive root, and produces identical archives on every OS.
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC-32 of a buffer (uses zlib.crc32 when the Node version provides it). */
function crc32(buffer) {
  if (typeof zlib.crc32 === 'function') return zlib.crc32(buffer) >>> 0;
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Lists files under `dir` recursively as forward-slash paths relative to `dir`, sorted. */
async function listFiles(dir, prefix = '') {
  const out = [];
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await listFiles(absolute, relative));
    else if ((await stat(absolute)).isFile()) out.push(relative);
  }
  return out;
}

/** Converts a Date to MS-DOS time/date fields used by ZIP headers. */
function dosDateTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

/** Writes the contents of `sourceDir` (not the folder itself) to a ZIP file at `zipPath`. */
export async function zipDirectory(sourceDir, zipPath) {
  const files = await listFiles(sourceDir);
  const locals = [];
  const centrals = [];
  let offset = 0;
  const { time, day } = dosDateTime(new Date());
  for (const name of files) {
    if (name.includes('\\')) throw new Error(`Refusing to write backslash in ZIP entry: ${name}`);
    const data = await readFile(path.join(sourceDir, ...name.split('/')));
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const useDeflate = deflated.length < data.length;
    const body = useDeflate ? deflated : data;
    const nameBytes = Buffer.from(name, 'utf8');
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);   // local file header signature
    local.writeUInt16LE(20, 4);           // version needed
    local.writeUInt16LE(0x0800, 6);       // flags: UTF-8 names
    local.writeUInt16LE(useDeflate ? 8 : 0, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBytes, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // central directory signature
    central.writeUInt16LE(0x031e, 4);     // made by: UNIX, spec 3.0 (forward-slash paths)
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(useDeflate ? 8 : 0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(day, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30);          // extra length
    central.writeUInt16LE(0, 32);          // comment length
    central.writeUInt16LE(0, 34);          // disk number
    central.writeUInt16LE(0, 36);          // internal attributes
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38); // external attributes: regular file, rw-r--r--
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);

    offset += local.length + nameBytes.length + body.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);       // end of central directory signature
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  await writeFile(zipPath, Buffer.concat([...locals, ...centrals, end]));
  return files.length;
}
