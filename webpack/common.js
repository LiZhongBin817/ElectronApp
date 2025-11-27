const webpack = require('webpack');

const Env_Local = true;
const Env_Test = false;

function DefinePlugin() {
    return new webpack.DefinePlugin({
        Env_Local,
        Env_Test,
    });
}

module.exports= {
    DefinePlugin,
};