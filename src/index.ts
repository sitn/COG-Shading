import ShadedOpenLayers, { Sliders } from "./ShadedOpenLayers.ts"

import proj4 from "proj4"
import {register} from "./ol/proj/proj4.js"

const sliders: Sliders = {
    inputs : {
         // ID       Name, Min, Max, Unit
        elevation  : ["Soleil - Elevation", 0, 90, '°'],
        azimuth    : ["Soleil - Azimuth", 0, 359.9, '°'],
        occlusion  : ["Occlusion", 0, 1.1, ''],
        shadow     : ["Ombres portées", 0, 1, ''],
        zFactor    : ["Exaggeration du terrain", 0, 7, 'x'],
        brightness : ["Luminosité",  -0.75, 0.75, ''],
        exposure   : ["Exposition", 0, 1, ''],
        contrast   : ["Contraste", 0, 2, ''],
        gamma      : ["Gamma", 0, 10, ''],
        dilation   : ["dilation", 0, 3, ''],
    },
    values: {
        default: {
            "elevation"  : 45,
            "azimuth"    : 45,
            "occlusion"  : 0.9,
            "shadow"     : 0.5, 
            "zFactor"    : 1, 
            "brightness" : 0, 
            "exposure"   : 0,  
            "contrast"   : 1,  
            "gamma"      : 1,  
            "dilation"   : 1,  
        },
        archeo: {
            "elevation"  : 35,
            "azimuth"    : 0,
            "occlusion"  : 0.5,
            "shadow"     : 0, 
            "zFactor"    : 6, 
            "brightness" : 0, 
            "exposure"   : 0.5,  
            "contrast"   : 0.4,  
            "gamma"      : 0.57,  
            "dilation"   : 1,  
        }
    }
}

const extent = [2485250,1109500, 2513250,1136000]
const projection = "EPSG:2056"
proj4.defs(projection, "+proj=somerc +lat_0=46.95240555555556 +lon_0=7.439583333333333 +k_0=1 +x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs");
register(proj4);

const shadedOpenLayers = new ShadedOpenLayers({
    dem : 'https://sitn.ne.ch/services/cog/shading/sitg/mns2023_10cm_sitg_cog.tif',
    occlusion : 'https://sitn.ne.ch/services/cog/shading/sitg/ao_mns2023_10cm_sitg_highres_cog.tif',
    shadowMap : 'https://sitn.ne.ch/services/cog/shading/sitg/sm_mns2023_10cm_sitg_cog.tif',
}, projection, extent, sliders)

document.body.onload = () => {
    shadedOpenLayers.start()
    document.getElementById("userDate")!.onchange = () => shadedOpenLayers.onUserDateChange()
    document.getElementById("playStopButton")!.onclick = () => shadedOpenLayers.toggleAnimation()
    document.getElementById("reset")!.onclick = () => shadedOpenLayers.setUI("default")
    document.getElementById("archeo")!.onclick = () => shadedOpenLayers.setUI("archeo")
}