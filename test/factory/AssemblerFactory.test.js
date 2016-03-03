/**
 * Created by igorzinken on 26-07-15.
 */
var chai             = require( "chai" );
var MockBrowser      = require( "mock-browser" ).mocks.MockBrowser;
var AssemblerFactory = require( "../../src/js/factory/AssemblerFactory" );
var SongModel        = require( "../../src/js/model/SongModel" );
var TIA              = require( "../../src/js/definitions/TIA" );
var Time             = require( "../../src/js/utils/Time" );
var ObjectUtil       = require( "../../src/js/utils/ObjectUtil" );

describe( "AssemblerFactory", function()
{
    /* setup */

    // use Chai assertion library
    var assert = chai.assert,
        expect = chai.expect;

    var song, model, browser;

    // executed before the tests start running

    before( function()
    {
        browser       = new MockBrowser();
        global.window = browser.getWindow();

        model = new SongModel();
    });

    // executed when all tests have finished running

    after( function()
    {

    });

    // executed before each individual test

    beforeEach( function()
    {
        song = model.createSong();
    });

    // executed after each individual test

    afterEach( function()
    {

    });

    /* actual unit tests */

    it( "should show the author, title and date in the assembly output", function()
    {
        song.meta.title  = "foo";
        song.meta.author = "bar";

        var asm = textToLineArray( AssemblerFactory.assemblify( song ));

        assert.ok( asm[ 1 ].indexOf( song.meta.title ) > -1,
            "expected assembly output to contain song title" );

        assert.ok( asm[ 3 ].indexOf( song.meta.author ) > -1,
            "expected assembly output to contain song title" );

        assert.ok( asm[ 4 ].indexOf( Time.timestampToDate( song.meta.created )) > -1,
            "expected assembly output to contain song title" );
    });

    it( "should have the correct tempo value in the assembly output", function()
    {
        song.meta.tempo = rand( 1, 10 );

        var asm = textToLineArray( AssemblerFactory.assemblify( song ));

        assert.ok( asm[ 12 ].indexOf( "TEMPODELAY equ " + song.meta.tempo ) > -1,
            "expected assembly output to contain correct tempo value" );
    });

    it( "should translate the hat pattern correctly into the assembly output", function()
    {
        var pattern = song.hats.pattern;

        for ( var i = 0; i < pattern.length; ++i )
            pattern[ i ] = ( randBool() ) ? 1 : 0;

        var asm = textToLineArray( AssemblerFactory.assemblify( song ));
        var lineStart = getLineNumForText( asm, "hatPattern" ) + 1;
        var lineEnd   = lineStart + 4; // 4 lines in total (32 steps divided by 8)
        var pIndex    = 0;
        var lookup;

        for ( lineStart; lineStart < lineEnd; ++lineStart, ++pIndex )
        {
            lookup = "    byte %" + pattern.slice( pIndex * 8, ( pIndex * 8 ) + 8 ).join( "" );
            assert.ok( asm[ lineStart ].indexOf( lookup ) > -1,
                "expected line to contain correct hat pattern definition" );
        }
    });

    it( "should translate the hat pattern properties correctly into the assembly output", function()
    {
        var hats = song.hats;

        hats.start  = rand( 0, 255 );
        hats.pitch  = rand( 0, 31 );
        hats.volume = rand( 0, 15 );
        hats.sound  = rand( 1, 15 );

        var asm = textToLineArray( AssemblerFactory.assemblify( song ));

        assert.ok( asm[ getLineNumForText( asm, "HATSTART equ" )].indexOf( hats.start ) > -1,
            "expected hat start offset to have been translated correctly" );

        assert.ok( asm[ getLineNumForText( asm, "HATVOLUME equ" )].indexOf( hats.volume ) > -1,
            "expected hat volume to have been translated correctly" );

        assert.ok( asm[ getLineNumForText( asm, "HATPITCH equ" )].indexOf( hats.pitch ) > -1,
            "expected hat pitch to have been translated correctly" );

        assert.ok( asm[ getLineNumForText( asm, "HATSOUND equ" )].indexOf( hats.sound ) > -1,
            "expected hat sound to have been translated correctly" );
    });

    it( "should declare silent patterns only once to save space", function()
    {
        var channel1 = song.patterns[ 0 ].channels[ 0 ];
        var bank     = TIA.table.tunings[ 0 ].BASS;
        var i, l, def;

        // add some random notes for the first quaver of the first channels bar

        for ( i = 0, l = song.patterns[0].steps / 4; i < l; ++i )
        {
            def = bank[ rand( 0, bank.length - 1 )];
            channel1[ i ] = {
                sound: "BASS",
                note: def.note,
                octave: def.octave,
                accent: randBool()
            };
        }

        var asm = textToLineArray( AssemblerFactory.assemblify( song ));
        var patternDef = getLineNumForText( asm, "Higher volume patterns" ) + 3;

        assert.ok( asm[ patternDef ].indexOf( "word Pattern1, Pattern2, Pattern2, Pattern2" ) > -1,
            "expected one unique and three re-used patterns for channel 1" );

        assert.ok( asm[ patternDef + 1 ].indexOf( "word Pattern2, Pattern2, Pattern2, Pattern2" ) > -1,
            "expected four re-used patterns for channel 2" );
    });

    it( "should define duplicate patterns only once to save space", function()
    {
        var channel1 = song.patterns[ 0 ].channels[ 0 ];
        var channel2 = song.patterns[ 0 ].channels[ 1 ];
        var bank     = TIA.table.tunings[ 0 ].BASS;
        var i, j, l, def;

        // add some random notes for the first quaver of the first channels bar

        for ( i = 0, l = song.patterns[0].steps / 4; i < l; ++i )
        {
            def = bank[ rand( 0, bank.length - 1 )];
            channel1[ i ] = {
                sound: "BASS",
                note: def.note,
                octave: def.octave,
                accent: randBool()
            };
        }

        // copy the 1st quaver defined in channel 1 into channel 2 at the start of its 2nd quaver

        for ( i = 0, j = 4; i < 4; ++i, ++j )
            channel2[ j ] = ObjectUtil.clone( channel1[ i ]);

        var asm = textToLineArray( AssemblerFactory.assemblify( song ));
        var patternDef = getLineNumForText( asm, "Higher volume patterns" ) + 3;

        assert.ok( asm[ patternDef ].indexOf( "word Pattern1, Pattern2, Pattern2, Pattern2" ) > -1,
            "expected one unique and three re-used patterns for channel 1" );

        assert.ok( asm[ patternDef + 1 ].indexOf( "word Pattern2, Pattern1, Pattern2, Pattern2" ) > -1,
            "expected three re-used silent and one re-used pattern for channel 2" );

        // add some random notes for the last quaver of the second channels bar

        for ( i = 12, l = 16; i < l; ++i )
        {
            def = bank[ rand( 0, bank.length - 1 )];
            channel2[ i ] = {
                sound: "BASS",
                note: def.note,
                octave: def.octave,
                accent: randBool()
            };
        }
        asm = textToLineArray( AssemblerFactory.assemblify( song ));
        patternDef = getLineNumForText( asm, "Higher volume patterns" ) + 3;

        assert.ok( asm[ patternDef ].indexOf( "word Pattern1, Pattern2, Pattern2, Pattern2" ) > -1,
            "expected one unique and three re-used patterns for channel 1" );

        assert.ok( asm[ patternDef + 1 ].indexOf( "word Pattern2, Pattern1, Pattern2, Pattern3" ) > -1,
            "expected two re-used silent, one re-used pattern and one unique pattern for channel 2" );
    });

    it( "should redeclare a pattern that is a duplicate by notes, but not by accents", function()
    {
        var channel1 = song.patterns[ 0 ].channels[ 0 ];
        var channel2 = song.patterns[ 0 ].channels[ 1 ];
        var bank     = TIA.table.tunings[ 0 ].BASS;
        var i, j, l, def;

        // add some random notes for the first quaver of the first channels bar

        for ( i = 0, l = song.patterns[0].steps / 4; i < l; ++i )
        {
          def = bank[ rand( 0, bank.length - 1 )];
          channel1[ i ] = {
              sound: "BASS",
              note: def.note,
              octave: def.octave,
              accent: randBool()
          };
        }

        // copy the 1st quaver defined in channel 1 into channel 2 at the start of its 2nd quaver

        for ( i = 0, j = 4; i < 4; ++i, ++j ) {
            channel2[ j ] = ObjectUtil.clone( channel1[ i ] );
            channel2[ j ].accent = !channel1[ i ].accent; // flip the accent
        }

        var asm = textToLineArray( AssemblerFactory.assemblify( song ));
        var patternDef = getLineNumForText( asm, "Higher volume patterns" ) + 3;

        assert.ok( asm[ patternDef ].indexOf( "word Pattern1, Pattern2, Pattern2, Pattern2" ) > -1,
            "expected one unique and three re-used patterns for channel 1" );

        assert.ok( asm[ patternDef + 1 ].indexOf( "word Pattern2, Pattern3, Pattern2, Pattern2" ) > -1,
            "expected two re-used silent, one re-used pattern and one unique pattern (different by accents) for channel 2" );
    });
});

/* helper functions */

function randBool()
{
    return Math.random() > .5;
}

function rand( min, max )
{
    return Math.round( Math.random() * max ) + min;
}

function textToLineArray( text )
{
    return text.replace( /\r\n|\n\r|\n|\r/g,"\n" ).split( "\n" );
}

function getLineNumForText( textArray, textToFind )
{
    for ( var i = 0, l = textArray.length; i < l; ++i )
    {
        if ( textArray[ i ].indexOf( textToFind ) > -1 )
            return i;
    }
    return -1;
}