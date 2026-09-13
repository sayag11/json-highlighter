/* eslint-disable no-undef */
import path from 'path';
import {get, cloneDeep} from 'lodash';
import {
	parseJson,
	getSortedPaths,
	findChunks,
	replacePathsWithMarkers,
	createMarker,
} from './utils';

const {spawnSync} = require('child_process');

const MARKER = '__marker__';

/* ------------------------------------------------------------------------- *
 * Safety harness for findChunks - REGRESSION GUARD, keep this.
 *
 * findChunks used to delegate to a `findEndIndex` helper containing an
 * UNBOUNDED `while` loop:
 *
 *     while (j < sw.length) { if (str[i] === sanitizedSw[j]) j++; i++; }
 *
 * Whenever the search word could not be matched from `startIndex` onwards - a
 * missing marker, a duplicate path, or a value corrupted while being
 * substituted back in - `i` ran off the end of the string and the loop spun
 * forever, hanging the caller's thread. A synchronous infinite loop CANNOT be
 * interrupted by jest's `testTimeout`, so it would wedge the whole run rather
 * than fail a test.
 *
 * The current implementation has no unbounded loop, but every findChunks call
 * is still made in a short-lived child node process that is SIGKILLed after
 * CHILD_TIMEOUT_MS. If anyone reintroduces a non-terminating scan, it surfaces
 * here as an ordinary test failure instead of a frozen CI job.
 * ------------------------------------------------------------------------- */

const CHILD_TIMEOUT_MS = 3000;
const REPO_ROOT = path.resolve(__dirname, '..');

const buildChildScript = () => {
	// eslint-disable-next-line global-require
	const babel = require('@babel/core');
	// eslint-disable-next-line global-require
	const {code} = babel.transformFileSync(path.join(REPO_ROOT, 'src', 'utils.js'), {cwd: REPO_ROOT});
	// the child has no module resolution rooted in the repo -> pin every lodash import
	// (including deep ones like lodash/cloneDeep) to an absolute path
	const pinned = code.replace(
		/require\("(lodash(?:\/[\w-]+)?)"\)/g,
		(match, request) => `require(${JSON.stringify(require.resolve(request))})`,
	);

	return `
const code = ${JSON.stringify(pinned)};
const mod = {exports: {}};
new Function('module', 'exports', 'require', code)(mod, mod.exports, require);
const c = JSON.parse(process.env.CASE);
const space = c.spaceUndefined ? undefined : c.space;
let out;
try {
	out = {ok: true, chunks: mod.exports.findChunks(space, c.jsonWithMarkers, c.marker)({searchWords: c.searchWords})};
}
catch (e) {
	out = {ok: false, error: (e && e.message) ? e.constructor.name + ': ' + e.message : String(e)};
}
process.stdout.write('@@RESULT@@' + JSON.stringify(out));
`;
};

let childScript;
const getChildScript = () => {
	if (!childScript) childScript = buildChildScript();
	return childScript;
};

/** Runs findChunks(space, jsonWithMarkers, marker)({searchWords}) out-of-process. */
const runFindChunks = ({space, jsonWithMarkers, searchWords, marker = MARKER}) => {
	const payload = {
		space: space === undefined ? null : space,
		spaceUndefined: space === undefined,
		jsonWithMarkers,
		searchWords,
		marker,
	};
	const res = spawnSync(process.execPath, ['-e', getChildScript()], {
		env: {...process.env, CASE: JSON.stringify(payload)},
		encoding: 'utf8',
		timeout: CHILD_TIMEOUT_MS,
		killSignal: 'SIGKILL',
		maxBuffer: 32 * 1024 * 1024,
	});

	const timedOut = (res.error && res.error.code === 'ETIMEDOUT') || res.signal === 'SIGKILL';
	if (timedOut) {
		throw new Error(
			`findChunks did not terminate within ${CHILD_TIMEOUT_MS}ms ` +
				'- a non-terminating scan has been reintroduced into src/utils.js',
		);
	}
	const stdout = res.stdout || '';
	const idx = stdout.indexOf('@@RESULT@@');
	if (idx === -1) {
		throw new Error(`findChunks child failed (status ${res.status}): ${res.stderr || res.error}`);
	}
	const parsed = JSON.parse(stdout.slice(idx + '@@RESULT@@'.length));
	if (!parsed.ok) throw new Error(`findChunks threw: ${parsed.error}`);
	return parsed.chunks;
};

/**
 * The exact substring that SHOULD be highlighted for a value living at `depth`
 * segments deep inside the document. JSON.stringify indents nested lines by
 * `space * depth`, so re-indenting the standalone rendering by that amount
 * reproduces the document rendering byte for byte.
 */
const expectedHighlight = (value, space, depth) => {
	const rendered = JSON.stringify(value, null, space);
	const indentSize = typeof space === 'number' ? space : 0;
	if (!indentSize || !rendered.includes('\n')) return rendered;
	const pad = ' '.repeat(indentSize * depth);
	return rendered
		.split('\n')
		.map((line, i) => (i === 0 ? line : pad + line))
		.join('\n');
};

/**
 * Drives the whole pipeline exactly like JsonHighlighter does, and asserts the
 * central property: slicing the returned {start, end} offsets out of the real
 * pretty-printed text yields precisely the intended value.
 */
const expectHighlights = ({json, paths, space}) => {
	const parsed = parseJson(json);
	const sortedPaths = getSortedPaths(parsed, paths);
	const marker = createMarker(parsed);
	const jsonWithMarkers = replacePathsWithMarkers(parsed, sortedPaths, marker);
	// the search words must be rendered exactly as they appear in the document
	const searchWords = sortedPaths.map(p => JSON.stringify(get(parsed, p), null, space));
	const text = JSON.stringify(parsed, null, space);

	const chunks = runFindChunks({space, jsonWithMarkers, searchWords, marker});
	const expected = sortedPaths.map(p => expectedHighlight(get(parsed, p), space, p.length));

	expect(chunks).toHaveLength(sortedPaths.length);
	chunks.forEach((chunk, i) => {
		expect(text.slice(chunk.start, chunk.end)).toBe(expected[i]);
	});
	// offsets must be sane and strictly ordered
	chunks.forEach(chunk => {
		expect(chunk.start).toBeGreaterThanOrEqual(0);
		expect(chunk.end).toBeGreaterThan(chunk.start);
		expect(chunk.end).toBeLessThanOrEqual(text.length);
	});
	for (let i = 1; i < chunks.length; i++) {
		expect(chunks[i].start).toBeGreaterThanOrEqual(chunks[i - 1].end);
	}
	return {chunks, text};
};

/* ------------------------------------------------------------------------- *
 * parseJson
 * ------------------------------------------------------------------------- */

describe('parseJson', () => {
	it('returns an object input untouched (same reference)', () => {
		const obj = {a: 1, b: {c: 2}};
		expect(parseJson(obj)).toBe(obj);
	});

	it('returns an array input untouched (same reference)', () => {
		const arr = [1, 'two', {three: 3}];
		expect(parseJson(arr)).toBe(arr);
	});

	it('parses a valid JSON object string', () => {
		expect(parseJson('{"a":1,"b":"two"}')).toEqual({a: 1, b: 'two'});
	});

	it('parses a valid JSON array string', () => {
		expect(parseJson('[1,2,3]')).toEqual([1, 2, 3]);
	});

	it('parses a deeply nested JSON string', () => {
		const source = '{"a":{"b":{"c":[1,{"d":true}]}}}';
		expect(parseJson(source)).toEqual({a: {b: {c: [1, {d: true}]}}});
	});

	it('parses JSON strings that contain scalars', () => {
		expect(parseJson('42')).toBe(42);
		expect(parseJson('true')).toBe(true);
		expect(parseJson('null')).toBeNull();
		expect(parseJson('"hello"')).toBe('hello');
	});

	it('returns an invalid JSON string unchanged', () => {
		expect(parseJson('not json at all')).toBe('not json at all');
		expect(parseJson('{a: 1}')).toBe('{a: 1}');
		expect(parseJson('')).toBe('');
	});

	it('returns null unchanged', () => {
		expect(parseJson(null)).toBeNull();
	});

	it('returns undefined unchanged', () => {
		expect(parseJson(undefined)).toBeUndefined();
	});

	it('returns a number input unchanged', () => {
		expect(parseJson(42)).toBe(42);
		expect(parseJson(0)).toBe(0);
	});

	it('returns a boolean input unchanged', () => {
		expect(parseJson(true)).toBe(true);
		expect(parseJson(false)).toBe(false);
	});
});

/* ------------------------------------------------------------------------- *
 * getSortedPaths
 * ------------------------------------------------------------------------- */

describe('getSortedPaths', () => {
	it('returns an empty array for empty paths', () => {
		expect(getSortedPaths({a: 1}, [])).toEqual([]);
	});

	it('sorts dot paths into document order', () => {
		const json = {a: 1, b: 2, c: 3};
		expect(getSortedPaths(json, ['c', 'a', 'b'])).toEqual([['a'], ['b'], ['c']]);
	});

	it('keeps paths that are already in document order', () => {
		const json = {a: 1, b: 2, c: 3};
		expect(getSortedPaths(json, ['a', 'b', 'c'])).toEqual([['a'], ['b'], ['c']]);
	});

	it('normalizes bracket paths to path segments', () => {
		const json = {a: [{b: 1}, {b: 2}]};
		expect(getSortedPaths(json, ['a[1].b', 'a[0].b'])).toEqual([
			['a', '0', 'b'],
			['a', '1', 'b'],
		]);
	});

	it('sorts mixed dot/bracket paths into document order', () => {
		const json = {z: 1, a: {y: 2, b: [10, {c: 3}]}, m: 4};
		const sorted = getSortedPaths(json, ['m', 'a.b[1].c', 'z', 'a.y']);
		expect(sorted).toEqual([['z'], ['a', 'y'], ['a', 'b', '1', 'c'], ['m']]);
		expect(sorted.map(p => get(json, p))).toEqual([1, 2, 3, 4]);
	});

	it('accepts paths pointing at whole objects and arrays', () => {
		const json = {a: {b: 1}, c: [1, 2]};
		const sorted = getSortedPaths(json, ['c', 'a']);
		expect(sorted).toEqual([['a'], ['c']]);
		expect(sorted.map(p => get(json, p))).toEqual([{b: 1}, [1, 2]]);
	});

	it('accepts paths pointing at falsy leaf values', () => {
		const json = {a: null, b: false, c: 0, d: ''};
		expect(getSortedPaths(json, ['d', 'c', 'b', 'a'])).toEqual([['a'], ['b'], ['c'], ['d']]);
	});

	it('sorts paths inside a top-level array', () => {
		const json = [{a: 1}, {a: 2}];
		expect(getSortedPaths(json, ['1.a', '0.a'])).toEqual([
			['0', 'a'],
			['1', 'a'],
		]);
	});

	it('drops an unknown path with a descriptive warning instead of throwing', () => {
		// throwing here would run during React render and unmount the consumer's tree
		const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
		try {
			expect(getSortedPaths({a: 1}, ['b'])).toEqual([]);
			expect(getSortedPaths({a: {b: 1}}, ['a.c'])).toEqual([]);
			expect(getSortedPaths({a: [1]}, ['a[5]'])).toEqual([]);
			expect(spy).toHaveBeenCalledTimes(3);
			expect(spy.mock.calls[0][0]).toMatch(/JsonHighlighter/);
		}
		finally {
			spy.mockRestore();
		}
	});

	it('keeps the valid paths when another path is unknown', () => {
		const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
		try {
			expect(getSortedPaths({a: 1, b: 2}, ['b', 'nope', 'a'])).toEqual([['a'], ['b']]);
		}
		finally {
			spy.mockRestore();
		}
	});

	it('drops a non-string, non-array path with a warning', () => {
		const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
		try {
			expect(getSortedPaths({a: 1}, [42, null, undefined, {}, 'a'])).toEqual([['a']]);
			expect(spy).toHaveBeenCalledTimes(4);
		}
		finally {
			spy.mockRestore();
		}
	});

	it('accepts a path given as an array of segments', () => {
		const json = {a: {b: [1, 2]}};
		expect(getSortedPaths(json, [['a', 'b', 1]])).toEqual([['a', 'b', '1']]);
	});

	it('deduplicates repeated paths', () => {
		// duplicates previously produced a second chunk with startIndex -1
		expect(getSortedPaths({a: 1, b: 2}, ['a', 'a', 'b', 'a'])).toEqual([['a'], ['b']]);
	});

	it('drops a path nested inside another highlighted path', () => {
		const json = {a: {b: {c: 1}}, d: 2};
		expect(getSortedPaths(json, ['a.b.c', 'a', 'd'])).toEqual([['a'], ['d']]);
	});

	it('never walks the prototype chain', () => {
		const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const json = Object.create({inherited: 'nope'});
			json.own = 1;
			expect(getSortedPaths(json, ['own'])).toEqual([['own']]);
			expect(getSortedPaths(json, ['inherited'])).toEqual([]);
			expect(getSortedPaths(json, ['constructor'])).toEqual([]);
			expect(getSortedPaths({a: 1}, ['__proto__.polluted'])).toEqual([]);
			expect(getSortedPaths({a: 1}, ['constructor.prototype.polluted'])).toEqual([]);
		}
		finally {
			spy.mockRestore();
		}
	});

	it('ignores keys whose values JSON.stringify omits', () => {
		const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const json = {a: undefined, b: () => {}, c: 1};
			expect(getSortedPaths(json, ['c'])).toEqual([['c']]);
			expect(getSortedPaths(json, ['a'])).toEqual([]);
			expect(getSortedPaths(json, ['b'])).toEqual([]);
		}
		finally {
			spy.mockRestore();
		}
	});

	it('returns an empty array for non-object json', () => {
		expect(getSortedPaths(null, ['a'])).toEqual([]);
		expect(getSortedPaths('not json', ['a'])).toEqual([]);
		expect(getSortedPaths(42, ['a'])).toEqual([]);
	});

	it('returns an empty array when paths is not an array', () => {
		expect(getSortedPaths({a: 1}, undefined)).toEqual([]);
		expect(getSortedPaths({a: 1}, 'a')).toEqual([]);
	});

	it('does not mutate the paths array it was given', () => {
		const paths = ['c', 'a'];
		const copy = [...paths];
		getSortedPaths({a: 1, c: 3}, paths);
		expect(paths).toEqual(copy);
	});

	it('supports a top-level bracket path', () => {
		const json = [10, 20, 30];
		const sorted = getSortedPaths(json, ['[1]']);
		expect(sorted).toHaveLength(1);
		expect(get(json, sorted[0])).toBe(20);
	});

	it('supports a top-level key that contains a dot, via bracket notation', () => {
		const json = {'a.b': 1, c: 2};
		const sorted = getSortedPaths(json, ['["a.b"]']);
		expect(sorted).toHaveLength(1);
		expect(get(json, sorted[0])).toBe(1);
	});

	it('supports a nested key that contains a dot, via bracket notation', () => {
		const json = {x: {'a.b': 1}};
		const sorted = getSortedPaths(json, ['x["a.b"]']);
		expect(sorted).toHaveLength(1);
		expect(get(json, sorted[0])).toBe(1);
	});

	it('handles overlapping paths from pathKey collision', () => {
		const json = {'a': {'b': 1}, 'a b': 2};
		// 'a b' and 'a', 'b' both map to 'a b' in pathKey.
		// getDeepPaths returns both. The first gets inserted, the second hits order.has(key).
		const sorted = getSortedPaths(json, ['a.b', '["a b"]']);
		expect(sorted).toHaveLength(2);
	});
});

/* ------------------------------------------------------------------------- *
 * replacePathsWithMarkers
 * ------------------------------------------------------------------------- */

describe('replacePathsWithMarkers', () => {
	it('replaces a leaf value with the marker', () => {
		expect(replacePathsWithMarkers({a: 1, b: 2}, ['a'])).toEqual({a: MARKER, b: 2});
	});

	it('replaces a whole nested object', () => {
		expect(replacePathsWithMarkers({a: {b: {c: 1}}, d: 2}, ['a.b'])).toEqual({a: {b: MARKER}, d: 2});
	});

	it('replaces a whole array', () => {
		expect(replacePathsWithMarkers({a: [1, 2, 3]}, ['a'])).toEqual({a: MARKER});
	});

	it('replaces a single array element', () => {
		expect(replacePathsWithMarkers({a: [1, 2, 3]}, ['a.1'])).toEqual({a: [1, MARKER, 3]});
	});

	it('replaces multiple paths at once', () => {
		const json = {a: 1, b: {c: 2}, d: [3, 4]};
		expect(replacePathsWithMarkers(json, ['a', 'b.c', 'd.0'])).toEqual({
			a: MARKER,
			b: {c: MARKER},
			d: [MARKER, 4],
		});
	});

	it('returns a deep clone when paths is empty', () => {
		const json = {a: {b: 1}};
		const result = replacePathsWithMarkers(json, []);
		expect(result).toEqual(json);
		expect(result).not.toBe(json);
		expect(result.a).not.toBe(json.a);
	});

	it('does not mutate the input object', () => {
		const json = {a: 1, b: {c: [1, 2, {d: 'x'}]}, e: null};
		const before = cloneDeep(json);
		replacePathsWithMarkers(json, ['a', 'b.c.2.d', 'b.c.0']);
		expect(json).toEqual(before);
	});

	it('does not mutate a top-level array input', () => {
		const json = [{a: 1}, {a: 2}];
		const before = cloneDeep(json);
		const result = replacePathsWithMarkers(json, ['0.a']);
		expect(json).toEqual(before);
		expect(result).toEqual([{a: MARKER}, {a: 2}]);
	});
});

/* ------------------------------------------------------------------------- *
 * findChunks - core behavior
 *
 * Every test here is bounded: the call runs in a child process that is killed
 * after CHILD_TIMEOUT_MS. The per-test timeouts below are just belt & braces.
 * ------------------------------------------------------------------------- */

describe('findChunks', () => {
	it('is a curried function returning a findChunks callback', () => {
		expect(typeof findChunks).toBe('function');
		expect(typeof findChunks(2, {})).toBe('function');
	});

	it('returns no chunks when there are no search words', () => {
		expect(runFindChunks({space: 2, jsonWithMarkers: {a: 1}, searchWords: []})).toEqual([]);
	}, 8000);

	it('highlights a string leaf with space=2', () => {
		expectHighlights({json: {a: 'hello', b: 'world'}, paths: ['b'], space: 2});
	}, 8000);

	it('highlights a string leaf with space=4', () => {
		expectHighlights({json: {a: 'hello', b: {c: 'world'}}, paths: ['b.c'], space: 4});
	}, 8000);

	it('highlights a string leaf with space=0', () => {
		expectHighlights({json: {a: 'hello', b: 'world'}, paths: ['b'], space: 0});
	}, 8000);

	it('highlights a string leaf with space=undefined', () => {
		expectHighlights({json: {a: 'hello', b: 'world'}, paths: ['b'], space: undefined});
	}, 8000);

	it('highlights numeric values', () => {
		expectHighlights({json: {a: 1, b: 3.14159, c: -42, d: 1e21}, paths: ['b', 'c', 'd'], space: 2});
	}, 8000);

	it('highlights boolean and null values', () => {
		expectHighlights({json: {a: true, b: false, c: null}, paths: ['a', 'b', 'c'], space: 2});
	}, 8000);

	it('highlights the first key in the document', () => {
		expectHighlights({json: {a: 'first', b: 'second'}, paths: ['a'], space: 2});
	}, 8000);

	it('highlights the last key in the document', () => {
		expectHighlights({json: {a: 'first', b: 'last'}, paths: ['b'], space: 2});
	}, 8000);

	it('highlights a nested object value', () => {
		expectHighlights({json: {a: 1, b: {c: 2, d: 'three'}}, paths: ['b'], space: 2});
	}, 8000);

	it('highlights a deeply nested object value', () => {
		expectHighlights({json: {a: {b: {c: {d: [1, 2], e: 'x'}}}}, paths: ['a.b.c'], space: 2});
	}, 8000);

	it('highlights an array value', () => {
		expectHighlights({json: {a: 'x', b: [1, 'two', null, {c: 3}]}, paths: ['b'], space: 2});
	}, 8000);

	it('highlights a single array element', () => {
		expectHighlights({json: {a: ['zero', 'one', 'two']}, paths: ['a[1]'], space: 2});
	}, 8000);

	it('highlights an object element inside an array', () => {
		expectHighlights({json: {a: [{b: 1}, {b: 2}]}, paths: ['a[1]'], space: 2});
	}, 8000);

	it('highlights an empty object and an empty array value', () => {
		expectHighlights({json: {a: {}, b: []}, paths: ['a', 'b'], space: 2});
	}, 8000);

	it('highlights multiple paths in document order', () => {
		expectHighlights({json: {a: 'one', b: {c: 'two'}, d: [3, 4]}, paths: ['d[1]', 'a', 'b.c'], space: 2});
	}, 8000);

	it('highlights multiple paths when they are given out of document order', () => {
		expectHighlights({json: {a: 1, b: 2, c: 3, d: 4}, paths: ['d', 'b'], space: 2});
	}, 8000);

	it('highlights multiple paths with space=0', () => {
		expectHighlights({json: {a: 'one', b: {c: 'two'}, d: [3, 4]}, paths: ['a', 'b.c', 'd[0]'], space: 0});
	}, 8000);

	it('highlights a mix of scalar, object and array values at once', () => {
		expectHighlights({
			json: {a: 'str', b: {c: [1, 2]}, d: [{e: true}], f: 9},
			paths: ['a', 'b.c', 'd[0]', 'f'],
			space: 2,
		});
	}, 8000);

	it('highlights values inside a top-level array', () => {
		expectHighlights({json: [{a: 'x'}, {a: 'y'}], paths: ['1.a'], space: 2});
	}, 8000);

	it('highlights the correct occurrence when two values are identical', () => {
		expectHighlights({json: {a: 'same', b: 'same', c: 'same'}, paths: ['b'], space: 2});
	}, 8000);

	it('highlights the correct occurrence when a value repeats a sibling key name', () => {
		expectHighlights({json: {a: 'b', b: 'a'}, paths: ['b'], space: 2});
	}, 8000);

	// The code already intends this: it guards with `if (startIndex > -1 ...)` and
	// console.errors otherwise - but findEndIndex is called BEFORE that guard, so
	// a missing marker spins forever instead of returning an empty chunk list.
	it('returns no chunks when the marker/search word is not present', () => {
		expect(runFindChunks({space: 2, jsonWithMarkers: {a: 1, b: 2}, searchWords: ['"missing"']})).toEqual([]);
	}, 8000);
});

/* ------------------------------------------------------------------------- *
 * findChunks - adversarial values
 * ------------------------------------------------------------------------- */

describe('findChunks - adversarial values', () => {
	it('handles a highlighted value that is exactly the marker string', () => {
		expectHighlights({json: {a: 'x', b: MARKER}, paths: ['b'], space: 2});
	}, 8000);

	it('handles an earlier, non-highlighted value that equals the marker string', () => {
		expectHighlights({json: {a: MARKER, b: 'target'}, paths: ['b'], space: 2});
	}, 8000);

	it('handles a key named like the marker', () => {
		expectHighlights({json: {[MARKER]: 1, b: 'target'}, paths: ['b'], space: 2});
	}, 8000);

	it('handles a value that merely contains the marker as a substring', () => {
		expectHighlights({json: {a: `pre${MARKER}post`, b: 'x'}, paths: ['a'], space: 2});
	}, 8000);

	it('handles a value containing $& (String.replace match pattern)', () => {
		expectHighlights({json: {a: 'before', b: 'x$&y'}, paths: ['b'], space: 2});
	}, 8000);

	it('handles a value containing $` (String.replace prefix pattern)', () => {
		expectHighlights({json: {a: 'before', b: 'x$`y'}, paths: ['b'], space: 2});
	}, 8000);

	it("handles a value containing $' (String.replace suffix pattern)", () => {
		expectHighlights({json: {a: 'before', b: "x$'y"}, paths: ['b'], space: 2});
	}, 8000);

	it('handles a value containing $$ (String.replace escaped dollar)', () => {
		expectHighlights({json: {a: 'before', b: 'price: $$100'}, paths: ['b'], space: 2});
	}, 8000);

	it('handles a value containing $1 (String.replace group pattern)', () => {
		expectHighlights({json: {a: 'before', b: 'x$1y'}, paths: ['b'], space: 2});
	}, 8000);

	it('handles a value containing a lone $', () => {
		expectHighlights({json: {a: 'before', b: 'cost is $5'}, paths: ['b'], space: 2});
	}, 8000);

	it('handles an empty string value', () => {
		expectHighlights({json: {a: 'x', b: ''}, paths: ['b'], space: 2});
	}, 8000);

	it('handles a whitespace-only string value', () => {
		expectHighlights({json: {a: 'x', b: '   '}, paths: ['b'], space: 2});
	}, 8000);

	it('handles a value containing double quotes', () => {
		expectHighlights({json: {a: 'x', b: 'he said "hi" loudly'}, paths: ['b'], space: 2});
	}, 8000);

	it('handles a value containing backslashes', () => {
		expectHighlights({json: {a: 'x', b: 'C:\\temp\\new'}, paths: ['b'], space: 2});
	}, 8000);

	it('handles a value containing newlines and tabs', () => {
		expectHighlights({json: {a: 'x', b: 'line1\nline2\tend'}, paths: ['b'], space: 2});
	}, 8000);

	it('handles a value containing control characters that JSON escapes', () => {
		expectHighlights({json: {a: 'x', b: 'bell:\u0007 nul-ish:\u0001'}, paths: ['b'], space: 2});
	}, 8000);

	it('handles a value containing non-ASCII unicode', () => {
		expectHighlights({json: {a: 'x', b: 'שלום — café 😀'}, paths: ['b'], space: 2});
	}, 8000);

	it('handles a value containing braces and brackets', () => {
		expectHighlights({json: {a: 'x', b: '{[()]}'}, paths: ['b'], space: 2});
	}, 8000);

	it('handles a value that looks like JSON', () => {
		expectHighlights({json: {a: 'x', b: '{"a": 1}'}, paths: ['b'], space: 2});
	}, 8000);

	it('handles a value that looks like a JSON array', () => {
		expectHighlights({json: {a: 'x', b: '[1, 2, {"c": null}]'}, paths: ['b'], space: 2});
	}, 8000);

	it('handles a value containing a colon-space sequence like an indented key', () => {
		expectHighlights({json: {a: 'x', b: '"key": "value"'}, paths: ['b'], space: 2});
	}, 8000);

	it('handles an object value whose strings contain braces and quotes', () => {
		expectHighlights({json: {a: 'x', b: {c: '} not the end {', d: 'say "hi"'}}, paths: ['b'], space: 2});
	}, 8000);

	it('handles a value containing literal backslash-u escape text', () => {
		expectHighlights({json: {a: 'x', b: 'literal \\u0041 text'}, paths: ['b'], space: 2});
	}, 8000);

	it('handles several adversarial values highlighted together', () => {
		expectHighlights({
			json: {a: '', b: '{"x": 1}', c: 'quote " and backslash \\', d: 'tail'},
			paths: ['a', 'b', 'c'],
			space: 2,
		});
	}, 8000);
});

/* ------------------------------------------------------------------------- *
 * createMarker - collision safety
 * ------------------------------------------------------------------------- */

describe('createMarker', () => {
	it('uses the default marker when the data does not contain it', () => {
		expect(createMarker({a: 1, b: 'hello'})).toBe(MARKER);
	});

	it('picks a non-colliding marker when a value equals the default marker', () => {
		const marker = createMarker({a: MARKER});
		expect(marker).not.toBe(MARKER);
		expect(JSON.stringify({a: MARKER})).not.toContain(marker);
	});

	it('picks a non-colliding marker when a key equals the default marker', () => {
		const marker = createMarker({[MARKER]: 1});
		expect(JSON.stringify({[MARKER]: 1})).not.toContain(marker);
	});

	it('keeps escalating while successive candidates also collide', () => {
		const json = {a: MARKER, b: `${MARKER}0__`, c: `${MARKER}1__`, d: `${MARKER}2__`};
		const marker = createMarker(json);
		expect(JSON.stringify(json)).not.toContain(marker);
		expect(marker).toBe(`${MARKER}3__`);
	});

	it('falls back to the default marker for a circular object', () => {
		const json = {a: 1};
		json.self = json;
		expect(createMarker(json)).toBe(MARKER);
	});

	it('handles json that is not an object', () => {
		expect(createMarker(null)).toBe(MARKER);
		expect(createMarker(undefined)).toBe(MARKER);
		expect(createMarker(42)).toBe(MARKER);
	});
});

/* ------------------------------------------------------------------------- *
 * findChunks - degenerate input must terminate, not hang
 * ------------------------------------------------------------------------- */

describe('findChunks - degenerate input', () => {
	it('reports and skips a search word when no marker is present', () => {
		// this exact shape used to spin findEndIndex's unbounded while loop forever
		const chunks = runFindChunks({
			space: 2,
			jsonWithMarkers: {a: 1, b: 2},
			searchWords: ['"anything"'],
		});
		expect(chunks).toEqual([]);
	}, 8000);

	it('records only as many chunks as there are markers', () => {
		const chunks = runFindChunks({
			space: 2,
			jsonWithMarkers: {a: MARKER, b: 2},
			searchWords: ['"one"', '"two"', '"three"'],
		});
		expect(chunks).toHaveLength(1);
	}, 8000);

	it('returns no chunks for an empty search word list', () => {
		expect(runFindChunks({space: 2, jsonWithMarkers: {a: MARKER}, searchWords: []})).toEqual([]);
	}, 8000);

	it('skips non-string search words instead of throwing', () => {
		const chunks = runFindChunks({
			space: 2,
			jsonWithMarkers: {a: MARKER, b: MARKER},
			searchWords: [null, '"ok"'],
		});
		expect(chunks).toHaveLength(1);
	}, 8000);

	it('returns no chunks when the object is not serializable to text', () => {
		expect(runFindChunks({space: 2, jsonWithMarkers: undefined, searchWords: ['"a"']})).toEqual([]);
	}, 8000);
});

/* ------------------------------------------------------------------------- *
 * findChunks - in-process (the implementation is provably terminating now, so
 * these can run directly and be counted by the coverage reporter)
 * ------------------------------------------------------------------------- */

describe('findChunks - in process', () => {
	it('reports a missing marker and skips that search word', () => {
		const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const chunks = findChunks(2, {a: 1})({searchWords: ['"nope"']});
			expect(chunks).toEqual([]);
			expect(spy).toHaveBeenCalledTimes(1);
			expect(spy.mock.calls[0][0]).toMatch(/was not found in text/);
		}
		finally {
			spy.mockRestore();
		}
	});

	it('produces offsets that exactly delimit the value', () => {
		const json = {a: 'first', b: 'second'};
		const marker = createMarker(json);
		const withMarkers = replacePathsWithMarkers(json, [['b']], marker);
		const [chunk] = findChunks(2, withMarkers, marker)({searchWords: ['"second"']});
		expect(JSON.stringify(json, null, 2).slice(chunk.start, chunk.end)).toBe('"second"');
	});

	it('honours a custom marker', () => {
		const json = {a: 'x'};
		const withMarkers = replacePathsWithMarkers(json, [['a']], '@@custom@@');
		const [chunk] = findChunks(2, withMarkers, '@@custom@@')({searchWords: ['"x"']});
		expect(JSON.stringify(json, null, 2).slice(chunk.start, chunk.end)).toBe('"x"');
	});

	it('returns no chunks when str is not a string', () => {
		expect(findChunks(2, undefined)({searchWords: ['"a"']})).toEqual([]);
	});

	it('returns pretty unchanged when pad is empty but pretty has newlines', () => {
		const json = {a: 'line1\nline2'};
		const marker = createMarker(json);
		const withMarkers = replacePathsWithMarkers(json, [['a']], marker);
		// stringified without space will have no indentation (pad is '')
		const [chunk] = findChunks(undefined, withMarkers, marker)({searchWords: ['"line1\\nline2"']});
		expect(JSON.stringify(json, null, undefined).slice(chunk.start, chunk.end)).toBe('"line1\\nline2"');
	});
});
