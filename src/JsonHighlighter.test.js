import React from 'react';
import {render} from '@testing-library/react';
import JsonHighlighter from './JsonHighlighter';
import * as indexExports from './index';

/*
 * NOTE ON SAFETY: `findEndIndex` in utils.js contains an unbounded `while` loop.
 * Every test in this file is written so that it can only fail fast (a thrown
 * error / a wrong assertion) and never spin forever. Always run this suite with
 * `--testTimeout=5000`.
 */

// ---------------------------------------------------------------------------
// fixtures & helpers
// ---------------------------------------------------------------------------

const readmeJson = {
	key1: {
		innerArray: ['string to mark'],
	},
	key2: {
		objectToMark: {
			a: 1,
			b: 2,
			c: ['xyz'],
		},
	},
};

const mixedJson = {
	name: 'alpha',
	count: 42,
	active: false,
	nested: {
		deep: 'value',
		list: [10, 20],
	},
};

/**
 * Re-creates the exact substring a value occupies inside the pretty printed
 * JSON: `JSON.stringify(value, null, space)` with every line but the first
 * pushed right by the value's nesting depth.
 */
const blockAt = (value, space, depth) => {
	const pad = ' '.repeat((Number(space) || 0) * depth);
	return JSON.stringify(value, null, space)
		.split('\n')
		.join(`\n${pad}`);
};

const marks = container => Array.from(container.querySelectorAll('mark')).map(m => m.textContent);

let consoleErrorSpy;

beforeEach(() => {
	consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
	consoleErrorSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// 1. Rendering
// ---------------------------------------------------------------------------

describe('rendering the pretty-printed JSON', () => {
	it.each([['space=2', 2], ['space=4', 4], ['space=0', 0], ['space=undefined', undefined]])(
		'renders the complete JSON text for %s',
		(_label, space) => {
			const {container} = render(<JsonHighlighter json={readmeJson} space={space} paths={[]} />);

			expect(container.textContent).toBe(JSON.stringify(readmeJson, null, space));
			expect(consoleErrorSpy).not.toHaveBeenCalled();
		},
	);

	it('still renders the whole text when values are highlighted', () => {
		const {container} = render(
			<JsonHighlighter json={readmeJson} space={2} paths={['key1.innerArray[0]', 'key2.objectToMark']} />,
		);

		expect(container.textContent).toBe(JSON.stringify(readmeJson, null, 2));
		expect(consoleErrorSpy).not.toHaveBeenCalled();
	});

	it('renders a single wrapper <span> as its root element', () => {
		const {container} = render(<JsonHighlighter json={readmeJson} space={2} />);

		expect(container.childNodes).toHaveLength(1);
		expect(container.firstChild.tagName).toBe('SPAN');
	});
});

// ---------------------------------------------------------------------------
// 2. Highlighting
// ---------------------------------------------------------------------------

describe('highlighting values by path', () => {
	it('highlights a single leaf string value (including its quotes)', () => {
		const {container} = render(<JsonHighlighter json={mixedJson} space={2} paths={['name']} />);

		expect(marks(container)).toEqual(['"alpha"']);
		expect(consoleErrorSpy).not.toHaveBeenCalled();
	});

	it('highlights a nested leaf string value', () => {
		const {container} = render(<JsonHighlighter json={mixedJson} space={2} paths={['nested.deep']} />);

		expect(marks(container)).toEqual(['"value"']);
	});

	it('highlights a numeric value', () => {
		const {container} = render(<JsonHighlighter json={mixedJson} space={2} paths={['count']} />);

		expect(marks(container)).toEqual(['42']);
		expect(consoleErrorSpy).not.toHaveBeenCalled();
	});

	it('highlights a boolean value', () => {
		const {container} = render(<JsonHighlighter json={mixedJson} space={2} paths={['active']} />);

		expect(marks(container)).toEqual(['false']);
		expect(consoleErrorSpy).not.toHaveBeenCalled();
	});

	it('highlights an array element addressed with bracket notation', () => {
		const {container} = render(<JsonHighlighter json={readmeJson} space={2} paths={['key1.innerArray[0]']} />);

		expect(marks(container)).toEqual(['"string to mark"']);
	});

	it('highlights an array element addressed with dot notation', () => {
		const {container} = render(<JsonHighlighter json={readmeJson} space={2} paths={['key1.innerArray.0']} />);

		expect(marks(container)).toEqual(['"string to mark"']);
	});

	it('highlights a numeric array element', () => {
		const {container} = render(<JsonHighlighter json={mixedJson} space={2} paths={['nested.list[1]']} />);

		expect(marks(container)).toEqual(['20']);
	});

	it('highlights a whole nested object block, formatting included', () => {
		const {container} = render(<JsonHighlighter json={readmeJson} space={2} paths={['key2.objectToMark']} />);

		const highlighted = marks(container);
		expect(highlighted).toHaveLength(1);
		// depth 2: the object sits under key2 -> objectToMark
		expect(highlighted[0]).toBe(blockAt(readmeJson.key2.objectToMark, 2, 2));
		expect(highlighted[0]).toContain('\n');
		expect(JSON.parse(highlighted[0])).toEqual(readmeJson.key2.objectToMark);
		expect(container.textContent).toContain(highlighted[0]);
	});

	it('highlights a whole nested array block, formatting included', () => {
		const {container} = render(<JsonHighlighter json={readmeJson} space={2} paths={['key1.innerArray']} />);

		expect(marks(container)).toEqual([blockAt(readmeJson.key1.innerArray, 2, 2)]);
	});

	it('highlights multiple paths at once, in document order', () => {
		const {container} = render(
			<JsonHighlighter json={readmeJson} space={2} paths={['key1.innerArray[0]', 'key2.objectToMark']} />,
		);

		expect(marks(container)).toEqual([
			'"string to mark"',
			blockAt(readmeJson.key2.objectToMark, 2, 2),
		]);
	});

	it('sorts paths by their position in the JSON regardless of the given order', () => {
		const {container} = render(
			<JsonHighlighter json={readmeJson} space={2} paths={['key2.objectToMark', 'key1.innerArray[0]']} />,
		);

		expect(marks(container)).toEqual([
			'"string to mark"',
			blockAt(readmeJson.key2.objectToMark, 2, 2),
		]);
	});

	it('highlights several values of different types at once', () => {
		const {container} = render(
			<JsonHighlighter json={mixedJson} space={2} paths={['name', 'count', 'active', 'nested.deep']} />,
		);

		expect(marks(container)).toEqual(['"alpha"', '42', 'false', '"value"']);
		expect(container.textContent).toBe(JSON.stringify(mixedJson, null, 2));
	});

	it('highlights correctly when the JSON is not indented (space=0)', () => {
		const {container} = render(<JsonHighlighter json={mixedJson} space={0} paths={['name', 'count']} />);

		expect(container.textContent).toBe(JSON.stringify(mixedJson));
		expect(marks(container)).toEqual(['"alpha"', '42']);
	});

	it('highlights correctly when space is omitted entirely', () => {
		const {container} = render(<JsonHighlighter json={readmeJson} paths={['key2.objectToMark']} />);

		expect(container.textContent).toBe(JSON.stringify(readmeJson));
		expect(marks(container)).toEqual([JSON.stringify(readmeJson.key2.objectToMark)]);
	});

	it('does not highlight a different occurrence of the same value elsewhere', () => {
		const json = {first: 'dup', second: 'dup'};
		const {container} = render(<JsonHighlighter json={json} space={2} paths={['second']} />);

		expect(marks(container)).toEqual(['"dup"']);

		// the highlighted node must be the *second* occurrence: everything rendered
		// before the <mark> already contains both keys.
		const mark = container.querySelector('mark');
		let before = '';
		for (const node of container.firstChild.childNodes) {
			if (node === mark) break;
			before += node.textContent;
		}
		expect(before).toContain('"first"');
		expect(before).toContain('"second"');
		// ...and the first occurrence of the value is left un-highlighted
		expect(before).toContain('"first": "dup"');
	});
});

// ---------------------------------------------------------------------------
// 3. The README example, end to end (the documented contract)
// ---------------------------------------------------------------------------

describe('README example', () => {
	const paths = ['key1.innerArray[0]', 'key2.objectToMark'];

	it('produces exactly the two documented highlights with space=4', () => {
		const {container} = render(<JsonHighlighter json={readmeJson} space={4} paths={paths} />);

		const fullText = JSON.stringify(readmeJson, null, 4);
		expect(container.textContent).toBe(fullText);

		const highlighted = marks(container);
		expect(highlighted).toHaveLength(2);
		expect(highlighted[0]).toBe('"string to mark"');
		expect(highlighted[1]).toBe(
			'{\n            "a": 1,\n            "b": 2,\n            "c": [\n                "xyz"\n            ]\n        }',
		);
		expect(highlighted[1]).toBe(blockAt(readmeJson.key2.objectToMark, 4, 2));
		expect(fullText).toContain(highlighted[1]);
		expect(consoleErrorSpy).not.toHaveBeenCalled();
	});

	it('works inside a <pre>, as documented', () => {
		const {container} = render(
			<pre>
				<JsonHighlighter json={readmeJson} space={4} paths={paths} />
			</pre>,
		);

		expect(container.querySelector('pre').textContent).toBe(JSON.stringify(readmeJson, null, 4));
		expect(container.querySelectorAll('mark')).toHaveLength(2);
	});
});

// ---------------------------------------------------------------------------
// 4. Props passthrough to react-highlight-words
// ---------------------------------------------------------------------------

describe('props passthrough to react-highlight-words', () => {
	const paths = ['key1.innerArray[0]'];

	it('applies highlightClassName to the highlighted nodes', () => {
		const {container} = render(
			<JsonHighlighter json={readmeJson} space={2} paths={paths} highlightClassName="hl" />,
		);

		const mark = container.querySelector('mark');
		expect(mark).toHaveClass('hl');
	});

	it('applies highlightStyle to the highlighted nodes', () => {
		const {container} = render(
			<JsonHighlighter
				json={readmeJson}
				space={2}
				paths={paths}
				highlightStyle={{backgroundColor: 'rgb(255, 0, 0)'}}
			/>,
		);

		expect(container.querySelector('mark')).toHaveStyle({backgroundColor: 'rgb(255, 0, 0)'});
	});

	it('honours a custom highlightTag', () => {
		const {container} = render(
			<JsonHighlighter json={readmeJson} space={2} paths={paths} highlightTag="strong" />,
		);

		expect(container.querySelectorAll('mark')).toHaveLength(0);
		const strongs = container.querySelectorAll('strong');
		expect(strongs).toHaveLength(1);
		expect(strongs[0].textContent).toBe('"string to mark"');
	});

	it('honours a custom highlightTag given as a component', () => {
		const CustomTag = ({children}) => <b data-testid="custom">{children}</b>;
		const {container} = render(
			<JsonHighlighter json={readmeJson} space={2} paths={paths} highlightTag={CustomTag} />,
		);

		expect(container.querySelector('[data-testid="custom"]').textContent).toBe('"string to mark"');
	});

	it('applies unhighlightClassName to the non-highlighted nodes', () => {
		const {container} = render(
			<JsonHighlighter json={readmeJson} space={2} paths={paths} unhighlightClassName="plain" />,
		);

		const plain = container.querySelectorAll('.plain');
		expect(plain.length).toBeGreaterThan(0);
		plain.forEach(node => expect(node.tagName).not.toBe('MARK'));
		expect(Array.from(plain).map(n => n.textContent).join('')).not.toContain('string to mark');
	});

	it('forwards arbitrary props (title, data-*) to the wrapper span', () => {
		const {container} = render(
			<JsonHighlighter
				json={readmeJson}
				space={2}
				paths={paths}
				title="my json"
				data-testid="wrapper"
				className="outer"
			/>,
		);

		const wrapper = container.firstChild;
		expect(wrapper.tagName).toBe('SPAN');
		expect(wrapper).toHaveAttribute('title', 'my json');
		expect(wrapper).toHaveAttribute('data-testid', 'wrapper');
		expect(wrapper).toHaveClass('outer');
	});
});

// ---------------------------------------------------------------------------
// 5. Input handling
// ---------------------------------------------------------------------------

describe('input handling', () => {
	it('accepts the json as a JSON string', () => {
		const jsonString = JSON.stringify(readmeJson);
		const {container} = render(
			<JsonHighlighter json={jsonString} space={2} paths={['key1.innerArray[0]']} />,
		);

		expect(container.textContent).toBe(JSON.stringify(readmeJson, null, 2));
		expect(marks(container)).toEqual(['"string to mark"']);
		expect(consoleErrorSpy).not.toHaveBeenCalled();
	});

	it('accepts an already pretty-printed JSON string and re-formats it with `space`', () => {
		const jsonString = JSON.stringify(readmeJson, null, 8);
		const {container} = render(<JsonHighlighter json={jsonString} space={2} paths={['key2.objectToMark']} />);

		expect(container.textContent).toBe(JSON.stringify(readmeJson, null, 2));
		expect(marks(container)).toEqual([blockAt(readmeJson.key2.objectToMark, 2, 2)]);
	});

	it('renders an invalid / non-JSON string verbatim without crashing', () => {
		const raw = 'this is not json {';
		const {container} = render(<JsonHighlighter json={raw} space={2} />);

		expect(container.textContent).toBe(raw);
		expect(container.querySelectorAll('mark')).toHaveLength(0);
	});

	it('renders an empty object with no props other than defaults', () => {
		const {container} = render(<JsonHighlighter />);

		expect(container.textContent).toBe('{}');
		expect(container.querySelectorAll('mark')).toHaveLength(0);
		expect(consoleErrorSpy).not.toHaveBeenCalled();
	});

	it('renders an explicit empty object', () => {
		const {container} = render(<JsonHighlighter json={{}} space={2} paths={[]} />);

		expect(container.textContent).toBe('{}');
		expect(container.querySelectorAll('mark')).toHaveLength(0);
	});

	it('renders an empty array', () => {
		const {container} = render(<JsonHighlighter json={[]} space={2} paths={[]} />);

		expect(container.textContent).toBe('[]');
	});

	it('renders a top-level array and highlights an element', () => {
		const json = [{id: 1}, {id: 2}];
		const {container} = render(<JsonHighlighter json={json} space={2} paths={['[1].id']} />);

		expect(container.textContent).toBe(JSON.stringify(json, null, 2));
		expect(marks(container)).toEqual(['2']);
	});

	it('renders the text with zero marks for an empty paths array', () => {
		const {container} = render(<JsonHighlighter json={readmeJson} space={2} paths={[]} />);

		expect(container.textContent).toBe(JSON.stringify(readmeJson, null, 2));
		expect(container.querySelectorAll('mark')).toHaveLength(0);
		expect(consoleErrorSpy).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// 6. Error handling & robustness
// ---------------------------------------------------------------------------

describe('robustness', () => {
	/*
	 * Reasoning: this component runs inside the consumer's render phase. Throwing
	 * from render unmounts the *entire* React tree above it (React 18/19 remount
	 * semantics) for what is only a display concern - a mis-typed highlight path.
	 * The correct behaviour for a highlighting component is therefore to degrade
	 * gracefully: log a console.error so the developer notices, drop the unknown
	 * path, and still render the JSON text.
	 */
	it('does not throw when a path does not exist in the json', () => {
		expect(() =>
			render(<JsonHighlighter json={readmeJson} space={2} paths={['does.not.exist']} />),
		).not.toThrow();
	});

	it('warns and still renders the full JSON when a path does not exist', () => {
		const {container} = render(<JsonHighlighter json={readmeJson} space={2} paths={['does.not.exist']} />);

		expect(container.textContent).toBe(JSON.stringify(readmeJson, null, 2));
		expect(container.querySelectorAll('mark')).toHaveLength(0);
		expect(consoleErrorSpy).toHaveBeenCalled();
	});

	it('keeps highlighting the valid paths when one path is unknown', () => {
		const {container} = render(
			<JsonHighlighter json={readmeJson} space={2} paths={['key1.innerArray[0]', 'nope.nope']} />,
		);

		expect(container.textContent).toBe(JSON.stringify(readmeJson, null, 2));
		expect(marks(container)).toEqual(['"string to mark"']);
		expect(consoleErrorSpy).toHaveBeenCalled();
	});

	it('renders json={null} as "null" without crashing', () => {
		const {container} = render(<JsonHighlighter json={null} space={2} paths={[]} />);

		expect(container.textContent).toBe('null');
		expect(container.querySelectorAll('mark')).toHaveLength(0);
	});

	it('does not crash when paths contains a non-string entry', () => {
		expect(() =>
			render(<JsonHighlighter json={mixedJson} space={2} paths={['name', 42]} />),
		).not.toThrow();
	});

	it('ignores a non-string path, warns, and highlights the valid ones', () => {
		const {container} = render(<JsonHighlighter json={mixedJson} space={2} paths={['name', 42]} />);

		expect(container.textContent).toBe(JSON.stringify(mixedJson, null, 2));
		expect(marks(container)).toEqual(['"alpha"']);
		expect(consoleErrorSpy).toHaveBeenCalled();
	});

	it('handles values containing regexp-replacement special characters ($&, $1)', () => {
		const json = {tricky: 'cost is $& and $1 total'};
		const {container} = render(<JsonHighlighter json={json} space={2} paths={['tricky']} />);

		expect(container.textContent).toBe(JSON.stringify(json, null, 2));
		expect(marks(container)).toEqual(['"cost is $& and $1 total"']);
	});

	it('handles a value containing escaped characters', () => {
		const json = {text: 'line1\nline2 "quoted"'};
		const {container} = render(<JsonHighlighter json={json} space={2} paths={['text']} />);

		expect(container.textContent).toBe(JSON.stringify(json, null, 2));
		expect(marks(container)).toEqual([JSON.stringify(json.text)]);
	});

	it('handles a null leaf value', () => {
		const json = {a: null, b: 1};
		const {container} = render(<JsonHighlighter json={json} space={2} paths={['a']} />);

		expect(container.textContent).toBe(JSON.stringify(json, null, 2));
		expect(marks(container)).toEqual(['null']);
	});

	it('handles keys containing dots without breaking the whole render', () => {
		const json = {'a.b': 'value', plain: 'other'};
		const {container} = render(<JsonHighlighter json={json} space={2} paths={['plain']} />);

		expect(container.textContent).toBe(JSON.stringify(json, null, 2));
		expect(marks(container)).toEqual(['"other"']);
	});
});

// ---------------------------------------------------------------------------
// 6b. Re-rendering / memoization correctness
// ---------------------------------------------------------------------------

describe('re-rendering with changed props', () => {
	it('updates the highlights when `paths` changes', () => {
		const {container, rerender} = render(
			<JsonHighlighter json={mixedJson} space={2} paths={['name']} />,
		);
		expect(marks(container)).toEqual(['"alpha"']);

		rerender(<JsonHighlighter json={mixedJson} space={2} paths={['count']} />);
		expect(marks(container)).toEqual(['42']);

		rerender(<JsonHighlighter json={mixedJson} space={2} paths={[]} />);
		expect(marks(container)).toEqual([]);
	});

	it('updates the text and highlights when `json` changes', () => {
		const {container, rerender} = render(
			<JsonHighlighter json={mixedJson} space={2} paths={['name']} />,
		);
		expect(container.textContent).toBe(JSON.stringify(mixedJson, null, 2));

		const nextJson = {name: 'beta', other: true};
		rerender(<JsonHighlighter json={nextJson} space={2} paths={['name']} />);

		expect(container.textContent).toBe(JSON.stringify(nextJson, null, 2));
		expect(marks(container)).toEqual(['"beta"']);
	});

	it('updates the formatting when `space` changes', () => {
		const {container, rerender} = render(
			<JsonHighlighter json={readmeJson} space={2} paths={['key2.objectToMark']} />,
		);
		expect(container.textContent).toBe(JSON.stringify(readmeJson, null, 2));
		expect(marks(container)).toEqual([blockAt(readmeJson.key2.objectToMark, 2, 2)]);

		rerender(<JsonHighlighter json={readmeJson} space={4} paths={['key2.objectToMark']} />);

		expect(container.textContent).toBe(JSON.stringify(readmeJson, null, 4));
		expect(marks(container)).toEqual([blockAt(readmeJson.key2.objectToMark, 4, 2)]);
	});

	it('does not keep stale highlights when re-rendered with an equal-but-new json object', () => {
		const {container, rerender} = render(
			<JsonHighlighter json={{...mixedJson}} space={2} paths={['name']} />,
		);
		expect(marks(container)).toEqual(['"alpha"']);

		rerender(<JsonHighlighter json={{...mixedJson, name: 'gamma'}} space={2} paths={['name']} />);
		expect(marks(container)).toEqual(['"gamma"']);
	});
});

// ---------------------------------------------------------------------------
// 7. Public API
// ---------------------------------------------------------------------------

describe('package entry point', () => {
	it('exports JsonHighlighter as a named export from src/index.js', () => {
		expect(indexExports.JsonHighlighter).toBeDefined();
		expect(typeof indexExports.JsonHighlighter).toBe('function');
		expect(indexExports.JsonHighlighter).toBe(JsonHighlighter);
	});

	it('the named export renders like the default export', () => {
		const {JsonHighlighter: Named} = indexExports;
		const {container} = render(<Named json={readmeJson} space={2} paths={['key1.innerArray[0]']} />);

		expect(container.textContent).toBe(JSON.stringify(readmeJson, null, 2));
		expect(marks(container)).toEqual(['"string to mark"']);
	});
});
