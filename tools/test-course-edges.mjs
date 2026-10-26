import assert from 'node:assert/strict';
import { publishedWidth } from '../src/course-edges.js';
import { RESORTS } from '../src/resorts.js';

// A resort's published widths match its OSM run names; anything else falls through to the other sources.
assert.equal(publishedWidth('太平コース', RESORTS.zao.widths), 30);
assert.equal(publishedWidth('大平コース', RESORTS.zao.widths), 30);
assert.equal(publishedWidth('ザンゲ坂・樹氷原コース', RESORTS.zao.widths), undefined);
assert.equal(publishedWidth('太平コース', RESORTS.niseko.widths), undefined);
assert.equal(publishedWidth(undefined, RESORTS.zao.widths), undefined);
console.log('course edges ok');
