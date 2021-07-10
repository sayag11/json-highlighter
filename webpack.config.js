const path = require('path');

module.exports = {
    mode: 'production',
    entry: './src/JsonHighlighter.js',
    output: {
        path: path.resolve('lib'),
        filename: 'JsonHighlighter.js',
        libraryTarget: 'commonjs2',
    },
    module: {
        rules: [
            {
                test: /\.js?$/,
                exclude: /(node_modules)/,
                use: 'babel-loader',
            }
        ],
    },
    resolve: {
        alias: {
            'react': path.resolve(__dirname, './node_modules/react'),
        }
    },
    externals: {
        // Don't bundle react or react-dom
        react: {
            commonjs: "react",
            commonjs2: "react",
            amd: "React",
            root: "React"
        }
    }
};