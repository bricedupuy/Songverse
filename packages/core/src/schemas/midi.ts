import "../zod-config.js";
import { z } from "zod";
import { MIDI_EVENT_TYPES } from "../constants/index.js";

const ProgramChangeEventSchema = z.object({
  type: z.literal("program_change"),
  channel: z.number().int().min(1).max(16),
  program: z.number().int().min(0).max(127),
  bankMsb: z.number().int().min(0).max(127).optional(),
  bankLsb: z.number().int().min(0).max(127).optional(),
});

const ControlChangeEventSchema = z.object({
  type: z.literal("control_change"),
  channel: z.number().int().min(1).max(16),
  controller: z.number().int().min(0).max(127),
  value: z.number().int().min(0).max(127),
});

export const MidiEventSchema = z.discriminatedUnion("type", [
  ProgramChangeEventSchema,
  ControlChangeEventSchema,
]);
export type MidiEvent = z.infer<typeof MidiEventSchema>;

export const MidiItemTriggerSchema = z.object({
  arrangementItemId: z.string().min(1),
  events: z.array(MidiEventSchema),
});
export type MidiItemTrigger = z.infer<typeof MidiItemTriggerSchema>;

/** Shape of `UserArrangementMidi.itemTriggersJson`. */
export const MidiItemTriggersSchema = z.array(MidiItemTriggerSchema);
export type MidiItemTriggers = z.infer<typeof MidiItemTriggersSchema>;

export function parseMidiItemTriggers(input: unknown): MidiItemTriggers {
  return MidiItemTriggersSchema.parse(input);
}

export { MIDI_EVENT_TYPES };
