A React component to highlight JSON by its keys/paths
![alt text](https://github.com/sayag11/json-highlighter/blob/master/json-highlighter-image.jpeg?raw=true)

Based on [react-highlight-words.](https://github.com/bvaughn/react-highlight-words)

## Usage

To use it, just provide it with a JSON object and an array of paths  to highlight.

[Try this example in Stackblitz.](https://stackblitz.com/edit/json-highlighter-example)

```jsx
import React from 'react';
import { JsonHighlighter } from 'json-highlighter';

const App = (props) => {
  const json = {
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

  const paths = ['key1.innerArray[0]', 'key2.objectToMark'];

  return (
    <pre>
      <JsonHighlighter
        json={json}
        space={4} 
        paths={paths} 
        {...props} // props for react-highlight-words
      />
    </pre>
}

``` 

And the `JsonHighlighter` will mark all values based on the provided paths.

## Props

| Property | Type | Description |
|:---|:---|:---:|
| json | Object | A JSON object or string |
| space | Number | the space parameter for JSON.stringify for the final textual result. see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify |
| paths | Array<String> | array of strings - each string represents a path inside the json. e.g: 'foo[0].bar' |

## react-highlight-words Props

Relevant props to pass to the inner react-highlight-words component.
to see all props go to: https://github.com/bvaughn/react-highlight-words

| Property | Type | Description |
|:---|:---|:---:|
| activeClassName | String | The class name to be applied to an active match. Use along with `activeIndex` |
| activeIndex | Number | Specify the match index that should be actively highlighted. Use along with `activeClassName` |
| activeStyle | Object | The inline style to be applied to an active match. Use along with `activeIndex` |
| highlightClassName | String or Object | CSS class name applied to highlighted text or object mapping search term matches to class names. |
| highlightStyle | Object | Inline styles applied to highlighted text |
| highlightTag | Node | Type of tag to wrap around highlighted matches; defaults to `mark` but can also be a React element (class or functional) |
| unhighlightClassName | String | CSS class name applied to unhighlighted text |
| unhighlightStyle | Object | Inline styles applied to unhighlighted text |
| * | any | Any other props (such as `title` or `data-*`) are applied to the outer/wrapper `<span>` |

## Installation
```
yarn add json-highlighter
```

```
npm i --save json-highlighter
```

## License
MIT License - fork, modify and use however you want.
