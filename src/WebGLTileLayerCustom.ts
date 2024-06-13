import TileTextureCustom from "./TileTextureCustom.js"

import WebGLTile from "./ol/layer/WebGLTile.js"
import TileLayer, {Attributes, Uniforms} from "./ol/renderer/webgl/TileLayer.js"
import {getStringNumberEquivalent, newCompilationContext, uniformNameForVariable} from "./ol/expr/gpu.js"
import { TileRepresentationOptions } from "./ol/webgl/BaseTileRepresentation.js"
import { TileType } from "./ol/webgl/TileTexture.js"

type Style = { vertexShader: any; fragmentShader: any; uniforms: any; paletteTextures: any }
type StyleVariables = { variables: { [x: string]: any }; color: any[] }
type TextureParams = {nbDirAzimuth : number, nbDirElevation : number, layout :  TextureLayout}
type TextureLayout = [ {dataType:Uint32Array, bands:number, packed:boolean, type:string} ]

const float_precision_factor = 100_000
const NB_VALUES_IN_BAND = 6;

class WebGLTileLayerRendererCustom extends TileLayer {
    texturesLayout: TextureLayout
    
    constructor(tileLayer: WebGLTileLayerCustom, parsedStyle: Style, cacheSize: any) {
      super(tileLayer, {
        vertexShader: parsedStyle.vertexShader,
        fragmentShader: parsedStyle.fragmentShader,
        uniforms: parsedStyle.uniforms,
        cacheSize: cacheSize,
        paletteTextures: parsedStyle.paletteTextures,
      });
      this.texturesLayout = tileLayer.textures.layout
    }
    createTileRepresentation(options: TileRepresentationOptions<TileType>) {
        const sourceBandCount = this.texturesLayout.reduce((acc, item) => acc += item.bands * (item.packed ? 2 : 1), 0)
        return new TileTextureCustom(options, this.texturesLayout, float_precision_factor, sourceBandCount);
    }
}

export default class WebGLTileLayerCustom extends WebGLTile {
    textures: TextureParams
    getSourceBandCount: any

    constructor(options : any) { // TODO Define proper type
        super(options)
        this.textures = options.textures
        this.getSourceBandCount = this['getSourceBandCount_'] // TODO Hack
    }
    
    createRenderer() : WebGLTileLayerRendererCustom {
        const nbShadowBands =  this.textures.layout.filter(t => t.type == "shadow").reduce((acc, item) => acc += item.bands, 0)
        const style = parseStyle(this['style_'], this.getSourceBandCount(), this.textures.layout.length, this.textures.nbDirAzimuth, this.textures.nbDirElevation, nbShadowBands)
        return new WebGLTileLayerRendererCustom(this, style, this['cacheSize_']);
    }
}

function parseStyle(style: StyleVariables, bandCount:number, nbTextures:number, nbDirAzimuth:number, nbDirElevation:number, nbShadowBands:number) {
    const vertexShader = `#version 300 es
        in vec2 ${Attributes.TEXTURE_COORD};
        uniform mat4 ${Uniforms.TILE_TRANSFORM};
        uniform float ${Uniforms.TEXTURE_PIXEL_WIDTH};
        uniform float ${Uniforms.TEXTURE_PIXEL_HEIGHT};
        uniform float ${Uniforms.TEXTURE_RESOLUTION};
        uniform float ${Uniforms.TEXTURE_ORIGIN_X};
        uniform float ${Uniforms.TEXTURE_ORIGIN_Y};
        uniform float ${Uniforms.DEPTH};
        out vec2 v_textureCoord;
        out vec2 v_mapCoord;
        void main() {
            v_textureCoord = ${Attributes.TEXTURE_COORD};
            v_mapCoord = vec2(
                ${Uniforms.TEXTURE_ORIGIN_X} + ${Uniforms.TEXTURE_RESOLUTION} * ${Uniforms.TEXTURE_PIXEL_WIDTH}  * v_textureCoord[0],
                ${Uniforms.TEXTURE_ORIGIN_Y} - ${Uniforms.TEXTURE_RESOLUTION} * ${Uniforms.TEXTURE_PIXEL_HEIGHT} * v_textureCoord[1]
            );
            gl_Position = ${Uniforms.TILE_TRANSFORM} * vec4(${Attributes.TEXTURE_COORD}, ${Uniforms.DEPTH}, 1.0);
        }
    `;

    const context = {
        ...newCompilationContext(),
        inFragmentShader: true,
        bandCount: bandCount,
        style: style,
    };

    const uniforms : {[key: string]: () => number} = {};
    const variablesNames = Object.keys(style.variables);
    for (let i = 0; i < variablesNames.length; ++i) {
        uniforms[uniformNameForVariable(variablesNames[i])] = () => {
            let variableValue = style.variables[variablesNames[i]];
            if (typeof variableValue === 'string') {
                variableValue = getStringNumberEquivalent(variableValue);
            }
            return variableValue !== undefined ? variableValue : -9999999; // to avoid matching with the first string literal
        };
    }

    let shadowValueConditionInner = ""
    for(let i=0; i<nbShadowBands; i++){
        shadowValueConditionInner += `if(band == ${i}u){ return texture(${Uniforms.TILE_TEXTURE_ARRAY}[${Math.floor(i/4)+1}], coord)[${i%4}];}\n`
    }

    const fragmentShader = `#version 300 es
        precision highp float;
        precision highp usampler2D;
    
        in vec2 v_textureCoord;
        in vec2 v_mapCoord;
        uniform vec4 ${Uniforms.RENDER_EXTENT};
        uniform float ${Uniforms.TRANSITION_ALPHA};
        uniform float ${Uniforms.TEXTURE_PIXEL_WIDTH};
        uniform float ${Uniforms.TEXTURE_PIXEL_HEIGHT};
        uniform float ${Uniforms.RESOLUTION};
        uniform float ${Uniforms.ZOOM};
        ${Object.keys(uniforms).map(name => `uniform float ${name};`).join('\n')}
        uniform usampler2D ${Uniforms.TILE_TEXTURE_ARRAY}[${nbTextures}];
        out vec4 color;

        const float PI = 3.14159265;

        float hillshadeValue(float xOffset, float yOffset){
            vec2 coord = v_textureCoord + vec2(xOffset/${Uniforms.TEXTURE_PIXEL_WIDTH}, yOffset/${Uniforms.TEXTURE_PIXEL_HEIGHT});
            return float(texture(${Uniforms.TILE_TEXTURE_ARRAY}[0], coord)[0])/${float_precision_factor}.0;
        }

        float occlusion(){
            return float(texture(${Uniforms.TILE_TEXTURE_ARRAY}[0], v_textureCoord)[1])/${float_precision_factor}.0;
        }

        highp uint getShadowValue(uint band, float xOffset, float yOffset) {
            vec2 coord = v_textureCoord + vec2(xOffset/${Uniforms.TEXTURE_PIXEL_WIDTH}, yOffset/${Uniforms.TEXTURE_PIXEL_HEIGHT});
            ${shadowValueConditionInner}
        }

        float shadowMap(float xOffset, float yOffset){
            const float NB_DIRS = ${nbDirAzimuth}.0;
            const float NB_ELEVATIONS = ${nbDirElevation}.0;
            const float NB_VALUES_IN_BAND = ${NB_VALUES_IN_BAND}.0;

            uint direction_index = uint(mod(u_var_azimuth + 270.0, 360.0) * (NB_DIRS/360.0));
            uint bandMod = uint(mod(float(direction_index), NB_VALUES_IN_BAND));
            uint bandIndex = direction_index/uint(NB_VALUES_IN_BAND);

            highp uint bandValue = getShadowValue(bandIndex, xOffset, yOffset);
            highp uint shifted = bandValue >> (bandMod*5u); // bandValue >> (bandMod*5u);
            float texture_elevation = float((shifted << 27) >> 27);
            return clamp( (u_var_elevation*NB_ELEVATIONS/90.0) - texture_elevation, -0.5, 0.5)+0.5;
        }

        float blurredShadowMap(){
            const int kernelSize = 2;
            float dilation = u_var_dilation;
            const int kernelDiam = 2 * kernelSize + 1;
            const float weights[5] = float[](0.15, 0.2, 0.3, 0.2, 0.15);

            float color = 0.0;
            for(int i=0; i<kernelDiam; i++){
                for(int j=0; j<kernelDiam; j++){
                    color += shadowMap(float(i-kernelSize)*dilation, float(j-kernelSize)*dilation) * weights[i] * weights[j];
                }
            }
            return color*color*color; // Exaggerate values toward black so that shadows do not shrink when blurred
        }

        float hillshade(){
            float INVERSE_RESOLUTION   = 1.0 / ${Uniforms.RESOLUTION};
            float INVERSE_PIXEL_WIDTH  = 1.0 / ${Uniforms.TEXTURE_PIXEL_WIDTH};
            float INVERSE_PIXEL_HEIGHT = 1.0 / ${Uniforms.TEXTURE_PIXEL_HEIGHT};

            bool isLeftBorder   = v_textureCoord.x < INVERSE_PIXEL_WIDTH;
            bool isRightBorder  = v_textureCoord.x > 1.0 - INVERSE_PIXEL_WIDTH;
            bool isTopBorder    = v_textureCoord.y < INVERSE_PIXEL_HEIGHT;
            bool isBottomBorder = v_textureCoord.y > 1.0 - INVERSE_PIXEL_HEIGHT;

            bool isLeftRightBorder = isLeftBorder   || isRightBorder;
            bool isTopBottomBorder = isBottomBorder || isTopBorder;

            float min = -(1.0-float(isLeftBorder));
            float max = 1.0-float(isRightBorder);
            float res_factor = 2.0 * (1.0-float(isLeftRightBorder)) + float(isLeftRightBorder);
            float dzdx = (hillshadeValue(max, 0.0) - hillshadeValue(min, 0.0)) * (INVERSE_RESOLUTION/res_factor);

            min = -(1.0-float(isTopBorder));
            max = 1.0-float(isBottomBorder);
            res_factor = 2.0 * (1.0-float(isTopBottomBorder)) + float(isTopBottomBorder);
            float dzdy = (hillshadeValue(0.0, max) - hillshadeValue(0.0, min)) * (INVERSE_RESOLUTION/res_factor);

            float slope = atan(u_var_zFactor * sqrt(dzdx*dzdx + dzdy*dzdy));
            float aspect = clamp( atan(-1.0*dzdx, dzdy) , -PI, PI);
            float zenithRad = (90.0 - u_var_elevation) * (PI/180.0);
            return clamp(cos(zenithRad) * cos(slope) + sin(zenithRad) * sin(slope) * cos(u_var_azimuth * (PI/180.0) - aspect), 0.0, 1.0);
        }
    
        void main() {
            if (v_mapCoord[0] < ${Uniforms.RENDER_EXTENT}[0] || v_mapCoord[1] < ${Uniforms.RENDER_EXTENT}[1] || v_mapCoord[0] > ${Uniforms.RENDER_EXTENT}[2] || v_mapCoord[1] > ${Uniforms.RENDER_EXTENT}[3]) {
                discard;
            }
            float grey = ${style.color[0]};
            color = vec4(grey, grey, grey, 1.0) * ${Uniforms.TRANSITION_ALPHA} * float(hillshadeValue(0.0, 0.0) != 0.0);
        }`;

    console.log(fragmentShader)
    return {vertexShader, fragmentShader, uniforms, paletteTextures: context.paletteTextures};
}