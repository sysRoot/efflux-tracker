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

const EventFactory = require( "../../model/factory/EventFactory" );
const Messages     = require( "../../definitions/Messages" );
const Pubsub       = require( "pubsub-js" );

let efflux, editorModel;

// modules parameters available to Efflux, we map keyCode to the first letter(s) of their name
const D_MODULES = [ "delayEnabled", "delayTime", "delayFeedback", "delayCutoff", "delayOffset" ];
const F_MODULES = [ "filterEnabled", "filterFreq", "filterQ", "filterLFOEnabled", "filterLFOSpeed", "filterLFODepth" ];
const P_MODULES = [ "pitchUp", "pitchDown" ];
const V_MODULES = [ "volume" ];

let selectedGlide = false, selectedModule;
let lastCharacter = "", lastTypeAction = 0;

const ModuleParamHandler = module.exports = {

    init( effluxRef ) {

        efflux      = effluxRef;
        editorModel = efflux.EditorModel;
    },

    handleParam( keyCode ) {
        const now = Date.now();
        const previousTypeAction = lastTypeAction;

        lastTypeAction = now;

        let event = getEventForPosition();
        const createEvent = !event;

        if ( !createEvent && event.mp )
            selectedGlide = event.mp.glide;

        // if this character was typed shortly after the previous one,
        // combine their values for more precise control
        const character = String.fromCharCode(( 96 <= keyCode && keyCode <= 105 )? keyCode - 48 : keyCode );

        if ( !character || !character.match( /^[a-z0-9]+$/i ))
            return;

        let value = ( now - previousTypeAction < 500 ) ? lastCharacter + character : character;
        lastCharacter = character;

        // if user is typing multiple characters in succession, attempt to retrieve module by characters
        if ( value.length === 2 ) {
            selectedModule = getModuleByFirstTwoLetters( value, selectedModule );
        }
        else {
            switch ( keyCode ) {
                case 68: // D
                case 70: // F
                case 80: // P
                case 86: // V
                    selectedModule = ModuleParamHandler.getNextSelectedModule( keyCode, selectedModule );
                    break;

                case 71: // G
                    if ( event && event.mp )
                        selectedGlide = event.mp.glide;
                    selectedGlide = !selectedGlide;
                    break;

                default:
                    return;
        }
        }
        // create event if it didn't exist yet
        if ( createEvent )
            event = getEventForPosition( true );

        event.mp = EventFactory.createModuleParam(
            ( !selectedModule && event && event.mp ) ? event.mp.module : selectedModule,
            ( event && event.mp ) ? event.mp.value : 50,
            selectedGlide
        );
        Pubsub.publish( Messages.REFRESH_PATTERN_VIEW );
    },

    getNextSelectedModule( keyCode, currentValue ) {
        const list = getModuleListByKeyCode( keyCode );

        for ( let i = 0, l = list.length, max = l - 1; i <l; ++i ) {
            if ( list[ i ] === currentValue ) {

                // value found, return next value in list (or first if we're at the list end)

                if ( i < max )
                    return list[ i + 1 ];
                else
                    break;
            }
        }
        return list[ 0 ]; // value not found, return first value in list
    }
};

function getModuleListByKeyCode( keyCode ) {
    switch ( keyCode ) {
        default:
        case 68:
            return D_MODULES;
        case 70:
            return F_MODULES;
        case 80:
            return P_MODULES;
        case 86:
            return V_MODULES;
    }
}

function getModuleByFirstTwoLetters( letters, selectModule ) {
    let list;
    switch ( letters.charAt( 0 )) {
        case "D":
            list = D_MODULES;
            break;
        case "F":
            list = F_MODULES;
            break;
        case "P":
            list = P_MODULES;
            break;
        case "V":
            list = V_MODULES;
            break;
    }
    if ( list ) {
        for ( let i = 0; i < list.length; ++i ) {
            const module = list[ i ];
            let name = module.charAt( 0 ).toUpperCase();
            name += module.match(/([A-Z]?[^A-Z]*)/g)[1].charAt( 0 );
            if ( name.substr( 0, 2 ) === letters )
                return module;
        }
    }
    // nothing found, return current
    return selectedModule;
}

function getEventForPosition( createIfNotExisting ) {
    let event = efflux.activeSong.patterns[ editorModel.activePattern ]
                                 .channels[ editorModel.activeInstrument ][ editorModel.activeStep ];

    if ( !event && createIfNotExisting === true ) {

        event = EventFactory.createAudioEvent();

        event.instrument = editorModel.activeInstrument;
        Pubsub.publish( Messages.ADD_EVENT_AT_POSITION, [ event, {
            patternIndex      : editorModel.activePattern,
            channelIndex      : editorModel.activeInstrument,
            step              : editorModel.activeStep,
            newEvent          : true,
            advanceOnAddition : false
        } ]);
    }
    return event;
}
