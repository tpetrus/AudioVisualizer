# Dancing character assets

Both files are CC0 1.0 (public domain dedication): no attribution is required, but it is recorded here so the source
of each file can be checked. They are imported with `?url`, so the build emits them hashed under `/assets/` with
immutable caching.

## RobotExpressive.glb

- Source: https://github.com/mrdoob/three.js/blob/r186/examples/models/gltf/RobotExpressive/RobotExpressive.glb
  (three.js r186, the same version the app pins)
- Author: Tomás Laulhé (https://www.patreon.com/quaternius); modified by Don McCurdy (three facial expression morph
  targets, converted with FBX2GLTF, duplicate materials removed, metalness reduced)
- License: CC0 1.0, as stated in the README.md next to the model in the three.js repository
- Size: 463,988 bytes, unchanged from the source
- sha256: `047f5e5fb3bb6d378bd1df16ca6137f2a596c99b3a1b5690b4020c05aaf6f319`

## kloofendal_48d_partly_cloudy_puresky_2k.jpg

- Source: Poly Haven, "Kloofendal 48d Partly Cloudy (Pure Sky)",
  https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky
- Authors: Greg Zaal (original), Jarod Guest (sky edits)
- License: CC0 1.0 (https://polyhaven.com/license)
- Derived from the tonemapped equirectangular JPG
  (https://dl.polyhaven.org/file/ph-assets/HDRIs/extra/Tonemapped%20JPG/kloofendal_48d_partly_cloudy_puresky.jpg,
  8192 x 4096, md5 `3f2b19fa9c14943b34e5d4f480ba13ba`), downscaled to 2048 x 1024 with sharp (mozjpeg, quality 82)
  so it stays light on laptops
- Size: 94,695 bytes
- sha256: `d5d822457dae38e4b4a495e592fdcfd954ce8c49ac3dcb57506443b081ddf2a6`
