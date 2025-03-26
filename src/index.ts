import proj4 from "proj4"
import {register} from "ol/proj/proj4.js"

import ShadedOpenLayers, { Sliders } from "./ShadedOpenLayers.ts"
import config from "../config.json"

const sliders: Sliders = {
    inputs : {
         // ID              Name, Min, Max, Unit
        elevation       : ["Soleil - Elevation", 0, 90, '°'],
        azimuth         : ["Soleil - Azimuth", 0, 359.9, '°'],
        occlusion       : ["Occlusion", 0, 1.1, ''],
        occlusion_power : ["occlusion_power", 0, 5, ''],
        shadow          : ["Ombres portées", 0, 1, ''],
        shadow_dilation : ["shadow_dilation", 0, 3, ''],
        zFactor         : ["Exagération du terrain", 0, 15, 'x'],
        brightness      : ["Luminosité",  -0.75, 0.75, ''],
        exposure        : ["Exposition", 0, 1, ''],
        contrast        : ["Contraste", 0, 2, ''],
        gamma           : ["Gamma", 0, 10, ''],
        laplacian       : ["Contours", 0, 1, ''],
        laplacian_dilation : ["laplacian_dilation", 1, 3, ''],
        hillshade_dilation : ["hillshade_dilation", 0, 120, '°'],
        hillshade_color    : ["hillshade_color", 0, 1, ''],
        hillshade_color_power : ["hillshade_color_power", 0, 10, ''],
        slope           : ["slope", 0, 1, ''],
        ortho           : ["Couche WMTS", 0, 1, ""]
    },
    modes: config.modes
}

proj4.defs(config.projection.code, config.projection.def);
register(proj4);

const shadedOpenLayers = new ShadedOpenLayers({
    dsm :          config.data[2022].DSM.base,
    dtm :          config.data[2022].DTM.base,
    occlusionDsm : config.data[2022].DSM.ao,
    shadowMap :    config.data[2022].DSM.sm,
    occlusionDtm : config.data[2022].DTM.ao,
    ortho: {
        capabilitiesURL : config.WMTS.capabilities,
        layer : config.WMTS.defaultLayer
    }
}, config.projection.code, config.extent, sliders)

document.body.onload = () => {
    shadedOpenLayers.start()
    document.getElementById("userDate")!.onchange = () => shadedOpenLayers.onUserDateChange()
    document.getElementById("playStopButton")!.onclick = () => shadedOpenLayers.toggleAnimation()
    document.getElementById("resetButton")!.onclick = () => shadedOpenLayers.setUI()

    const select = document.getElementById("modesSelect") as HTMLSelectElement
    select.addEventListener("change", () => shadedOpenLayers.setUI(select.value))
    Object.keys(sliders.modes).forEach(k => {
        const option = document.createElement("option")
        option.value = k
        option.innerHTML = k
        select.appendChild(option)
    })

    Array.from(document.getElementsByClassName("modelRadio")).forEach( (r,i) => {
        const radio = r as HTMLInputElement
        if(i==0){
            radio.checked = true
        }
        radio.addEventListener('change', () => shadedOpenLayers.setModel(radio.value))
    })
}