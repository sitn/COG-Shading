import WebGLTileLayerCustom from "./WebGLTileLayerCustom.ts"
import GeoTIFF from "./ol/source/GeoTIFF.js"
import Map from "./ol/Map.js"
import View from "./ol/View.js"
import Projection from "./ol/proj/Projection.js"
import { getCenter } from "./ol/extent.js"
import proj4 from "proj4"
import { getPosition } from "suncalc"

export default class ShadedOpenLayers{
    constructor(maps, projection, extent, sliders, mapId="map"){
        this.maps = maps
        this.mapId = mapId
        this.projection = projection
        this.extent = extent
        this.sliders = sliders
        this.animationInterval = undefined
        this.currentDate = new Date()
    }

    start(){
        const {source, tile, map} = this.startOpenLayers(this.mapId)
        this.createMapControls((id, value) => tile.updateStyleVariables({[id]:value}))
        map.on('pointermove', e => this.printPixel(e.pixel, tile, map))
        this.resetUI()
        this.setTimeValue(new Date())
    }

    onUserDateChange(){
        this.currentDate = new Date(document.getElementById('userDate').value)
        this.updateSunPosition()
    }

    setTimeValue(date){
        this.currentDate = date
        document.getElementById("userDate").valueAsNumber = Math.round((this.currentDate.valueOf() - this.currentDate.getTimezoneOffset() * 60000) / 60000) * 60000;
        this.updateSunPosition()
    }

    updateSunPosition(){
        const coordinates = proj4(this.projection, "EPSG:4326").forward([ (this.extent[0]+this.extent[2])/2, (this.extent[1]+this.extent[3])/2 ])
        const sunPosition = getPosition(this.currentDate, coordinates[1], coordinates[0])
        const azimuthInput = document.getElementById("azimuthInput")
        azimuthInput.value = (sunPosition.azimuth*180/Math.PI + 180 ) % 360
        azimuthInput.dispatchEvent(new Event("input"))
        const elevationInput = document.getElementById("elevationInput")
        elevationInput.value = sunPosition.altitude*180/Math.PI
        elevationInput.dispatchEvent(new Event("input"))
    }

    toggleAnimation(step=80000){
        if(this.animationInterval != undefined ){
            clearInterval(this.animationInterval);
            this.animationInterval = undefined;
        }else{
            this.animationInterval = setInterval(
                () => this.setTimeValue(new Date(this.currentDate.getTime() + step)), 
                100-document.getElementById('animationSpeed').value
            )
        }
    }

    printPixel(pixel, tile, map){
        const canvas = document.getElementsByClassName("ol-layer")[0]
        const pixelData = tile.getData(pixel)
        if(canvas != undefined && pixelData != null){
            const coordinates = map.getCoordinateFromPixel(pixel)
            document.getElementById("cursorPosition").innerHTML = `X: ${coordinates[0].toFixed(2)} <br> Y: ${coordinates[1].toFixed(2)} <br> Z: ${pixelData[0].toFixed(2)}`
            // To print a more advanced debug in the console:
            /*const gl = canvas.getContext('webgl2')
            if(gl){
                const color = new Uint8Array(4)
                gl.readPixels(pixel[0], -pixel[1]+gl.drawingBufferHeight, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, color)
                console.log(`Pixel : ${pixel} | File data  : ${tile.getData(pixel)} | Pixel data : ${color}`)
            }*/
        }
    }

    startOpenLayers(mapElementId){
        const shadingVariables = {}
        Object.keys(this.sliders).forEach(sliderName => shadingVariables[sliderName] = 0)
    
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
    
        const map = new Map({
            target: mapElementId,
            layers: [tile],
            view: new View({
                projection: new Projection({code: this.projection, units: "m"}),
                extent: this.extent,
                center: getCenter(this.extent),
                zoom: 1,
            })
        });
        return {source, tile, map}
    }

    colorStrength(color, variable){
        return `clamp( ${color} + 1.0-${variable}, 0.0, 1.0 )`
    }

    createMapControls(callback){
        Object.keys(this.sliders).forEach(id => {
            const values = this.sliders[id]
            this.createSlider(document.getElementById("mapControls"), id, values[0], values[1], values[2],  callback, values[4])
        })
    }

    createSlider(container, id, labelText, min, max, callback, unit="", step=0.01){
        const containerDiv = document.createElement('div')
        containerDiv.id = id

        const label = document.createElement('label')
        label.for = id+"Label"
        label.innerText = labelText

        const spanValue = document.createElement('span')
        spanValue.id = id+"Value"

        const spanUnit = document.createElement('span')
        spanUnit.id = id+"Unit"
        spanUnit.innerText = unit

        const input = document.createElement('input')
        input.id = id+"Input"
        input.type = "range"
        input.min = min
        input.max = max
        input.step = step
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
            const value = this.sliders[entry][3]
            document.getElementById(entry+"Input")!.value = value
            document.getElementById(entry+"Input")!.dispatchEvent(new Event("input"))
            document.getElementById(entry+"Value")!.innerHTML = value
        })
    }
}