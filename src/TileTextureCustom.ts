import DataTile from "./ol/DataTile.js";
import { TileRepresentationOptions } from "./ol/webgl/BaseTileRepresentation.js";
import TileTexture, { TileType } from "./ol/webgl/TileTexture.js"

function bindAndConfigure(gl: WebGL2RenderingContext, texture: WebGLTexture, interpolate: boolean) {
  const resampleFilter = interpolate ? gl.LINEAR : gl.NEAREST;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, resampleFilter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, resampleFilter);
}

function uploadDataTexture(gl: WebGL2RenderingContext, texture: WebGLTexture, data: ArrayBufferView, size: number[], bandCount: number, interpolate: boolean) {
  bindAndConfigure(gl, texture, interpolate);
  const bytesPerRow = data.byteLength / size[1];
  let unpackAlignment = 1;
  if (bytesPerRow % 8 === 0) {
    unpackAlignment = 8;
  } else if (bytesPerRow % 4 === 0) {
    unpackAlignment = 4;
  } else if (bytesPerRow % 2 === 0) {
    unpackAlignment = 2;
  }

  const oldUnpackAlignment = gl.getParameter(gl.UNPACK_ALIGNMENT);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, unpackAlignment);

  let format, internalFormat;
  switch (bandCount) {
    case 1:
      internalFormat = gl.R32UI;
      format = gl.RED_INTEGER;
      break;
    case 2: 
      internalFormat =  gl.RG32UI;
      format = gl.RG_INTEGER;
      break;
    case 3: 
      internalFormat = gl.RGB32UI;
      format = gl.RGB_INTEGER;
      break;
    case 4: 
      internalFormat = gl.RGBA32UI;
      format = gl.RGBA_INTEGER;
      break;
    default: 
      throw new Error(`Unsupported number of bands: ${bandCount}`);
  }
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, size[0], size[1], 0, format, gl.UNSIGNED_INT, data);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, oldUnpackAlignment);
}

export default class TileTextureCustom extends TileTexture {
  texturesLayout: any;
  float_precision_factor: number;
  sourceBandCount: any;

  constructor(options: TileRepresentationOptions<TileType>, texturesLayout: any, float_precision_factor: number, sourceBandCount: number) {
    super(options);
    this["getArrayPixelData_"] = this.getArrayPixelData // Hack, do not do this at home
    this.texturesLayout = texturesLayout
    this.float_precision_factor = float_precision_factor
    this.sourceBandCount = sourceBandCount
  }

  uploadTile() {
    if(! (this.tile instanceof DataTile)){
      console.error("Only DataTiles are supported")
      return
    }
    
    const gl = this.helper_.getGL() as WebGL2RenderingContext;
    const data = this.tile.getData() as Float32Array | Uint8Array;
    const sourceTileSize = this.tile.getSize();
    const pixelSize = [sourceTileSize[0] + 2 * this.gutter_, sourceTileSize[1] + 2 * this.gutter_];
    const pixelCount = pixelSize[0] * pixelSize[1];

    const nbTextures = this.texturesLayout.length
    this.bandCount = this.texturesLayout.reduce((acc: number, item: { bands: number; }) => acc + item.bands , 0);
    const unpackedBandCount = data.length / pixelCount

    let bandToTextureId = []
    let counter = 0
    for(let i=0; i< nbTextures; i++){
      for(let j=0; j<this.texturesLayout[i].bands*(this.texturesLayout[i].packed?2:1); j++){
        bandToTextureId[counter] = {textureId:i, bandId:j}
        counter++
      }
    }

    this.textures.length = 0;
    const textureDataArrays = new Array(nbTextures);
    for (let textureIndex = 0; textureIndex < nbTextures; textureIndex++) {
      this.textures.push(gl.createTexture()!);
      const layout = this.texturesLayout[textureIndex]
      textureDataArrays[textureIndex] = new layout.dataType(pixelCount * layout.bands);
    }

    for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex++) {
      const pixelOffset = pixelIndex * unpackedBandCount
      for (let band = 0; band < unpackedBandCount; band++){
        const textureId = bandToTextureId[band].textureId
        let textureOffset
        if(this.texturesLayout[textureId].packed){
          textureOffset = bandToTextureId[band].bandId/2 + pixelIndex * this.texturesLayout[textureId].bands
          textureDataArrays[textureId][textureOffset] = data[pixelOffset + band] + (data[pixelOffset + band + 1] << 15)
          band++ 
        }else{
          textureOffset = bandToTextureId[band].bandId + pixelIndex * this.texturesLayout[textureId].bands
          textureDataArrays[textureId][textureOffset] = data[pixelOffset + band] * this.float_precision_factor
        }
      }
    }

    for (let texId = 0; texId < nbTextures; texId++) {
      const textureData = textureDataArrays[texId]
      const bandCount = textureData.length / pixelCount;
      uploadDataTexture(gl, this.textures[texId], textureData, pixelSize, bandCount, this.tile.interpolate);
    }
    this.setReady();
  }

  getArrayPixelData(data: any[], sourceSize: number[], renderCol: number, renderRow: number) {
    const sourceWidth = sourceSize[0] + 2 * this.gutter_;
    const sourceCol = this.gutter_ + Math.floor(sourceSize[0] * (renderCol / (this as any).renderSize_[0])); // Ugly, but required
    const sourceRow = this.gutter_ + Math.floor(sourceSize[1] * (renderRow /  (this as any).renderSize_[1]));
    const offset = this.sourceBandCount * (sourceRow * sourceWidth + sourceCol);
    return data.slice(offset, offset + this.sourceBandCount);
  }
}
