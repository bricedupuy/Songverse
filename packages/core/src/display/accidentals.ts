/**
 * A chord or key as it's shown (issue #230): sharps and flats as their
 * symbols, ♯ and ♭ - "F#m7b5" reads "F♯m7♭5", "Bb/D" "B♭/D", "Sib" "Si♭",
 * Nashville's "b7" "♭7". Written and stored with # and b, as typed; this
 * is only how they're drawn. A "b" is a flat after a note (a letter, or a
 * solfège name) or before a number; anywhere else it's a letter ("sub").
 */
export function prettyChord(text: string): string {
  return text
    .replace(/#/g, "♯")
    .replace(/(^|[\s/(])(Do|Ré|Re|Mi|Fa|Sol|La|Si|[A-G])b/g, "$1$2♭")
    .replace(/b(?=\d)/g, "♭");
}
