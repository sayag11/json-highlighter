import React, {useMemo} from 'react';
import {get} from 'lodash';
import Highlighter from 'react-highlight-words';
import {
	replacePathsWithMarkers,
	findChunks,
	parseJson,
	getSortedPaths,
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

	// stringify the json with the provided amount of spaces
	const textToHighlight = useMemo(
		() => (typeof parsedJSON === 'object' ? JSON.stringify(parsedJSON, null, space) : parsedJSON),
		[parsedJSON, space],
	);

	// sort the paths to be in the same order they appear in the json object
	const sortedPaths = useMemo(() => getSortedPaths(parsedJSON, paths), [paths, parsedJSON]);

	// replace the values in the provided paths with a marker placeholder
	const jsonObjWithMarkers = useMemo(
		() => (typeof parsedJSON === 'object' ? replacePathsWithMarkers(parsedJSON, sortedPaths) : {}),
		[parsedJSON, sortedPaths],
	);
	// extract the search words from the paths in the json object
	const searchWords = useMemo(
		() =>
			typeof parsedJSON === 'object'
				? sortedPaths.map(path => {
					return JSON.stringify(get(parsedJSON, path));
				})
				: [],
		[parsedJSON, sortedPaths],
	);

	return (
		<Highlighter
			textToHighlight={textToHighlight}
			searchWords={searchWords}
			findChunks={findChunks(space, jsonObjWithMarkers)}
			{...restProps}
		/>
	);
};

export default JsonHighlighter;
