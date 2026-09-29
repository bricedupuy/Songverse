// signalsmith-stretch ships no types: its default export makes the stretch node (issue #129).
declare module "signalsmith-stretch" {
  const SignalsmithStretch: (context: BaseAudioContext, options?: AudioWorkletNodeOptions) => Promise<AudioWorkletNode>;
  export default SignalsmithStretch;
}
