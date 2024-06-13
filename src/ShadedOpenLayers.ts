import WebGLTileLayerCustom from "./WebGLTileLayerCustom.ts"
import GeoTIFF from "./ol/source/GeoTIFF.js"
import OlMap from "./ol/Map.js"
import View from "./ol/View.js"
import Projection from "./ol/proj/Projection.js"
import { getCenter } from "./ol/extent.js"
import proj4 from "proj4"
import { getPosition } from "suncalc"
import { Pixel } from "./ol/pixel"

type Maps = { dem: string; occlusion: string; shadowMap: string }

type SliderParams = [string, number, number, number, string]

export type Sliders = { [key: string]: SliderParams }

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
    
    constructor(maps: Maps, projection: string, extent: number[], sliders: Sliders, mapId="map"){
        this.maps = maps
        this.mapId = mapId
        this.projection = projection
        this.extent = extent
        this.sliders = sliders
    }

    start(){
        const {tile, map} = this.startOpenLayers(this.mapId)
        this.createMapControls((id: string, value: number) => tile.updateStyleVariables({[id]:value}))
        map.on('pointermove', e => this.printPixel(e.pixel, tile, map))
        this.resetUI()
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
            const coordinates = map.getCoordinateFromPixel(pixel)
            const pixelDataBuffer = pixelData as Uint8ClampedArray | Uint8Array | Float32Array
            document.getElementById("cursorPosition")!.innerHTML = 
                `X: ${coordinates[0].toFixed(2)} <br> Y: ${coordinates[1].toFixed(2)} <br> Z: ${pixelDataBuffer[0].toFixed(2)}`
            // To print a more advanced debug in the console:
            /*const gl = canvas.getContext('webgl2')
            if(gl){
                const color = new Uint8Array(4)
                gl.readPixels(pixel[0], -pixel[1]+gl.drawingBufferHeight, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, color)
                console.log(`Pixel : ${pixel} | File data  : ${tile.getData(pixel)} | Pixel data : ${color}`)
            }*/
        }
    }

    startOpenLayers(mapElementId: string){
        const shadingVariables = new Map<string, number>();
        Object.keys(this.sliders).forEach(sliderName => shadingVariables.set(sliderName, 0))
    
        const source = new GeoTIFF({
            normalize: false,
            interpolate: false,
            sources: [{url:this.maps.dem}, {url:this.maps.occlusion}, {url:this.maps.shadowMap}]
        });
    
        const occlusionColor = this.colorStrength(`occlusion()`, 'u_var_occlusion')
        const shadowColor    = this.colorStrength(`blurredShadowMap()`, 'u_var_shadow')
        const tile = new WebGLTileLayerCustom({
                source: source,
                style: {
                    variables: shadingVariables,
                    color: [`clamp(pow(${[`hillshade()`, occlusionColor, shadowColor].join('*')}, 1.0-u_var_brightness), 0.0, 1.0)`]
                },
                textures :{
                    nbDirAzimuth : 90,
                    nbDirElevation : 32,
                    layout :  [   
                        {dataType:Uint32Array, bands:2, packed:false, type:"hillshadeOcclusion"},
                        {dataType:Uint32Array, bands:4, packed:true,  type:"shadow"},
                        {dataType:Uint32Array, bands:4, packed:true,  type:"shadow"},
                        {dataType:Uint32Array, bands:4, packed:true,  type:"shadow"},
                        {dataType:Uint32Array, bands:3, packed:true,  type:"shadow"},
                        {dataType:Uint32Array, bands:1, packed:false, type:"alpha"},
                    ],
                }
            }
        )
    
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
        return {tile, map}
    }

    colorStrength(color:string, variable:string){
        return `clamp( ${color} + 1.0-${variable}, 0.0, 1.0 )`
    }

    createMapControls(callback: (id: string, value: number) => void){
        Object.keys(this.sliders).forEach(id => {
            const values = this.sliders[id]
            this.createSlider(document.getElementById("mapControls")!, id, values[0], values[1], values[2],  callback, values[4])
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

    resetUI(){
        Object.keys(this.sliders).forEach(entry => {
            const value = this.sliders[entry][3].toString();
            (document.getElementById(entry+"Input")! as HTMLInputElement).value = value
            document.getElementById(entry+"Input")!.dispatchEvent(new Event("input"))
            document.getElementById(entry+"Value")!.innerHTML = value
        })
    }
}