import { Injectable } from "@angular/core";
import { CanActivate, Router, UrlTree } from "@angular/router";
import { AudioService } from "./audio.service";

// Screen capture can't survive a page refresh (the browser requires a click to start it), but an input
// device can be reopened silently. If neither works, send the user back to the landing page to choose a source.
@Injectable({
    providedIn: 'root'
})
export class AudioCaptureGuard implements CanActivate {
    constructor(private readonly _audioService: AudioService, private readonly _router: Router) { }

    async canActivate(): Promise<boolean | UrlTree> {
        return await this._audioService.resumeSavedSource() || this._router.parseUrl('/');
    }
}
