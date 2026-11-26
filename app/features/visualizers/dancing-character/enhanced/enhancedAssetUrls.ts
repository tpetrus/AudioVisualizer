// URLs of the enhanced graphics assets. They are `?url` imports, so the build hashes the files under /assets/ and only
// the lazily loaded enhanced chunk references them: standard mode never fetches any of them.
import environmentHdrUrl from '../assets/enhanced/ferndale_studio_02_2k.hdr?url';
import frameDiffuseUrl from '../assets/enhanced/concrete_floor_worn_001_diff_2k.jpg?url';
import frameNormalUrl from '../assets/enhanced/concrete_floor_worn_001_nor_gl_2k.jpg?url';
import frameRoughnessUrl from '../assets/enhanced/concrete_floor_worn_001_rough_2k.jpg?url';
import skyTextureUrl from '../assets/enhanced/qwantani_night_puresky_4k.jpg?url';

export interface EnhancedAssetUrls {
    /** 2K RGBE .hdr that lights the scene through PMREM; never shown directly. */
    environmentHdr: string;
    /** 4K equirectangular LDR (sRGB) mapped on the sky dome. */
    skyTexture: string;
    /** 2K PBR maps for the club frame; the normal map is OpenGL convention. */
    frame: { map: string; normalMap: string; roughnessMap: string };
}

export const ENHANCED_ASSET_URLS: EnhancedAssetUrls = {
    environmentHdr: environmentHdrUrl,
    skyTexture: skyTextureUrl,
    frame: { map: frameDiffuseUrl, normalMap: frameNormalUrl, roughnessMap: frameRoughnessUrl },
};
