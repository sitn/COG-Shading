import DataTile from "./ol/DataTile.js";
import ImageTile from "./ol/ImageTile.js";
import { TileRepresentationOptions } from "./ol/webgl/BaseTileRepresentation.js";
import TileTexture, { TileType } from "./ol/webgl/TileTexture.js"
import {TextureLayout} from "./WebGLTileLayerCustom"
import { Extent } from "./ol/extent.js";

/*function imageToUint8Array(image: HTMLCanvasElement | HTMLImageElement | HTMLVideoElement) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d")!;
  canvas.width = image.width;
  canvas.height = image.height;
  console.log(`Image size : (${image.width},${image.height})`)
  context.drawImage(image, 0, 0);
  
  const data = context.getImageData(0, 0, image.width, image.height).data
  const result = new Uint8Array(data.length)
  for(let i=0; i<data.length; i++){
    result[i] = data[i];
  }
  return result
}*/

function bindAndConfigure(gl: WebGL2RenderingContext, texture: WebGLTexture, interpolate: boolean) {
  const resampleFilter = interpolate ? gl.LINEAR : gl.NEAREST;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, resampleFilter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, resampleFilter);
}

function uploadImageTexture(gl: WebGL2RenderingContext, texture: WebGLTexture, data: Uint8Array, size: number[], _interpolate: boolean) {
  bindAndConfigure(gl, texture, /*interpolate*/false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8UI, size[0], size[1], 0, gl.RGBA_INTEGER, gl.UNSIGNED_BYTE, data);
}

function uploadDataTexture(gl: WebGL2RenderingContext, texture: WebGLTexture, data: ArrayBufferView, size: number[], bandCount: number, _interpolate: boolean) {
  bindAndConfigure(gl, texture, /*interpolate*/false);
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
  texturesLayout: TextureLayout;
  floatPrecisionFactor: number;
  wmtsBuffer: CanvasRenderingContext2D | null

  wmtsTexture : WebGLTexture | null = null

  constructor(
    options: TileRepresentationOptions<TileType>, texturesLayout: TextureLayout, 
    floatPrecisionFactor: number,  wmtsBuffer : CanvasRenderingContext2D | null
   ) {
    super(options);
    this["getArrayPixelData_"] = this.getArrayPixelData // Hack, do not do this at home
    this.texturesLayout = texturesLayout
    this.floatPrecisionFactor = floatPrecisionFactor
    this.wmtsBuffer = wmtsBuffer;
  }

  uploadTile() {
    const gl = this.helper_.getGL() as WebGL2RenderingContext;

    if (this.tile instanceof ImageTile) {
      /*const texture = gl.createTexture()!;
      this.textures.push(texture);
      uploadImageTexture(gl, texture, imageToUint8Array(this.tile.getImage()), [this.tile.getImage().width, this.tile.getImage().height], this.tile.interpolate);*/


    }else if(this.tile instanceof DataTile){
      const data = this.tile.getData() as Float32Array | Uint8Array;
      const sourceTileSize = this.tile.getSize();
      const pixelSize = [sourceTileSize[0] + 2 * this.gutter_, sourceTileSize[1] + 2 * this.gutter_];
      const pixelCount = pixelSize[0] * pixelSize[1];
      const nbTextures = this.texturesLayout.data.length
      const unpackedBandCount = data.length / pixelCount
  
      let bandToTextureId = []
      let counter = 0
      for(let i=0; i< nbTextures; i++){
        for(let j=0; j<this.texturesLayout.data[i].bands*(this.texturesLayout.data[i].packed?2:1); j++){
          bandToTextureId[counter] = {textureId:i, bandId:j}
          counter++
        }
      }
  
      const textureDataArrays = new Array(nbTextures);
      for (let textureIndex = 0; textureIndex < nbTextures; textureIndex++) {
        const layout = this.texturesLayout.data[textureIndex]
        textureDataArrays[textureIndex] = new Uint32Array(pixelCount * layout.bands);
      }
  
      for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex++) {
        const pixelOffset = pixelIndex * unpackedBandCount
        for (let band = 0; band < unpackedBandCount; band++){
          const textureId = bandToTextureId[band].textureId
          let textureOffset
          if(this.texturesLayout.data[textureId].packed){
            textureOffset = bandToTextureId[band].bandId/2 + pixelIndex * this.texturesLayout.data[textureId].bands
            textureDataArrays[textureId][textureOffset] = data[pixelOffset + band] + (data[pixelOffset + band + 1] << 15)
            band++ 
          }else{
            textureOffset = bandToTextureId[band].bandId + pixelIndex * this.texturesLayout.data[textureId].bands
            textureDataArrays[textureId][textureOffset] = data[pixelOffset + band] * this.floatPrecisionFactor
          }
        }
      }
  
      for (let texId = 0; texId < nbTextures; texId++) {
        const texture = gl.createTexture()!
        this.textures.push(texture);
        uploadDataTexture(gl, texture, textureDataArrays[texId], pixelSize, textureDataArrays[texId].length / pixelCount, this.tile.interpolate);
      }

      // WMTS texture
      if(this.wmtsBuffer != null){
        this.wmtsTexture = gl.createTexture()!
        this.textures.push(this.wmtsTexture);
      }
     
    }else {
      console.error("Only ImageTile / DataTiles are supported")
    }
    this.setReady();
  }

  update(resolution : number, tileExtent:Extent, renderExtent:Extent){
    const gl = this.helper_.getGL() as WebGL2RenderingContext;
    if(this.wmtsBuffer != null){
      const renderCenter = [ (renderExtent[0] + renderExtent[2]) / 2, (renderExtent[1] + renderExtent[3]) / 2]
      const pixelCenter = [this.wmtsBuffer.canvas.width/2,  this.wmtsBuffer.canvas.height/2]

      /*console.log(tileExtent)
      console.log("--")*/
      //console.log(wmtsResolutionView)
      const x0 = (tileExtent[0] - renderCenter[0])/resolution + pixelCenter[0]
      const y0 = (renderCenter[1] - tileExtent[3])/resolution + pixelCenter[1]
      const x1 = (tileExtent[2] - renderCenter[0])/resolution + pixelCenter[0]
      const y1 = (renderCenter[1] - tileExtent[1])/resolution + pixelCenter[1] 
      const width = x1 - x0 
      const height = y1 - y0
      const wmtsData = this.wmtsBuffer.getImageData(x0, y0, width, height).data
      //console.log(`${x0} ${y0} - ${x1} ${y1} - ${width} ${height}`)
      uploadImageTexture(gl, this.wmtsTexture!, new Uint8Array(wmtsData), [width, height], this.tile.interpolate);
    }
  }


  getArrayPixelData(data: any[], sourceSize: number[], renderCol: number, renderRow: number) {
    const sourceBandCount = this.texturesLayout.data.reduce((acc, item) => acc += item.bands * (item.packed ? 2 : 1), 0)
    const sourceWidth = sourceSize[0] + 2 * this.gutter_;
    const sourceCol = this.gutter_ + Math.floor(sourceSize[0] * (renderCol / (this as any).renderSize_[0])); // Ugly, but required
    const sourceRow = this.gutter_ + Math.floor(sourceSize[1] * (renderRow /  (this as any).renderSize_[1]));
    const offset = sourceBandCount * (sourceRow * sourceWidth + sourceCol);
    return data.slice(offset, offset + sourceBandCount);
  }
}
