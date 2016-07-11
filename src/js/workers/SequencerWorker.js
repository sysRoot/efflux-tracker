var interval, stepPrecision, timer, data, i, j, channels = [], channel, event,
    nextNoteTime = 0, currentTime = 0, currentMeasure = 0, scheduleAheadTime = 0, measureStartTime = 0, compareTime,
    tempo;

/**
 * SequencerWorker leverages the intervallic polling
 * of the Sequencer events off the main execution thread
 */
self.addEventListener( "message", function( aEvent )
{
    data = aEvent.data;

    if ( data !== undefined )
    {
        switch ( data.cmd )
        {
            case "start":

                clearInterval( timer );

                timer = setInterval( function() {
                    self.postMessage({ cmd: "collect" });
                }, ( typeof data.interval === "number" ) ? data.interval : 25 );

                stepPrecision = ( typeof data.stepPrecision === "number" ) ? data.stepPrecision : 64;
                break;

            case "stop":
                clearInterval( timer );
                timer = null;
                break;

            case "update":
                updateProperties( data );
                break;

            case "collect":

                updateProperties( data );

                while ( nextNoteTime < ( currentTime + scheduleAheadTime ))
                {
                    self.postMessage({ cmd: "getTime" }); // request sync with AudioContext clock for next iteration

                    if ( data.sequenceEvents )
                    {
                        compareTime = ( nextNoteTime - measureStartTime );
                        i = channels.length;

                        while ( i-- )
                        {
                            channel = channels[ i ];
                            j = channel.length;

                            while ( j-- )
                            {
                                event = channel[ j ];

                                if ( event && !event.seq.playing && !event.recording &&
                                     event.seq.startMeasure === currentMeasure &&
                                     compareTime >= event.seq.startMeasureOffset &&
                                     compareTime < ( event.seq.startMeasureOffset + event.seq.length ))
                                {
                                    // let the controller enqueue this event into the AudioContext queue at the right time
                                    self.postMessage({
                                        cmd: "enqueue",
                                        event: j,
                                        measure: currentMeasure,
                                        channel: i,
                                        time: nextNoteTime
                                    });
                                    channel[ j ] = null; // don't re-evaluate the event from within this loop
                                }
                            }
                        }
                    }

                    if ( data.metronomeEnabled )
                        self.postMessage({ cmd: "metronome", time: nextNoteTime });

                    // advance current note and time by the given subdivision...
                    nextNoteTime += (( 60 / tempo ) * 4 ) / stepPrecision;

                    // advance the beat number, wrap to zero when start of next bar is enqueued
                    self.postMessage({ cmd: "step", nextNoteTime: nextNoteTime });
                }
                break;
        }
    }
}, false );

function updateProperties( data ) {

    channels          = data.channels || channels;
    nextNoteTime      = getNumeric( data.nextNoteTime, nextNoteTime );
    currentTime       = getNumeric( data.currentTime, currentTime );
    scheduleAheadTime = getNumeric( data.scheduleAheadTime, scheduleAheadTime );
    currentMeasure    = getNumeric( data.currentMeasure, currentMeasure );
    measureStartTime  = getNumeric( data.measureStartTime, measureStartTime );
    tempo             = getNumeric( data.tempo, tempo );
}

function getNumeric( value, fallbackValue ) {
    return ( typeof value === "number" ) ? value : fallbackValue;
}
