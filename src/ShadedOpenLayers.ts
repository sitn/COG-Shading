import Projection from "ol/proj/Projection.js"
import { getCenter } from "ol/extent.js"
import proj4 from "proj4"
import { getPosition } from "suncalc"
import { Pixel } from "ol/pixel"
import { WMTSCapabilities } from "ol/format"
import GeoTIFF from "ol/source/GeoTIFF.js"
import OlMap from "ol/Map.js"
import View from "ol/View.js"
import WMTS, { optionsFromCapabilities } from "ol/source/WMTS"

import WebGLTileLayerCustom from "./WebGLTileLayerCustom.ts"

type Maps = { 
    dsm: string; 
    dtm:string, 
    occlusionDsm: string;
    occlusionDtm:string, 
    shadowMap: string; 
    ortho: {capabilitiesURL:string; layer:string} 
}
type SliderParams = [string, number, number, string]
export type Sliders = { inputs: {[key: string]: SliderParams}, modes:any }

function getInputValue(id:string){
    return (document.getElementById(id)! as HTMLInputElement).value
}

export default class ShadedOpenLayers{
    maps: Maps
    mapId: string
    extent: number[]
    animated: boolean = false
    currentDate: Date = new Date()
    projection: string
    sliders: Sliders
    tile : WebGLTileLayerCustom | null = null
    sources : {DTM : GeoTIFF, DSM : GeoTIFF, Ortho : WMTS} | null = null
    currentModel : 'DTM' | 'DSM' = 'DSM'
    
    constructor(maps: Maps, projection: string, extent: number[], sliders: Sliders, mapId="map"){
        this.maps = maps
        this.mapId = mapId
        this.projection = projection
        this.extent = extent
        this.sliders = sliders
    }

    async start(){
        const {tile, map} = await this.startOpenLayers(this.mapId)
        this.tile = tile
        this.createMapControls((id: string, value: number) => tile.updateStyleVariables({[id]:value}))
        map.on('pointermove', e => this.printPixel(e.pixel, tile, map))
        this.setUI()
        this.setTimeValue(new Date())
    }

    onUserDateChange(){
        this.currentDate = new Date(getInputValue('userDate'))
        this.updateSunPosition()
    }

    setTimeValue(date: Date){
        this.currentDate = date;
        (document.getElementById("userDate")! as HTMLInputElement).valueAsNumber = Math.round((this.currentDate.valueOf() - this.currentDate.getTimezoneOffset() * 60000) / 60000) * 60000;
        this.updateSunPosition()
    }

    updateSunPosition(){
        const coordinates = proj4(this.projection, "EPSG:4326").forward([ (this.extent[0]+this.extent[2])/2, (this.extent[1]+this.extent[3])/2 ])
        const sunPosition = getPosition(this.currentDate, coordinates[1], coordinates[0])
        const azimuthInput = document.getElementById("azimuthInput")! as HTMLInputElement
        azimuthInput.value = ((sunPosition.azimuth*180/Math.PI + 180 ) % 360).toString()
        azimuthInput.dispatchEvent(new Event("input"))
        const elevationInput = document.getElementById("elevationInput")! as HTMLInputElement
        elevationInput.value = (sunPosition.altitude*180/Math.PI).toString()
        elevationInput.dispatchEvent(new Event("input"))
    }

    toggleAnimation(){
        this.animated = !this.animated
        this.animate()
    }

    animate(step=80000){
        if(this.animated){
            setTimeout(
                () => {
                    this.setTimeValue(new Date(this.currentDate.getTime() + step))
                    this.animate(step)
                }, 
                100-parseInt(getInputValue('animationSpeed'))
            )
        }
    }

    printPixel(pixel: Pixel, tile: WebGLTileLayerCustom, map: OlMap){
        const canvas = document.getElementsByClassName("ol-layer")[0]
        const pixelData = tile.getData(pixel)
        if(canvas != undefined && pixelData != null){
            const coord = map.getCoordinateFromPixel(pixel)
            const pixData = pixelData as Uint8ClampedArray | Uint8Array | Float32Array
            document.getElementById("cursorPosition")!.innerHTML = `X: ${coord[0].toFixed(2)} <br> Y: ${coord[1].toFixed(2)} <br> Z: ${pixData[0].toFixed(2)}`
            // To print a more advanced debug in the console:
            /*const gl = canvas.getContext('webgl2')
            if(gl){
                const color = new Uint8Array(4)
                gl.readPixels(pixel[0], -pixel[1]+gl.drawingBufferHeight, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, color)
                console.log(`Pixel : ${pixel} | File data  : ${tile.getData(pixel)} | Pixel data : ${color}`)
            }*/
        }
    }

    async startOpenLayers(mapElementId: string){
        const shadingVariables = new Map<string, number>();
        Object.keys(this.sliders).forEach(sliderName => shadingVariables.set(sliderName, 0))


        const geoTiffSourceDSM = new GeoTIFF({
            normalize: false,
            interpolate: false,
            sources: [{url:this.maps.dsm}, {url:this.maps.occlusionDsm}, {url:this.maps.shadowMap}]
        });

        const geoTiffSourceDTM = new GeoTIFF({
            normalize: false,
            interpolate: false,
            sources: [{url:this.maps.dtm}, {url:this.maps.occlusionDtm}, {url:this.maps.shadowMap}]
        });

        const wmts = new WMTS(optionsFromCapabilities(new WMTSCapabilities().read(await fetch(this.maps.ortho.capabilitiesURL).then(r => r.text())), {
            layer: this.maps.ortho.layer,
            matrixSet: this.projection
        })!)

        this.sources = {
            DTM : geoTiffSourceDTM,
            DSM : geoTiffSourceDSM,
            Ortho : wmts
        }

        const tile = new WebGLTileLayerCustom({
                sources: [geoTiffSourceDSM, wmts],
                style: {
                    variables: shadingVariables,
                    color: [`(`+`${[
                        `multiHillshade`, 
                        `clamp(pow(occlusion(),u_var_occlusion_power)+1.0-u_var_occlusion, 0.0, 1.0)`, 
                        `clamp(blurredShadowMap()+1.0-u_var_shadow, 0.0, 1.0)
                    `].join('*')}`+`)`]
                },
                textures :{
                    nbDirAzimuth : 90,
                    nbDirElevation : 32,
                    nbValuesInBand : 6,
                    layout :  {
                        ortho : wmts,
                        data : [
                            // Packed = this band is packed by 2 in the file, should be packed by 4 in the texture
                            {bands:2, packed:false, type:"hillshadeOcclusion"},
                            {bands:4, packed:true,  type:"shadow"},
                            {bands:4, packed:true,  type:"shadow"},
                            {bands:4, packed:true,  type:"shadow"},
                            {bands:3, packed:true,  type:"shadow"},
                            {bands:1, packed:false, type:"alpha"},
                        ]
                    }
                },
            }
        )
        
        const wmtsSelect = document.createElement('select')
        const wmtsLayers = new WMTSCapabilities().read(await fetch(this.maps.ortho.capabilitiesURL).then(r => r.text()))
        wmtsLayers.Contents.Layer.forEach((l: { Identifier: string; Title: string }) => {
            const option = document.createElement("option")
            option.value = l.Identifier
            option.innerHTML = l.Title
            wmtsSelect.appendChild(option)
        })
        wmtsSelect.value = this.maps.ortho.layer
        document.getElementById("wmtsSelect")?.appendChild(wmtsSelect)
        
        const map = new OlMap({
            target: mapElementId,
            layers: [tile],
            view: new View({
                projection: new Projection({code: this.projection, units: "m"}),
                extent: this.extent,
                center: getCenter(this.extent),
                zoom: 1,
            })
        });

        wmtsSelect.addEventListener("change", async () => {
            const wmts = new WMTS(optionsFromCapabilities(new WMTSCapabilities().read(await fetch(this.maps.ortho.capabilitiesURL).then(r => r.text())), {
                layer: wmtsSelect.value,
                matrixSet: this.projection
            })!)
            tile.setSources([this.currentModel == 'DSM' ? geoTiffSourceDSM : geoTiffSourceDTM, wmts])
            map.removeLayer(tile)
            map.addLayer(tile)
            this.sources!.Ortho = wmts
        })

        return {tile, map}
    }

    setModel(type : string){
        if(type == "DTM"){
            this.currentModel = 'DTM'
            this.tile?.setSources([this.sources?.DTM!, this.sources?.Ortho!]);
            (document.getElementById("shadowInput") as HTMLInputElement).value = "0"
            document.getElementById("shadowInput")?.dispatchEvent(new InputEvent("input"))
        }else if(type == "DSM"){
            this.currentModel = 'DSM'
            this.tile?.setSources([this.sources?.DSM!, this.sources?.Ortho!])
        }else{
            console.error("Invalid model")
        }
    }

    createMapControls(callback: (id: string, value: number) => void){
        Object.keys(this.sliders.inputs).forEach(id => {
            const values = this.sliders.inputs[id]
            this.createSlider(document.getElementById("mapControls")!, id, values[0], values[1], values[2],  callback, values[3])
        })
    }

    createSlider(container:HTMLElement, id: string, labelText: string, min:number, max:number, callback: (id: string, value: number) => void, unit="", step=0.01){
        const containerDiv = document.createElement('div')
        containerDiv.id = id

        const label = document.createElement('label')
        label.htmlFor = id+"Label"
        label.innerText = labelText

        const spanValue = document.createElement('span')
        spanValue.id = id+"Value"

        const spanUnit = document.createElement('span')
        spanUnit.id = id+"Unit"
        spanUnit.innerText = unit

        const input = document.createElement('input')
        input.id = id+"Input"
        input.type = "range"
        input.min = min.toString()
        input.max = max.toString()
        input.step = step.toString()
        input.addEventListener('input', ()=>{
            spanValue.innerText = input.value
            callback(id, parseFloat(input.value))
        })

        const spanDiv = document.createElement('div')
        spanDiv.appendChild(spanValue)
        spanDiv.appendChild(spanUnit)

        const inputSpan = document.createElement('div')
        inputSpan.appendChild(input)
        inputSpan.appendChild(spanDiv)

        containerDiv.appendChild(label)
        containerDiv.appendChild(inputSpan)
        container.appendChild(containerDiv)
    }

    setUI(mode: string | null = null){
        const defaultMode = Object.keys(this.sliders.modes)[0]
        mode = mode ?? defaultMode
        Object.keys(this.sliders.inputs).forEach(key => {
            if(key !='shadow' || this.currentModel != 'DTM'){
                const currentMode = Object.keys(this.sliders.modes[mode]).includes(key) ? mode : defaultMode
                const value = this.sliders.modes[currentMode][key].toString();
                (document.getElementById(key+"Input")! as HTMLInputElement).value = value
                document.getElementById(key+"Input")!.dispatchEvent(new Event("input"))
                document.getElementById(key+"Value")!.innerHTML = value
            }
          
        });
        (document.getElementById("modesSelect")! as HTMLInputElement).value = mode
    }
}