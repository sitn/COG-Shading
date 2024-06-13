import ShadedOpenLayers, { Sliders } from "./ShadedOpenLayers.ts"

import proj4 from "proj4"
import {register} from "./ol/proj/proj4.js"

const sliders: Sliders = {
    // ID           Name           Min  Max Default  Unit
    "elevation"  : ["Sun elevation", 0,    90,  45, '°'],
    "azimuth"    : ["Sun azimuth",   0, 359.9,  45, '°'],
    "occlusion"  : ["Occlusion",     0,   1.1, 0.9,  ''],
    "shadow"     : ["Shadow",        0,     1, 0.5,  ''],
    "zFactor"    : ["Terrain Exaggeration",  0,     5,   1, 'x'],
    "brightness" : ["Brightness",  -0.75,     0.75,   0,  ''],
    "exposure"   : ["Exposure",     -1,     1,   0,  ''],
    "contrast"   : ["Contrast",     -1,     1,   0,  ''],
    "gamma"      : ["Gamma",         0,    10,   1,  ''],
    "dilation"   : ["dilation",      0,     3,   1,  ''],
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
    document.getElementById("reset")!.onclick = () => shadedOpenLayers.resetUI()
}