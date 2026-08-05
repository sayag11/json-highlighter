import React, {useMemo} from 'react';
import get from 'lodash/get';
import Highlighter from 'react-highlight-words';
import {
	replacePathsWithMarkers,
	findChunks,
	parseJson,
	getSortedPaths,
	createMarker,
} from './utils';

/*
 * Props:
 * json - a json object or string
 * space - the space parameter for JSON.stringify
 * paths - array of strings - each string represents a path inside the json. e.g: 'foo[0].bar'
 */
const JsonHighlighter = ({json = {}, space, paths = [], ...restProps}) => {
	// convert the json to object if it is provided as a string
	const parsedJSON = useMemo(() => parseJson(json), [json]);

	const isHighlightable = parsedJSON !== null && typeof parsedJSON === 'object';

	// stringify the json with the provided amount of spaces
	const textToHighlight = useMemo(
		() =>
			typeof parsedJSON === 'string'
				? parsedJSON
				: String(JSON.stringify(parsedJSON, null, space)),
		[parsedJSON, space],
	);

	// sort the paths to be in the same order they appear in the json object
	const sortedPaths = useMemo(() => getSortedPaths(parsedJSON, paths), [paths, parsedJSON]);

	// a sentinel that cannot collide with the user's own data
	const marker = useMemo(() => createMarker(parsedJSON), [parsedJSON]);

	// replace the values in the provided paths with a marker placeholder
	const jsonObjWithMarkers = useMemo(
		() => (isHighlightable ? replacePathsWithMarkers(parsedJSON, sortedPaths, marker) : {}),
		[parsedJSON, sortedPaths, marker, isHighlightable],
	);

	// extract the search words from the paths in the json object, formatted exactly as they
	// appear in textToHighlight so a chunk's offsets delimit the value precisely
	const searchWords = useMemo(
		() =>
			isHighlightable
				? sortedPaths.map(path => JSON.stringify(get(parsedJSON, path), null, space))
				: [],
		[parsedJSON, sortedPaths, space, isHighlightable],
	);

	// restProps is spread first on purpose: textToHighlight, searchWords and findChunks are
	// computed together and must stay consistent, so a pass-through prop must not clobber them.
	return (
		<Highlighter
			{...restProps}
			textToHighlight={textToHighlight}
			searchWords={searchWords}
			findChunks={findChunks(space, jsonObjWithMarkers, marker)}
		/>
	);
};

export default JsonHighlighter;
