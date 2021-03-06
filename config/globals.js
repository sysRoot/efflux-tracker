"use strict";

const fs   = require( "fs" );
const path = require( "path" );

const config = module.exports =
{
    config :
    {
        env: "dev", // overridden by build task

        // where the app development takes place
        project: {
            root      : "src/",
            js        : "src/js",
            assets    : "src/assets/",
            templates : "src/templates/",
            modules   : "node_modules/"
        },

        // build output folders
        target: {
            dev   : "dist/dev/",
            prod  : "dist/prod/",
            env   : "dist/dev"      // overridden by build task
        }
    }
};

// expose all configurations in the ./grunt folder into the global configuration object

const modulePath = path.join( __dirname, "./grunt" );

fs.readdirSync(modulePath).forEach(( file ) => {
    config[ file.slice( 0, -3 )] = require( path.join( modulePath, file ));
});
