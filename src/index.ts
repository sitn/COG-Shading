import ShadedOpenLayers, { Sliders } from "./ShadedOpenLayers.ts"
import proj4 from "proj4"
import {register} from "./ol/proj/proj4.js"

const sliders: Sliders = {
    inputs : {
         // ID              Name, Min, Max, Unit
        elevation       : ["Soleil - Elevation", 0, 90, '°'],
        azimuth         : ["Soleil - Azimuth", 0, 359.9, '°'],
        occlusion       : ["Occlusion", 0, 1.1, ''],
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
    },
    modes: {
        "Réaliste": {
            "elevation"  : 45,
            "azimuth"    : 45,
            "occlusion"  : 0.9,
            "shadow"           : 0.5, 
            "shadow_dilation"  : 1,  
            "zFactor"    : 1, 
            "brightness" : 0, 
            "exposure"   : 0,  
            "contrast"   : 1,  
            "gamma"      : 1,  
            "laplacian"  : 0,
            "laplacian_dilation" : 1,
            "hillshade_dilation" : 0,
            "hillshade_color"    : 0,
            "hillshade_color_power" : 1,
            "slope" : 0
        },
        "Archéologie 1": {
            "elevation"  : 15,
            "azimuth"    : 0,
            "shadow"     : 0, 
            "zFactor"    : 10, 
            "brightness" : 0.15, 
            "contrast"   : 1.1,  
            "hillshade_dilation" : 0.75
        },
        "Archéologie 2": {
            "elevation" : 30,
            "azimuth"   : 0,
            "shadow"    : 0, 
            "zFactor"   : 4,
            "exposure"  : 0.7,  
            "contrast"  : 0.5,  
            "gamma"     : 0.65,  
            "hillshade_dilation" : 0.6
        },
        "Multidirectional hillshade":{
            "occlusion" : 0.1,
            "shadow" : 0,
            "hillshade_dilation" : 45,
            "hillshade_color" : 1,
            "hillshade_color_power" : 2
        },
        "Laplacian of Gaussians":{
            "shadow"    : 0.4, 
            "contrast"  : 1.7,  
            "zFactor"   : 3, 
            "laplacian" : 0.4,
            "laplacian_dilation" : 2,
        },
        "Contours":{
            "contrast"  : 2, 
            "gamma"     : 0.75,
            "laplacian" : 1,
        },
        "Pente":{
            "contrast"  : 1.2, 
            "occlusion" : 0,
            "shadow"    : 0,
            "slope"     : 0.6
        }
    }
}

const extent = [2485250,1109500, 2513250,1136000] //SITG
//const extent = [2523181.8,1223806 , 2523789.8,1224236.6]//[2523181.8, 1181909.8, 2573700, 1224236.6] //SITN
const projection = "EPSG:2056"
proj4.defs(projection, "+proj=somerc +lat_0=46.95240555555556 +lon_0=7.439583333333333 +k_0=1 +x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs");
register(proj4);

const shadedOpenLayers = new ShadedOpenLayers({
    dem : 'https://sitn.ne.ch/services/cog/shading/sitg/mns2023_10cm_sitg_cog.tif',
    occlusion : 'https://sitn.ne.ch/services/cog/shading/sitg/ao_mns2023_10cm_sitg_highres_cog.tif',
    shadowMap : 'https://sitn.ne.ch/services/cog/shading/sitg/sm_mns2023_10cm_sitg_cog.tif',
    /*dem : 'http://localhost:8081/mns2022_small_cog_deflate_512.tif',
    occlusion : 'http://localhost:8081/ao_mns2022_small_cog_deflate_512.tif',
    shadowMap : 'http://localhost:8081/sm_mns2022_small_cog_deflate_512.tif',*/
}, projection, extent, sliders)

document.body.onload = () => {
    shadedOpenLayers.start()
    document.getElementById("userDate")!.onchange = () => shadedOpenLayers.onUserDateChange()
    document.getElementById("playStopButton")!.onclick = () => shadedOpenLayers.toggleAnimation()

    const select = document.getElementById("modesSelect") as HTMLSelectElement
    select.addEventListener("change", () => shadedOpenLayers.setUI(select.value))
    Object.keys(sliders.modes).forEach(k => {
        const option = document.createElement("option")
        option.value = k
        option.innerHTML = k
        select.appendChild(option)
    })
}