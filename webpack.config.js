const path = require('path');

module.exports = {
    target: 'web',
    entry: './src/lib/JsonHighlighter.js',
    devtool: 'source-map',
    resolve: {
        extensions: [ '.js', '.json' ],
    },
    module: {
        rules: [
            {
                test: /\.js?$/,
                use: 'babel-loader',
                exclude: /node_modules/,
            },
        ]
    },
    output: {
        filename: 'bundle.js',
        path: path.resolve(__dirname, 'dist'),
    },
};