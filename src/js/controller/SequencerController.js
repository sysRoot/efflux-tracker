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

const Config       = require( "../config/Config" );
const AudioUtil    = require( "../utils/AudioUtil" );
const SongUtil     = require( "../utils/SongUtil" );
const Messages     = require( "../definitions/Messages" );
const Metronome    = require( "../components/Metronome" );
const AudioFactory = require( "../model/factory/AudioFactory" );
const Bowser       = require( "bowser" );
const Pubsub       = require( "pubsub-js" );

/* private properties */

let efflux, audioController, audioContext, worker, editorModel,
    playBTN, loopBTN, recordBTN, settingsToggle, tempoSlider, currentPositionTitle,
    maxPositionTitle, metronomeToggle, tempoDisplay;

let playing           = false,
    looping           = false,
    recording         = false,
    scheduleAheadTime = .2,
    stepPrecision     = 64,
    beatAmount        = 4, // beat amount (the "3" in 3/4) and beat unit (the "4" in 3/4) describe the time signature
    beatUnit          = 4;

let currentMeasure, measureStartTime, firstMeasureStartTime,
    currentStep, channels, queueHandlers = [];

const SequencerController = module.exports =
{
    /**
     * initialize the SequencerController, attach view into
     * given container and hold a reference to the AudioController
     *
     * @public
     * @param {Element} containerRef
     * @param {Object} effluxRef
     * @param {AudioController} audioControllerRef
     */
    init( containerRef, effluxRef, audioControllerRef )
    {
        efflux          = effluxRef;
        audioController = audioControllerRef;
        audioContext    = audioControllerRef.getContext();
        editorModel     = efflux.EditorModel;

        efflux.TemplateService.render( "transport", containerRef, null, true ).then(() => {

            // initialization

            SequencerController.setPosition( 0 );

            // cache view elements

            playBTN              = containerRef.querySelector( "#playBTN" );
            loopBTN              = containerRef.querySelector( "#loopBTN" );
            recordBTN            = containerRef.querySelector( "#recordBTN" );
            tempoDisplay         = containerRef.querySelector( "#songTempoDisplay" );
            tempoSlider          = containerRef.querySelector( "#songTempo" );
            metronomeToggle      = containerRef.querySelector( ".icon-metronome" );
            settingsToggle       = containerRef.querySelector( ".icon-settings" ); // mobile view only
            currentPositionTitle = document.querySelector( "#currentPattern .current" );
            maxPositionTitle     = document.querySelector( "#currentPattern .total" );

            // add event listeners

            playBTN.addEventListener        ( "click", handlePlayToggle );
            loopBTN.addEventListener        ( "click", handleLoopToggle );
            recordBTN.addEventListener      ( "click", handleRecordToggle );
            tempoSlider.addEventListener    ( "input", handleTempoChange );
            metronomeToggle.addEventListener( "click", handleMetronomeToggle );
            settingsToggle.addEventListener ( "click", handleSettingsToggle );
            document.querySelector( "#patternBack" ).addEventListener( "click", handlePatternNavBack );
            document.querySelector( "#patternNext" ).addEventListener( "click", handlePatternNavNext );

            // for desktop/laptop devices we enable record mode (for keyboard input)
            // if a MIDI device is connected on a mobile device, it is enabled again

            if ( !Bowser.ios && !Bowser.android )
                recordBTN.classList.remove( "disabled" );
        });


        // setup messaging system

        [
            Messages.MIDI_DEVICE_CONNECTED,
            Messages.TOGGLE_SEQUENCER_PLAYSTATE,
            Messages.TOGGLE_INPUT_RECORDING,
            Messages.SET_SEQUENCER_POSITION,
            Messages.PATTERN_AMOUNT_UPDATED,
            Messages.PATTERN_SWITCH,
            Messages.PATTERN_JUMP_PREV,
            Messages.PATTERN_JUMP_NEXT,
            Messages.SONG_LOADED

        ].forEach(( msg ) => Pubsub.subscribe( msg, handleBroadcast ));

        worker = new Worker( "../../workers/SequencerWorker.js" );
        worker.onmessage = handleWorkerMessage;
    },

    /**
     * query whether the Sequencer is currently playing
     * @return {boolean}
     */
    getPlaying()
    {
        return playing;
    },

    /**
     * start / stop the Sequencer
     * @param {boolean} value
     */
    setPlaying( value )
    {
        playing = value;
        let cl  = playBTN.classList;

        if ( playing ) {

            if ( recording && Metronome.countIn ) {
                Metronome.countInComplete = false;
                Metronome.enabled         = true;
            }
            currentStep = 0; // always start current measure from the beginning
            SequencerController.setPosition( efflux.EditorModel.activePattern );

            cl.add( "icon-stop" );
            cl.remove( "icon-play" );

            worker.postMessage({
                cmd: "start",
                interval: 25,
                stepPrecision: stepPrecision
            });
            Pubsub.publishSync( Messages.PLAYBACK_STARTED );
        }
        else {

            cl.add( "icon-play" );
            cl.remove( "icon-stop" );

            worker.postMessage({ cmd: "stop" });

            Pubsub.publishSync( Messages.PLAYBACK_STOPPED );

            if ( recording )
                handleRecordToggle();

            clearPending();
        }
    },

    /**
     * set the sequencers position
     *
     * @public
     * @param {number} measure
     * @param {number=} currentTime optional time to sync given measure to
     *        this will default to the currentTime of the AudioContext for instant enqueuing
     */
    setPosition( measure, currentTime, block )
    {
        const song = efflux.activeSong;
        if ( measure >= song.patterns.length )
            measure = song.patterns.length - 1;

        if ( currentMeasure !== measure )
            currentStep = 0;

        if ( typeof currentTime !== "number" )
            currentTime = audioContext.currentTime;

        currentMeasure        = measure;
        measureStartTime      = currentTime;
        firstMeasureStartTime = currentTime - ( measure * ( 60.0 / song.meta.tempo * beatAmount ));

        channels = efflux.activeSong.patterns[ currentMeasure ].channels;

        updateWorker(( block === true ) ? null : currentTime );
    },

    getPosition()
    {
        return {
            measure: currentMeasure,
            step: currentStep
        }
    },

    /**
     * synchronize Transport contents with
     * the current state of the model
     */
    update()
    {
        const meta = efflux.activeSong.meta;
        tempoSlider.value      = meta.tempo;
        tempoDisplay.innerHTML = meta.tempo + " BPM";

        currentPositionTitle.innerHTML = ( editorModel.activePattern + 1 ).toString();
        maxPositionTitle.innerHTML     = efflux.activeSong.patterns.length.toString();
        updateWorker();
    }
};

/* private methods */

function handleBroadcast( type, payload )
{
    switch( type )
    {
        case Messages.TOGGLE_SEQUENCER_PLAYSTATE:
            SequencerController.setPlaying( !playing );
            break;

        case Messages.TOGGLE_INPUT_RECORDING:
            handleRecordToggle();
            break;

        case Messages.SET_SEQUENCER_POSITION:
            SequencerController.setPosition( payload );
            break;

        case Messages.PATTERN_AMOUNT_UPDATED:
        case Messages.PATTERN_SWITCH:
            SequencerController.update();
            break;

        case Messages.PATTERN_JUMP_PREV:
            handlePatternNavBack( null );
            break;

        case Messages.PATTERN_JUMP_NEXT:
            handlePatternNavNext( null );
            break;

        case Messages.SONG_LOADED:

            if ( looping )
                handleLoopToggle( null );

            SequencerController.setPlaying( false );
            SequencerController.update();
            break;

        // when a MIDI device is connected, we allow recording from MIDI input
        case Messages.MIDI_DEVICE_CONNECTED:
            recordBTN.classList.remove( "disabled" );
            break;
    }
}

function handleWorkerMessage( msg )
{
    switch ( msg.data.cmd ) {
        case "collect":
            collect();
            break;

        case "step":
            step( msg.data.nextNoteTime );
            break;

        case "getTime":
            worker.postMessage({
                cmd: "update",
                currentTime: audioContext.currentTime
            });
            break;

        case "metronome":
            Metronome.play( 2, currentStep, stepPrecision, msg.data.time, audioContext );
            break;

        case "enqueue":
            enqueueEvent( msg.data.event, msg.data.measure, msg.data.channel, msg.data.time );
            break;
    }
}

function handlePlayToggle( e )
{
    SequencerController.setPlaying( !playing );
}

function handleLoopToggle( e )
{
    if ( looping = !looping )
        loopBTN.classList.add( "active" );
    else
        loopBTN.classList.remove( "active" );
}

function handleRecordToggle( e )
{
    const wasRecording = recording;

    if ( recording = !wasRecording )
        recordBTN.classList.add( "active" );
    else
        recordBTN.classList.remove( "active" );

    if ( wasRecording ) {

        // unflag the recorded state of all the events
        const patterns = efflux.activeSong.patterns;
        let event, i;

        patterns.forEach(( pattern ) =>
        {
            pattern.channels.forEach(( events ) =>
            {
                i = events.length;
                while ( i-- )
                {
                    event = events[ i ];
                    if ( event )
                        event.recording = false;
                }
            });
        });
    }
    efflux.EditorModel.recordingInput = recording;
}

function handleMetronomeToggle( e )
{
    let enabled = !Metronome.enabled;

    if ( enabled )
        metronomeToggle.classList.add( "active" );
    else
        metronomeToggle.classList.remove( "active" );

    Metronome.enabled = enabled;
}

function handleSettingsToggle( e )
{
    let body     = document.body,
        cssClass = "settings-mode",
        enabled  = !body.classList.contains( cssClass );

    if ( enabled )
        e.target.classList.add( "active" );
    else
        e.target.classList.remove( "active" );

    body.classList.toggle( cssClass );
}

function handlePatternNavBack( aEvent )
{
    if ( editorModel.activePattern > 0 )
        switchPattern( editorModel.activePattern - 1 );
}

function handlePatternNavNext( aEvent )
{
    const max = efflux.activeSong.patterns.length - 1;

    if ( editorModel.activePattern < max )
        switchPattern( editorModel.activePattern + 1 );
}

function handleTempoChange( e )
{
    const meta     = efflux.activeSong.meta;
    const oldTempo = meta.tempo;
    const newTempo = parseFloat( e.target.value );

    meta.tempo = newTempo;

    // update existing event offsets by the tempo ratio

    SongUtil.updateEventOffsets( efflux.activeSong.patterns, ( oldTempo / newTempo ));

    Pubsub.publishSync( Messages.TEMPO_UPDATED, [ oldTempo, newTempo ]);
    SequencerController.update(); // sync with model
}

function collect()
{
    updateWorker();
    worker.postMessage({
        cmd: "collect",
        sequenceEvents: !( recording && Metronome.countIn && !Metronome.countInComplete ),
        metronomeEnabled: Metronome.enabled,
        tempo: efflux.activeSong.meta.tempo
    });
}

/**
 * advances the currently active step of the pattern
 * onto the next, when the end of pattern has been reached, the
 * pattern will either loop or we the Sequencer will progress onto the next pattern
 *
 * @private
 * @param {number} aNextNoteTime
 */
function step( aNextNoteTime )
{
    // advance the beat number, wrap to zero when start of next bar is enqueued

    if ( ++currentStep === stepPrecision )
    {
        currentStep = 0;

        // advance the measure if the Sequencer wasn't looping

        if ( !looping && ++currentMeasure === efflux.activeSong.patterns.length )
        {
            // last measure reached, jump back to first
            currentMeasure = 0;

            // stop playing if we're recording and looping is disabled

            if ( recording && !efflux.EditorModel.loopedRecording )
            {
                SequencerController.setPlaying( false );
                Pubsub.publishSync( Messages.RECORDING_COMPLETE );
                return;
            }
        }
        SequencerController.setPosition( currentMeasure, aNextNoteTime, true );

        if ( recording )
        {
            // one bar metronome count in ?

            if ( Metronome.countIn && !Metronome.countInComplete ) {

                Metronome.enabled         = Metronome.restore;
                Metronome.countInComplete = true;

                currentMeasure        = 0;   // now we're actually starting!
                firstMeasureStartTime = audioContext.currentTime;
            }
        }
        switchPattern( currentMeasure );
    }
    Pubsub.publishSync( Messages.STEP_POSITION_REACHED, [ currentStep, stepPrecision ]);
}

function switchPattern( newMeasure )
{
    if ( editorModel.activePattern === newMeasure )
        return;

    currentMeasure = editorModel.activePattern = newMeasure;
    Pubsub.publishSync( Messages.PATTERN_SWITCH, newMeasure );

    const newSteps = efflux.activeSong.patterns[ newMeasure ].steps;
    if ( editorModel.amountOfSteps !== newSteps ) {
        editorModel.amountOfSteps = newSteps;
        Pubsub.publish( Messages.PATTERN_STEPS_UPDATED, newSteps );
    }
    updateWorker();
}

/**
 * @private
 *
 * @param {number} aEventIndex idex of the event in its channels
 * @param {number} aEventMeasure measure the event belongs to
 * @param {number} aEventChannel channel the event belongs to
 * @param {number} aTime AudioContext timestamp to start event playback
 */
function enqueueEvent( aEventIndex, aEventMeasure, aEventChannel, aTime )
{
    // calculate the total duration for the event

    const patternDuration = ( 60 / efflux.activeSong.meta.tempo ) * beatAmount;
    const patterns        = efflux.activeSong.patterns;
    const audioEvent      = patterns[ aEventMeasure ].channels[ aEventChannel ][ aEventIndex ];
    let duration          = ( 1 / patterns[ aEventMeasure ].channels[ aEventChannel ].length ) * patternDuration;

    audioEvent.seq.playing = true; // lock the Event for further querying during its playback

    // calculate the total duration for "noteOn" events
    if ( audioEvent.action === 1 )
    {
        let foundEvent = false, foundEnd = false, compareEvent, channel, j, jl;

        for ( let i = aEventMeasure, l = patterns.length; i < l; ++i )
        {
            channel = patterns[ i ].channels[ aEventChannel ];

            for ( j = 0, jl = channel.length; j < jl; ++j )
            {
                compareEvent = channel[ j ];

                if ( !foundEvent )
                {
                    if ( compareEvent === audioEvent )
                        foundEvent = true;
                }
                else if ( !foundEnd )
                {
                    // the next event (any event with an action) will
                    // halt the playback of the given event

                    if ( compareEvent && compareEvent.action > 0 ) {
                        foundEnd = true;
                        break;
                    }
                    duration += ( 1 / channel.length ) * patternDuration; // keep incrementing duration until event is found
                }
            }
            if ( foundEnd )
                break;
        }
    }
    audioEvent.seq.length   = duration;
    audioEvent.seq.mpLength = patternDuration / patterns[ aEventMeasure ].steps;

    // play back the event in the AudioController

    audioController.noteOn( audioEvent, efflux.activeSong.instruments[ audioEvent.instrument ], aTime );

    // noteOff will be triggered by the Sequencer

    dequeueEvent( audioEvent, aTime + audioEvent.seq.length );
}

/**
 * use a silent OscillatorNode as a strictly timed clock
 * for removing the AudioEvents from the AudioController
 *
 * @private
 *
 * @param {AUDIO_EVENT} aEvent
 * @param {number} aTime AudioContext timestamp to stop playback
 */
function dequeueEvent( aEvent, aTime )
{
    let clock = AudioUtil.createTimer( audioContext, aTime, ( aTimerEvent ) =>
    {
        aEvent.seq.playing = false;
        audioController.noteOff( aEvent, efflux.activeSong.instruments[ aEvent.instrument ]);
        freeHandler( clock ); // clear reference to this timed event
    });

    // store reference to prevent garbage collection prior to callback execution !
    queueHandlers.push( clock );
}

function clearPending()
{
    SongUtil.resetPlayState( efflux.activeSong.patterns ); // unset playing state of existing events

    let i = queueHandlers.length;
    while ( i-- )
        freeHandler( queueHandlers[ i ]);
}

/**
 * free reference to given "clock" (makes it
 * eligible for garbage collection)
 *
 * @private
 * @param {OscillatorNode} aNode
 * @return {boolean}
 */
function freeHandler( aNode )
{
    aNode.disconnect();
    aNode.onended = null;

    const i = queueHandlers.indexOf( aNode );
    if ( i !== -1 )
        queueHandlers.splice( i, 1 );
}

/**
 * @private
 * @param {number=} nextNoteTime
 */
function updateWorker( nextNoteTime )
{
    const data = {
        cmd: "update",
        channels: channels,
        currentTime: audioContext.currentTime,
        scheduleAheadTime: scheduleAheadTime,
        currentMeasure: currentMeasure,
        measureStartTime : measureStartTime
    };

    if ( typeof nextNoteTime === "number" ) {
        data.nextNoteTime = nextNoteTime;
    }
    worker.postMessage( data );
}
