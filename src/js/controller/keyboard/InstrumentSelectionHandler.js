/**
 * The MIT License (MIT)
 *
 * Igor Zinken 2017 - http://www.igorski.nl
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
"use strict";

const Config   = require( "../../config/Config" );
const Messages = require( "../../definitions/Messages" );
const Pubsub   = require( "pubsub-js" );

let efflux, editorModel;

// keyCode for the 0 key
const ZERO = 48;
let MAX_ACCEPTED_KEYCODE;

module.exports = {

    init( effluxRef ) {

        efflux      = effluxRef;
        editorModel = efflux.EditorModel;

        // this will not really work if we allow more than 10 instruments :p
        MAX_ACCEPTED_KEYCODE = ZERO + ( Config.INSTRUMENT_AMOUNT - 1 );
    },

    setInstrument( keyCode ) {

        if ( keyCode >= ZERO && keyCode <= MAX_ACCEPTED_KEYCODE ) {
            const event = efflux.activeSong.patterns[ editorModel.activePattern ]
                                           .channels[ editorModel.activeInstrument ][ editorModel.activeStep ];

            if ( event ) {
                event.instrument = keyCode - ZERO;
                Pubsub.publish( Messages.REFRESH_PATTERN_VIEW );
            }
        }
    }
};
