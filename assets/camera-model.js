/*
  Optional computer-vision model hook.
  Replace analyzeFrame() with a local TensorFlow.js / ONNX Runtime Web model later.
  The browser shell already handles camera input, confidence gating, drafts,
  corrections, and logging. This safe default never invents football labels.
*/
window.AnalystAssistVisionModel = {
  ready: false,
  async load(){ this.ready = false; return {ready:false, reason:'No trained football vision model installed'}; },
  async analyzeFrame(_canvas, context){
    return {
      confidence: 0,
      observations: {},
      play: null,
      note: context?.motion > 0.35 ? 'Motion detected; model hook available.' : ''
    };
  }
};
