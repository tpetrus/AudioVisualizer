import { Injectable } from "@angular/core";
import { Observable } from "rxjs";

@Injectable({
    providedIn: 'root'
})
export class AudioService {

    private audioStream: MediaStream | undefined;
    private audioContext: AudioContext | undefined;
    private analyser!: AnalyserNode;
    private source: MediaStreamAudioSourceNode | undefined;

    public generateAudioStream(): Promise<MediaStream> {
        return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    }

    constructor() {
            this.generateAudioStream().then((stream) => {
            this.audioStream = stream;
            this.audioContext = new AudioContext();
            this.analyser = this.audioContext.createAnalyser();
            this.source = this.audioContext.createMediaStreamSource(this.audioStream);
            this.source.connect(this.analyser);
        });

    }

    public getAnalyser(): Observable<AnalyserNode> {

            let analyserObservable = new Observable<AnalyserNode>(observer => {
              setTimeout(() => {
                observer.next(this.analyser);
              }, 1000);
            });
        
            return analyserObservable;
    }
}