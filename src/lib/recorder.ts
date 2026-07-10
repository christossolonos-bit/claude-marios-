// Thin wrapper around MediaRecorder for capturing a short voice message from the
// microphone. Returns the recording as a Blob for local transcription.

export function isRecordingSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined"
  );
}

export class AudioRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.chunks = [];
    this.recorder = new MediaRecorder(this.stream);
    this.recorder.ondataavailable = (e) => {
      if (e.data.size) this.chunks.push(e.data);
    };
    this.recorder.start();
  }

  // Stop recording and resolve with the captured audio.
  stop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const rec = this.recorder;
      if (!rec) {
        reject(new Error("Not recording"));
        return;
      }
      rec.onstop = () => {
        const blob = new Blob(this.chunks, {
          type: rec.mimeType || "audio/webm",
        });
        this.cleanup();
        resolve(blob);
      };
      rec.stop();
    });
  }

  cancel(): void {
    try {
      this.recorder?.stop();
    } catch {
      // ignore
    }
    this.cleanup();
  }

  private cleanup(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.recorder = null;
  }
}
