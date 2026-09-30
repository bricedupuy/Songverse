import { config } from "zod";

// Zod compiles each object schema with new Function() when it can, and
// finds out as the schema is defined, by trying one - which the web app's
// Content-Security-Policy refuses (issue #114). Told not to, it validates
// as it goes, a little slower, and never tries. Every module here that
// defines a schema imports this first, so it runs before any of them.
config({ jitless: true });
