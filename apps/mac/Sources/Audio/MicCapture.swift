@preconcurrency import AVFoundation

/// The microphone while the talk keys are held: 16 kHz mono PCM16 chunks of about
/// 100 ms (what Gemini Live takes), each with its loudness for the waveform.
/// Chunks arrive on an audio thread.
final class MicCapture: @unchecked Sendable {
    enum Failure: Error { case noInputDevice }

    private let engine = AVAudioEngine()
    private let target = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 16_000, channels: 1, interleaved: true)!

    func start(onChunk: @escaping @Sendable (Data, Float) -> Void) throws {
        stop()
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0, let converter = AVAudioConverter(from: format, to: target) else {
            throw Failure.noInputDevice
        }
        let target = target
        let ratio = target.sampleRate / format.sampleRate

        input.installTap(onBus: 0, bufferSize: AVAudioFrameCount(format.sampleRate / 10), format: format) { buffer, _ in
            let capacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 32
            guard let out = AVAudioPCMBuffer(pcmFormat: target, frameCapacity: capacity) else { return }
            let fed = Flag()
            var error: NSError?
            converter.convert(to: out, error: &error) { _, status in
                if fed.isSet {
                    status.pointee = .noDataNow
                    return nil
                }
                fed.set()
                status.pointee = .haveData
                return buffer
            }
            guard error == nil, out.frameLength > 0, let samples = out.int16ChannelData?[0] else { return }
            let count = Int(out.frameLength)
            var power: Float = 0
            for i in 0..<count {
                let s = Float(samples[i]) / 32768
                power += s * s
            }
            onChunk(Data(bytes: samples, count: count * 2), (power / Float(count)).squareRoot())
        }
        engine.prepare()
        try engine.start()
    }

    func stop() {
        engine.inputNode.removeTap(onBus: 0)
        if engine.isRunning { engine.stop() }
    }
}

/// A one-shot flag for the converter's input block (it must hand over each buffer once).
private final class Flag: @unchecked Sendable {
    private(set) var isSet = false
    func set() { isSet = true }
}
