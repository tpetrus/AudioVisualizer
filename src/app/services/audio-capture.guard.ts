import { Injectable } from "@angular/core";
import { CanActivate, Router, UrlTree } from "@angular/router";
import { AudioService } from "./audio.service";

// Audio capture can't survive a page refresh (the browser requires a click to start it),
// so send the user back to the landing page to start it again.
@Injectable({
    providedIn: 'root'
})
export class AudioCaptureGuard implements CanActivate {
    constructor(private readonly _audioService: AudioService, private readonly _router: Router) { }

    canActivate(): boolean | UrlTree {
        return this._audioService.isCapturing || this._router.parseUrl('/');
    }
}
