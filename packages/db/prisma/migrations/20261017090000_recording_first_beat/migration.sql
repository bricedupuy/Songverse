-- Where a recording's first beat falls, in seconds (issue #100): places it against the metronome.
ALTER TABLE "Attachment" ADD COLUMN "recordingFirstBeat" DOUBLE PRECISION;
