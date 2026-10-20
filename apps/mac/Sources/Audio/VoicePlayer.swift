@preconcurrency import AVFoundation

/// Plays the agent's voice: 24 kHz mono PCM16 chunks from Gemini Live, queued as they
/// stream in. `stop()` cuts it off at once (the user started talking over it).
final class VoicePlayer: @unchecked Sendable {
    /// Every queued chunk has played. Called on an audio thread.
    var onIdle: (@Sendable () -> Void)?

    private let engine = AVAudioEngine()
    private let node = AVAudioPlayerNode()
    private let format = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 24_000, channels: 1, interleaved: false)!
    private let lock = NSLock()
    private var queued = 0
    /// Bumped by `stop()`, so callbacks from dropped buffers don't count down the new queue.
    private var epoch = 0

    init() {
        engine.attach(node)
        engine.connect(node, to: engine.mainMixerNode, format: format)
    }

    var isPlaying: Bool { lock.withLock { queued > 0 } }

    func enqueue(pcm16 data: Data) {
        let frames = data.count / 2
        guard frames > 0, let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(frames)),
              let out = buffer.floatChannelData?[0] else { return }
        buffer.frameLength = AVAudioFrameCount(frames)
        data.withUnsafeBytes { raw in
            let samples = raw.bindMemory(to: Int16.self)
            for i in 0..<frames { out[i] = Float(Int16(littleEndian: samples[i])) / 32768 }
        }

        if !engine.isRunning {
            do { try engine.start() } catch { return }
        }
        let myEpoch = lock.withLock { () -> Int in
            queued += 1
            return epoch
        }
        node.scheduleBuffer(buffer, completionCallbackType: .dataPlayedBack) { [weak self] _ in
            guard let self else { return }
            let idle = self.lock.withLock { () -> Bool in
                guard myEpoch == self.epoch else { return false }
                self.queued -= 1
                return self.queued == 0
            }
            if idle { self.onIdle?() }
        }
        if !node.isPlaying { node.play() }
    }

    func stop() {
        lock.withLock {
            epoch += 1
            queued = 0
        }
        node.stop()
    }
}
