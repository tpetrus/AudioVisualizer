import type { Box3, Vector3 } from 'three';
import { FRAMING_MARGIN } from './dancingCharacterConfig';

// Camera distance from the look target (along the horizontal view direction) at which the box fits the view with a
// margin, and writes the box center, which is the look target, into `out`. The camera orbits, so the box is treated as
// its horizontal bounding circle: the result holds at every azimuth, with no per-angle work. Allocates nothing.
export function computeFraming(box: Box3, fovDeg: number, aspect: number, zoom: number, out: Vector3): number {
    box.getCenter(out);
    const halfWidth = (box.max.x - box.min.x) / 2;
    const halfHeight = (box.max.y - box.min.y) / 2;
    const halfDepth = (box.max.z - box.min.z) / 2;
    // Radius of the circle around the center that holds the box seen from above.
    const radius = Math.hypot(halfWidth, halfDepth);

    const tanVertical = Math.tan((fovDeg * Math.PI) / 360);
    const tanHorizontal = tanVertical * aspect;

    // A point `lateral` to the side and `toward` closer to the camera than the center is inside the view while
    // lateral * margin / tan + toward <= distance. The worst point on the circle maximizes the left side.
    const horizontal = radius * Math.hypot(1, FRAMING_MARGIN / tanHorizontal);
    // Vertically the worst point is the top or bottom edge at the circle's nearest point.
    const vertical = radius + (halfHeight * FRAMING_MARGIN) / tanVertical;

    return Math.max(horizontal, vertical) / zoom;
}
