/**
 * The MIT License (MIT)
 *
 * Igor Zinken 2016 - http://www.igorski.nl
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

const Config  = require( "../config/Config" );
const zCanvas = require( "zCanvas" ).zCanvas;
const zSprite = require( "zCanvas" ).zSprite;
const Style   = require( "zjslib" ).Style;

/**
 * PatternRenderer represents the contents of the pattern on screen
 * as continuously replacing HTML components when the sequencer is running
 * is (eventually) very wasteful on the system resources, PatternRenderer
 * renders its contents onto an HTMLCanvasElement
 *
 * PatternRenderer is a zSprite extension and manages its rendering by
 * maintaining its own zCanvas instance
 *
 * @constructor
 * @param {Element} containerRef
 * @param {Element} containerWrapperRef
 */
function PatternRenderer( containerRef, containerWrapperRef )
{
    PatternRenderer.super( this, "constructor", 0, 0, 0, 0 );

    /* instance properties */

    this.activeStep    = 0;
    this._container    = containerRef;
    this._wrapper      = containerWrapperRef;
    this._canvas       = new zCanvas( 10, 10, true );
    this._patternSteps = 16;
    this._selection    = { x: 0, y: 0, w: 0, h: 0 };

    /* initialization */

    this.calculateSize();
    this._canvas.addChild( this );
    this._canvas.insertInPage( containerRef );
}
zSprite.extend( PatternRenderer );

module.exports = PatternRenderer;

/* public methods */

PatternRenderer.prototype.calculateSize = function() {

    const width  = parseFloat( Style.getStyle( this._wrapper,   "width" ));
    const height = parseFloat( Style.getStyle( this._container, "height" ));

    this._bounds.width  = width;
    this._bounds.height = height;

    this._stepWidth = Math.round( this._bounds.width / Config.INSTRUMENT_AMOUNT );

    this._canvas.setDimensions( width, height );
};

PatternRenderer.prototype.highlightActiveStep = function( activeStep, activeInstrument, selectedChannels )
{
    const stepHeight = Math.round( this._bounds.height / this._patternSteps );

    if ( selectedChannels.length > 0 ) {

        let minX = selectedChannels.length, maxX = 0, minStep = this._patternSteps, maxStep = 0;
        let i = selectedChannels.length, amountSelected = 0, channelSelection;

        while ( i-- ) {

            if ( channelSelection = selectedChannels[ i ]) {

                minX = Math.min( minX, i );
                maxX = Math.max( maxX, i );

                minStep = Math.min( minStep, channelSelection[ 0 ]);
                maxStep = Math.max( maxStep, channelSelection[ channelSelection.length - 1 ]);

                ++amountSelected;
            }
        }
        this._selection.x = minX * this._stepWidth;
        this._selection.y = minStep * stepHeight;
        this._selection.w = amountSelected * this._stepWidth;
        this._selection.h = stepHeight + (( maxStep - minStep ) * stepHeight );
    }
    else {
        this._selection.x = activeInstrument * this._stepWidth;
        this._selection.y = activeStep * stepHeight;
        this._selection.w = this._stepWidth;
        this._selection.h = stepHeight;
    }
};

/**
 * @public
 * @param {CanvasRenderingContext2D} ctx
 */
PatternRenderer.prototype.draw = function( ctx )
{
    const stepHeight = Math.round( this._bounds.height / this._patternSteps );

    if ( this._selection.w > 0 ) {
        ctx.strokeStyle = "yellow";
        ctx.lineWidth = 2;
        ctx.strokeRect( this._selection.x, this._selection.y, this._selection.w - 2, this._selection.h );
    }

    // highlight
    ctx.fillStyle = "rgba(255,255,255,.25)";
    ctx.fillRect( 0, this.activeStep * stepHeight, this._bounds.width, stepHeight );

    // TODO : fillText only when pattern contents mutate
    // create a cached image which is redrawn continously
    // OR: do we extend zCanvas directly override its render method ?

    ctx.font =   "20px Georgia";
    ctx.fillStyle = "red";

    ctx.fillText("Hello World!",10,50);

    // taken from old Handlebars approach, make Canvassy !
    /*
    {{#each this}}
            {{#if (and
                (eq @index ../../activeStep)
                (eq @../index ../../activeChannel))}}
            <li class="active">
        {{else}}
            <li>
        {{/if}}
            {{#if this.action}}
                {{# if this.note}}
                <span class="note">
                    {{this.note}} - {{this.octave}}
                </span>
                <span class="instrument">
                    {{this.instrument}}
                </span>
                {{else}}
                    //// OFF ////
                {{/if}}
            {{else}}
                <span class="note empty">----</span>
                <span class="instrument"></span>
            {{/if}}
            {{# if this.mp }}
            <span class="moduleParam">
                {{mparam this.mp}}
            </span>
            {{/if}}
        </li>
        {{/each}}
    */
};
