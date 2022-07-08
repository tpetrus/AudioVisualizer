export const fragmentShader = /*glsl*/`
precision mediump float;
precision mediump int;

uniform float time;

varying vec3 vPosition;
varying vec4 vColor;

void main()	{

    vec4 color = vec4( vColor );

    gl_FragColor = color;

}`;