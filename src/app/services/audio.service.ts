import { Injectable } from "@angular/core";
import { Observable, ReplaySubject } from "rxjs";
import { delay } from "rxjs/operators";

@Injectable({
    providedIn: 'root'
})
export class AudioService {
    private audioStream: MediaStream | undefined;
    private audioContext: AudioContext | undefined;
    private analyser: AnalyserNode | undefined;
    private source: MediaStreamAudioSourceNode | undefined;
    private analyser$ = new ReplaySubject<AnalyserNode>(1);

    public get isCapturing(): boolean {
      return !!this.analyser;
    }

    // Captures whatever the computer is playing (system/tab audio). Must be called from a user gesture.
    public async startCapture(): Promise<void> {
      if (this.analyser) {
        return;
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
      if (stream.getAudioTracks().length === 0) {
        stream.getTracks().forEach(track => track.stop());
        throw new Error('No audio was shared. Choose a screen or tab and enable "Share system audio".');
      }

      // Only audio is needed; drop the video track.
      stream.getVideoTracks().forEach(track => track.stop());

      this.audioStream = stream;
      this.audioContext = new AudioContext();
      this.analyser = this.audioContext.createAnalyser();
      this.source = this.audioContext.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
      this.source.connect(this.analyser);
      this.analyser$.next(this.analyser);
    }

    public getAnalyser(): Observable<AnalyserNode> {
      // Delay so subscribers (which build their scene in the constructor) run after their view has rendered.
      return this.analyser$.pipe(delay(0));
    }
}
