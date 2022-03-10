import {cloneDeep, set} from 'lodash';
const MARKER = '__marker__';

// sanitize function, returns the stringified json with no spaces
const sanitize = str => JSON.stringify(JSON.parse(str));

// sanitize function with indentations, returns the stringified json with the provided amount of spaces
const sanitizeIndent = (str, space) => JSON.stringify(JSON.parse(str), null, space);

/**
 * @param str - string that contains a non-sanitized search word. example: '  a b c  d     e'
 * @param sw - the sanitized search word, with no spaces - example: 'cde'
 * @param startIndex - the start index of the search word in str (in our example - 6)
 * @param sanitize - a sanitize function
 * @returns {*} the end index of the search word in str + 1 (in our example - 16)
 */
const findEndIndex = (str, sw, startIndex, sanitize) => {
    const sanitizedSw = sanitize(sw);
    let i = startIndex,
        j = 0;
    while (j < sw.length) {
        if (str[i] === sanitizedSw[j]) {
            j++;
        }
        i++;
    }
    return i;
};

export const parseJson = json => {
    if (typeof json === 'object') return json;
    if (typeof json === 'string') {
        try {
            return JSON.parse(json);
        }
        catch (e) {
            return json;
        }
    }
};

/**
 *
 * @param obj - an object
 * @returns array of  the object's keys including deep nested
 * https://stackoverflow.com/a/42674656
 */
export const getDeepKeys = obj => {
    let keys = [];
    for (let key in obj) {
        keys.push(key);
        if (typeof obj[key] === "object") {
            let subkeys = getDeepKeys(obj[key]);
            keys = keys.concat(subkeys.map(function(subkey) {
                return key + "." + subkey;
            }));
        }
    }
    return keys;
};

/**
 * @param space - the space parameter for JSON.stringify
 * @param jsonWithMarkers - the json object with a marker placeholder inside json[path]
 * @returns {function({sanitize?: *, searchWords: *, textToHighlight?: *}): []} - a findChuks callback to be used by Highlighter component */
export const findChunks = (space, jsonWithMarkers) => ({searchWords}) => {
    const chunks = [];
    const markerWithQuotes = `"${MARKER}"`;

    const textWithMarkers = JSON.stringify(jsonWithMarkers, null, space);

    // str is the indented text with markers instead of the search words.
    let str = sanitizeIndent(textWithMarkers, space);

    searchWords.forEach(sw => {
        const startIndex = str.indexOf(markerWithQuotes);
        str = str.replace(markerWithQuotes, sw);
        str = sanitizeIndent(str, space);

        const endIndex = findEndIndex(str, sw, startIndex, sanitize);
        if (startIndex > -1 && endIndex > -1) {
            chunks.push({
                start: startIndex,
                end: endIndex,
            });
        }
        else {
            console.error(`JsonHighlighter: search word ${sw} was not found in text`);
        }
    });
    return chunks;
};

/**
 *
 * @param jsonObj - the json object
 * @param paths - the paths with the values to mark
 * @returns jsonObjWithMarkers - a new json object containing a marker inside
 * jsonObj[path] instead of it's original value
 */
export const replacePathsWithMarkers = (jsonObj, paths) => {
    const jsonObjWithMarkers = cloneDeep(jsonObj);
    paths.forEach(path => {
        set(jsonObjWithMarkers, path, MARKER);
    });
    return jsonObjWithMarkers;
};
