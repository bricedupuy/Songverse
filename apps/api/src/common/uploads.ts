/**
 * Every upload's options (issue #130): browsers send a file's name in
 * UTF-8, but multer (busboy) reads it as Latin-1 unless told - "même"
 * became "mÃªme".
 */
export const UPLOAD_OPTIONS = { defParamCharset: "utf8" } as const;
