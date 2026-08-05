/**
 * Regression suite - one test per defect found in the 1.4.8 audit.
 * Each of these either threw during render, silently corrupted the output, or
 * hung the process before the utils.js rewrite. Do not delete without a reason.
 */
import React from 'react';
import {render} from '@testing-library/react';
import {JsonHighlighter} from './index';

const marks = ui => [...render(ui).container.querySelectorAll('mark')].map(m => m.textContent);

describe('regression: original bug reports, against src', () => {
	it('README example still works', () => {
		const json = {key1: {innerArray: ['string to mark']}, key2: {objectToMark: {a: 1, b: 2, c: ['xyz']}}};
		const got = marks(<JsonHighlighter json={json} space={4} paths={['key1.innerArray[0]', 'key2.objectToMark']} />);
		expect(got[0]).toBe('"string to mark"');
		expect(got[1]).toBe(JSON.stringify(json.key2.objectToMark, null, 4).split('\n').map((l,i)=>i?'        '+l:l).join('\n'));
	});

	it('BUG 1: unknown path no longer throws during render', () => {
		const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
		expect(() => render(<JsonHighlighter json={{a: 1}} paths={['nope']} space={2} />)).not.toThrow();
		spy.mockRestore();
	});

	it('BUG 2: non-string path no longer throws TypeError', () => {
		const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
		expect(() => render(<JsonHighlighter json={{a: 1}} paths={[42]} space={2} />)).not.toThrow();
		spy.mockRestore();
	});

	it('BUG 3: leading-index path on a top-level array now works', () => {
		expect(marks(<JsonHighlighter json={[{id: 1}, {id: 2}]} space={2} paths={['[1].id']} />)).toEqual(['2']);
	});

	it('BUG 4: $-replacement patterns in values no longer corrupt output', () => {
		for (const v of ['$&', "$'", '$`', '$1', '$$']) {
			expect(marks(<JsonHighlighter json={{a: 'x', b: v}} space={2} paths={['b']} />)).toEqual([JSON.stringify(v)]);
		}
	});

	it('BUG 5: duplicate paths no longer hang the process', () => {
		expect(marks(<JsonHighlighter json={{a: 'x', b: 'y'}} space={2} paths={['a', 'a', 'a']} />)).toEqual(['"x"']);
	});

	it('BUG 6: data containing the literal marker string is highlighted correctly', () => {
		expect(marks(<JsonHighlighter json={{a: '__marker__', b: 'target'}} space={2} paths={['b']} />)).toEqual(['"target"']);
		expect(marks(<JsonHighlighter json={{'__marker__': 1, b: 'target'}} space={2} paths={['b']} />)).toEqual(['"target"']);
	});

	it('BUG 7: prototype-chain paths are rejected, no pollution', () => {
		const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
		render(<JsonHighlighter json={{a: 1}} space={2} paths={['__proto__.polluted', 'constructor.prototype.x']} />);
		expect({}.polluted).toBeUndefined();
		expect({}.x).toBeUndefined();
		spy.mockRestore();
	});

	it('BUG 8: overlapping ancestor/descendant paths produce one clean chunk', () => {
		expect(marks(<JsonHighlighter json={{a: {b: 1}, c: 2}} space={2} paths={['a.b', 'a']} />))
			.toEqual([JSON.stringify({b: 1}, null, 2).split('\n').map((l,i)=>i?'  '+l:l).join('\n')]);
	});

	it('BUG 9: pass-through props cannot clobber the computed internals', () => {
		// README invites {...props}; spreading them last used to desync the chunks
		const json = {a: 'x', b: 'y'};
		const {container} = render(
			<JsonHighlighter
				json={json}
				space={2}
				paths={['b']}
				textToHighlight="HIJACKED"
				searchWords={['nope']}
				findChunks={() => [{start: 0, end: 3}]}
			/>,
		);
		expect(container.textContent).toBe(JSON.stringify(json, null, 2));
		expect([...container.querySelectorAll('mark')].map(m => m.textContent)).toEqual(['"y"']);
	});
});
