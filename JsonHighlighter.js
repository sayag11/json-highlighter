import React, {useMemo} from 'react';
import {get} from 'lodash';
import Highlighter from 'react-highlight-words';
import {replacePathsWithMarkers, findChunks} from "./utils";

/*
 * Props:
 * json - a json object or string
 * space - the space parameter for JSON.stringify
 * paths - array of strings - each string represents a path inside the json. e.g: 'foo[0].bar'
 */
const HighlighterJson = ({json = {}, space, paths = [], highlightStyle, ...restProps}) => {
	// convert the json to object if it is provided as a string
	const jsonObj = useMemo(() => (typeof json === 'string' ? JSON.parse(json) : json), [json]);

	// stringify the json with the provided amount of spaces
	const textToHighlight = useMemo(() => JSON.stringify(jsonObj, null, space), [jsonObj, space]);

	// replace the values in the provided paths with a marker placeholder
	const jsonObjWithMarkers = useMemo(() => replacePathsWithMarkers(jsonObj, paths), [jsonObj, paths]);

	// extract the search words from the paths in the json object
	const searchWords = useMemo(() => paths.map(path => JSON.stringify(get(jsonObj, path))), [jsonObj, paths]);

	return (
		<Highlighter
			textToHighlight={textToHighlight}
			highlightStyle={highlightStyle}
			searchWords={searchWords}
			findChunks={findChunks(space, jsonObjWithMarkers)}
			{...restProps}
		/>
	);
};

export default HighlighterJson;
