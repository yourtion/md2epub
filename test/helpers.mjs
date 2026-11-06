import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { DOMParser } from '@xmldom/xmldom';

// Read small fixture EPUBs through the ZIP central directory, including data descriptors.
export function readEpub(filename) {
  const zip = readFileSync(filename);
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(end >= 0, 'complete ZIP end record');
  let offset = zip.readUInt32LE(end + 16);
  const entries = new Map();
  for (let index = 0; index < zip.readUInt16LE(end + 10); index++) {
    assert.equal(zip.readUInt32LE(offset), 0x02014b50);
    const method = zip.readUInt16LE(offset + 10);
    const size = zip.readUInt32LE(offset + 20);
    const nameLength = zip.readUInt16LE(offset + 28);
    const name = zip.toString('utf8', offset + 46, offset + 46 + nameLength);
    const local = zip.readUInt32LE(offset + 42);
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const compressed = zip.subarray(start, start + size);
    entries.set(name, { method, data: method === 8 ? inflateRawSync(compressed) : compressed });
    offset += 46 + nameLength + zip.readUInt16LE(offset + 30) + zip.readUInt16LE(offset + 32);
  }
  assert.equal(zip.toString('utf8', 30, 38), 'mimetype', 'mimetype is first local ZIP entry');
  assert.equal(entries.get('mimetype').method, 0);
  assert.equal(entries.get('mimetype').data.toString(), 'application/epub+zip');
  return entries;
}

export function parseXml(text) {
  const errors = [];
  const document = new DOMParser({ errorHandler: {
    warning: error => errors.push(error),
    error: error => errors.push(error),
    fatalError: error => errors.push(error),
  } }).parseFromString(text, 'application/xml');
  assert.deepEqual(errors, [], 'XML parses without warnings or errors');
  return document;
}

export function validateEpub(entries) {
  for (const [name, { data }] of entries) {
    if (/\.(?:xml|xhtml|opf|ncx)$/.test(name)) parseXml(data.toString());
  }
  const container = parseXml(entries.get('META-INF/container.xml').data.toString());
  assert.equal(container.getElementsByTagName('rootfile')[0].getAttribute('full-path'), 'OEBPS/content.opf');
  const opf = parseXml(entries.get('OEBPS/content.opf').data.toString());
  for (const element of Array.from(opf.getElementsByTagName('dc:description'))) assert.ok(element.textContent.trim(), 'optional description must not be empty');
  const manifest = Array.from(opf.getElementsByTagName('item'));
  const ids = new Set(manifest.map(item => item.getAttribute('id')));
  assert.equal(ids.size, manifest.length, 'unique manifest IDs');
  for (const item of manifest) assert.ok(entries.has(`OEBPS/${item.getAttribute('href')}`), `manifest asset ${item.getAttribute('href')} exists`);
  for (const ref of Array.from(opf.getElementsByTagName('itemref'))) assert.ok(ids.has(ref.getAttribute('idref')));
  return opf;
}
