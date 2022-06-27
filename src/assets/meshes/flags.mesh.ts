import { fragmentShader } from 'src/app/polyhedron/lib/fragment-shaders';
import { vertexShader } from 'src/app/polyhedron/lib/vertex-shaders';
import * as THREE from 'three';

export class FlagsMesh {
    private readonly numFlagsDepth;
    private readonly numFlagsWidth;
    private readonly numberOfFlags;
    public geometry: THREE.BufferGeometry = new THREE.BufferGeometry();
    public material: THREE.RawShaderMaterial = new THREE.RawShaderMaterial({
        uniforms: {
            time: { value: 1.0 }
        },
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
        side: THREE.FrontSide,
        transparent: false
    });
    private blockSize?: number;
    private distance?: number;
    public positions: number[];
    public positionAttribute: THREE.Float32BufferAttribute;
    public colors: number[];
    public colorAttribute: THREE.Uint8BufferAttribute;
    public mesh: THREE.Mesh;

    public generateDefaultFlagPositionValues(z: number, y: number, blockSize: number = 5, distance: number = 10): number[] {

        let bottomFlag = [
           -blockSize + distance*y, 1, -blockSize + distance*z,
           -blockSize + distance*y, 1, blockSize + distance*z,
            blockSize + distance*y, 1, blockSize + distance*z
        ];
  
        let topFlag = [
          blockSize + distance*y, 1,  blockSize + distance*z,
          blockSize + distance*y, 1, -blockSize + distance*z,
          -blockSize + distance*y, 1, -blockSize + distance*z
        ];

        return bottomFlag.concat(topFlag);
    }

    public generateDefaultFlagPositions(): number[] {
        let positions: number[] = [];
        for(let y = 0; y < this.numFlagsWidth; y++ ) {
            for(let z = 0; z < this.numFlagsDepth; z++) {
                let generatedFlagPositions = this.generateDefaultFlagPositionValues(z, y, this.blockSize, this.distance);
                generatedFlagPositions.forEach((position) => {
                    positions.push(position);
                })
            }
        }
        return positions;
    }

    public generateDefaultFlagColorValues(): number[] {
        let colorValues: number[] = [];

        colorValues.push( Math.random() * 255 );
        colorValues.push( Math.random() * 255 );
        colorValues.push( Math.random() * 255 );
        colorValues.push( Math.random() * 255 );

        return colorValues;
    }

    public generateDefaultFlagColors(): number[] {
        let colors: number[] = [];
        for(let _ = 0; _ < this.numberOfFlags*3; _++) {
            let colorValues = this.generateDefaultFlagColorValues();
            colorValues.forEach(colorValue => {
                colors.push(colorValue);
            })
          }
        return colors;
    }

    public getNumberOfFlags(): number {
        return this.numberOfFlags;
    }

    constructor(numDepth: number, numWidth: number, geometry?: THREE.BufferGeometry, blockSize?: number, distance?: number, material?: THREE.RawShaderMaterial, positions?: number[], colors?: number[]) {
        this.numFlagsDepth = numDepth;
        this.numFlagsWidth = numWidth;
        this.numberOfFlags = this.numFlagsDepth * this.numFlagsWidth;
        if(geometry) {
            this.geometry = geometry;
        }
        if(material) {
            this.material = material;
        }
        if(positions){
            this.positions = positions;
        }
        else {
            this.positions = this.generateDefaultFlagPositions();
        }
        this.positionAttribute = new THREE.Float32BufferAttribute(this.positions, 3);
        this.geometry.setAttribute('position', this.positionAttribute);
        if(colors) {
            this.colors = colors;
        }
        else {
            this.colors = this.generateDefaultFlagColors();
        }
        this.colorAttribute = new THREE.Uint8BufferAttribute(this.colors, 4);
        this.colorAttribute.normalized = true;
        this.geometry.setAttribute('color', this.colorAttribute);
        this.mesh = new THREE.Mesh(this.geometry, this.material);
    }
}