import { stormOpening } from "./atmosphere";

export const noiseGLSL = `
float hash21(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123); }
float noise2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),f.x),f.y);}
float fbm2(vec2 p){float n=0.,a=.5;for(int i=0;i<5;i++){n+=noise2(p)*a;p=p*2.03+vec2(13.4,7.9);a*=.5;}return n;}
`;

const nightSky = `
float starHash(vec2 cell) {
  vec3 p=fract(cell.xyx*vec3(.1031,.1030,.0973));
  p+=dot(p,p.yzx+33.33);
  return fract((p.x+p.y)*p.z);
}
float curtainNoise(float x) {
  float i=floor(x), f=fract(x);
  return mix(starHash(vec2(i,19.)),starHash(vec2(i+1.,19.)),f*f*(3.-2.*f));
}
vec3 nightRadiance(vec3 d, float time, vec3 cloud, float ready) {
  float az=atan(d.x,-d.z), el=asin(clamp(d.y,-1.,1.));
  float cloudValue=dot(cloud,vec3(.21,.72,.07));
  float opening=mix(.87,1.-.75*smoothstep(.05,.58,cloudValue),ready);
  vec3 sky=mix(vec3(.058,.10,.14),vec3(.006,.011,.037),smoothstep(-.03,.48,el));
  sky+=vec3(.10,.125,.17)*sqrt(cloudValue)*ready;
  vec2 field=vec2(az,el)*135.;
  vec2 cell=floor(field);
  float seed=starHash(cell);
  vec2 offset=.17+.66*vec2(starHash(cell+12.),starHash(cell+43.));
  float size=mix(.05,.19,seed);
  float aa=max(.018,max(fwidth(field.x),fwidth(field.y))*.55);
  float star=1.-smoothstep(size-aa,size+aa,length(fract(field)-offset));
  sky+=vec3(.60,.78,.99)*star*smoothstep(.91,.985,seed)*opening*smoothstep(.015,.15,el);
  float drift=time*.008;
  float fold=az+.15*sin(az*4.2+drift);
  float hem=.19+.065*sin(fold*4.7-.55)+.035*sin(fold*11.1+drift*.35);
  float height=el-hem;
  float stream=fold + height*(.11+.12*sin(fold*7.)) + .023*sin(fold*9.-el*5.);
  float strands=.16+.50*curtainNoise(stream*86.+drift)+.34*curtainNoise(stream*247.-drift);
  float plume=.047+.12*curtainNoise(fold*9.+4.);
  float sheet=smoothstep(-.020,.013,height)*exp(-max(height,0.)/plume);
  float upperHem=.365+.065*sin(az*5.+.5+drift*.2);
  float second=el-upperHem;
  float veil=smoothstep(-.025,.016,second)*exp(-max(second,0.)/.058);
  float north=smoothstep(.10,.95,-d.z);
  vec3 airglow=mix(vec3(.075,1.65,.73),vec3(.67,.20,.65),smoothstep(.025,.14,height));
  sky+=(airglow*sheet+vec3(.17,.45,.40)*veil)*strands*north*opening;
  float radius=length(d-uMoon);
  float disc=1.-smoothstep(.0105,.0118,radius);
  float lit=smoothstep(-.009,.001,dot(d-uMoon,normalize(vec3(.74,.65,.14))));
  sky+=vec3(1.18,1.12,1.)*(disc*(.35+2.8*lit)+.24*exp(-radius*36.))*opening;
  return sky;
}
`;

export const skyVertex = `varying vec3 vWorld; void main(){vWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
export const skyFragment = `
varying vec3 vWorld;
uniform vec3 uSun, uMoon;
uniform sampler2D uCloudDeck;
uniform float uSkyReady, uTime, uNight;
${nightSky}
void main() {
 vec3 d = normalize(vWorld - cameraPosition);
 vec2 forward = normalize(uSun.xz);
 vec2 bearing = vec2(dot(d.xz, vec2(-forward.y, forward.x)), dot(d.xz, forward));
 float azimuth = atan(bearing.x, bearing.y) / 6.2831853;
 float elevation = asin(clamp(d.y, -1., 1.));
 float height = max(elevation, 0.);
 float v = clamp(.025 + .30 * height + .55 * height * height, .0, 1.);
 vec2 uv = vec2(.5 + azimuth + .0015*sin(uTime*.016), v);
 vec3 deck = texture2D(uCloudDeck, uv).rgb;
 vec3 col;
 if (uNight>.5) {
   col=nightRadiance(d,uTime,deck,uSkyReady);
 } else {
   float towardSun = max(dot(d, uSun), 0.);
   float rim = pow(towardSun, 18.);
   vec3 horizon = mix(vec3(.42,.49,.56), vec3(1.02,.58,.29), rim);
   vec3 fallback = mix(horizon, vec3(.071,.16,.25), smoothstep(.0, .7, d.y));
   col = mix(fallback, deck * 1.37 + vec3(.024,.034,.051), uSkyReady);
   col = mix(col, vec3(.14,.24,.32), smoothstep(.86,1.,d.y));
   float discDistance = length(d - uSun);
   float solarDisc = 1. - smoothstep(.007, .009, discDistance);
   col += vec3(1.,.68,.30) * (solarDisc*7. + 1.55*exp(-discDistance*65.) + .40*exp(-discDistance*15.) + .10*rim);
   col = mix(horizon, col, smoothstep(-.095,.018,d.y));
 }
 gl_FragColor=vec4(col,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;

/** Tilts a shading normal by the screen-space slope of a procedural height,
 * so relief needs neither tangents nor a height texture. */
export const slopeNormalGLSL = `
vec3 slopeNormal(vec3 normal, vec3 viewPosition, vec2 slope) {
  vec3 sx = dFdx(viewPosition), sy = dFdy(viewPosition);
  vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
  float det = dot(sx, r1);
  return normalize(abs(det)*normal - sign(det)*(slope.x*r1 + slope.y*r2));
}
`;
export const waterVertex = `
varying vec3 vWorld;
varying vec4 vReflect;
uniform mat4 uTextureMatrix;
#include <common>
#include <shadowmap_pars_vertex>
void main() {
  vec4 worldPosition = modelMatrix * vec4(position,1.);
  vWorld = worldPosition.xyz;
  vReflect = uTextureMatrix * worldPosition;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
  #include <beginnormal_vertex>
  #include <defaultnormal_vertex>
  #include <shadowmap_vertex>
}`;
export const waterFragment = `
varying vec3 vWorld;
varying vec4 vReflect;
uniform mat4 uTextureMatrix;
uniform sampler2D uLandscape, uReflection, uWaves;
uniform vec3 uSun, uMoon;
uniform vec2 uWindAxis;
uniform float uTime, uReflectReady, uWakeHeading, uNight;
uniform vec4 uWake;
#include <common>
#include <packing>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
${stormOpening}
${noiseGLSL}

void main() {
  vec2 p = vWorld.xz;
  vec2 wind = uWindAxis;
  vec2 crossWind = vec2(-wind.y, wind.x);
  vec2 q = vec2(dot(p, wind), dot(p, crossWind));
  vec4 land = texture2D(uLandscape, (p/15000. + .5)*(319./320.) + .5/320.);
  float depth = max(0., 60. - land.b * 180.);
  vec2 dx = dFdx(p), dy = dFdy(p);
  float footprint = max(length(dx), length(dy));

  vec2 drift = q - vec2(uTime*.72, 0.);
  float fetch = noise2(drift * vec2(.0028,.0041));
  float gust = noise2(drift * vec2(.008,.024) + fetch*2.8);
  float energy = mix(.22, 1., land.a) * mix(.43, 1., smoothstep(.22,.78,gust));
  vec2 warped = q + vec2(32.*fetch, 25.*gust + 14.*fetch);
  vec2 swell = texture2D(uWaves, (warped-vec2(2.3,.36)*uTime)/180.).rg - .5;
  vec2 chop = texture2D(uWaves, (warped+vec2(-1.47,.43)*uTime)/54.).ba - .5;
  vec2 ripple = texture2D(uWaves, (q+vec2(-.83,-.21)*uTime)/15.).rg - .5;
  vec2 slope = (.19*swell + .25*chop + .22*ripple) * energy;
  vec2 worldSlope = wind*slope.x + crossWind*slope.y;
  vec3 normal = normalize(vec3(-worldSlope.x, 1., -worldSlope.y));
  vec3 eye = cameraPosition-vWorld;
  float distanceToEye = length(eye);
  vec3 view = eye/distanceToEye;
  float facing = clamp(dot(normal,view),0.,1.);
  float fresnel = .026 + .94*pow(1.-facing,5.);

  vec2 uv = vReflect.xy/vReflect.w;
  vec3 bendRay = reflect(-view,normal) - reflect(-view,vec3(0.,1.,0.));
  vec4 bendClip = uTextureMatrix * vec4(bendRay,0.);
  vec2 offset = (bendClip.xy - uv*bendClip.w) /
                max(.25,vReflect.w/distanceToEye + bendClip.w);
  uv += offset * mix(.46,.86,smoothstep(2.,38.,depth));
  float rough = (.0025 + .022*smoothstep(.8,34.,footprint)) * energy;
  vec2 blur = vec2(rough*.72,rough);
  vec3 reflected = texture2D(uReflection,clamp(uv,.002,.998)).rgb*.4
    + texture2D(uReflection,clamp(uv + blur,.002,.998)).rgb*.2
    + texture2D(uReflection,clamp(uv + vec2(.49,-1.3)*blur,.002,.998)).rgb*.2
    + texture2D(uReflection,clamp(uv + vec2(-1.49,.3)*blur,.002,.998)).rgb*.2;

  float shelf = exp(-depth*.06);
  float illumination = getShadowMask();
  if (uNight < .5) illumination *= (1.-land.r)*(.28+.72*sunlightAt(vWorld,uSun,uTime));
  float silt = noise2(p*.0016 + fetch*1.25);
  vec3 basin = mix(vec3(.005,.046,.069),vec3(.014,.114,.118),silt);
  vec3 gravel = mix(vec3(.025,.22,.157),vec3(.125,.41,.25),fetch);
  vec3 base = mix(basin,gravel,shelf)*(mix(.51,1.,illumination));
  float bedLight = exp(-.20*depth/max(.48,view.y));
  float fold = 11.*(ripple.x + .27*chop.y);
  float caustic = exp(-fold*fold)*smoothstep(-.09,.23,ripple.y-.4*chop.x);
  base += vec3(.13,.20,.12)*caustic*bedLight*illumination*(1.-smoothstep(1.,4.,footprint));
  vec3 col = mix(base,reflected,fresnel*uReflectReady);
  float skyScatter = energy * (.12+.18*gust) * (1.-.4*fresnel);
  col = mix(col,vec3(.115,.25,.28)*mix(.53,1.,illumination),skyScatter);

  vec3 keyLight = uNight > .5 ? uMoon : uSun;
  vec3 halfV = normalize(view+keyLight);
  float spread = .0011 + .0032*energy + .004*smoothstep(.5,18.,footprint);
  float slopeError = (1.-max(0.,dot(halfV,normal)))/spread;
  vec3 glint = mix(vec3(2.12,1.67,1.02),vec3(.70,.89,1.12),uNight);
  col += glint*exp(-2.*slopeError)*illumination;

  #if NUM_SPOT_LIGHTS > 0
    vec3 eyePoint = (viewMatrix*vec4(vWorld,1.)).xyz;
    vec3 eyeNormal = mat3(viewMatrix)*normal;
    IncidentLight beam;
    #pragma unroll_loop_start
    for (int i = 0; i < NUM_SPOT_LIGHTS; i++) {
      getSpotLightInfo(spotLights[i],eyePoint,beam);
      if (beam.visible) {
        float crest = max(0.,dot(eyeNormal,beam.direction));
        float sheen = pow(max(0.,dot(normalize(beam.direction-normalize(eyePoint)),eyeNormal)),26.);
        float facet = dot(eyeNormal - viewMatrix[1].xyz, beam.direction);
        float glitter = smoothstep(-.018, .014, facet);
        vec3 light = beam.color / (1. + .07*max(max(beam.color.r,beam.color.g),beam.color.b));
        col += light * (vec3(.23,.18,.13)*crest*(.28+.72*glitter) + .18*sheen);
      }
    }
    #pragma unroll_loop_end
  #endif

  vec2 delta = p-uWake.xy;
  float cs = cos(uWakeHeading), sn = sin(uWakeHeading);
  vec2 wake = vec2(dot(delta,vec2(cs,sn)),dot(delta,vec2(-sn,cs)));
  float behind = smoothstep(0.,8.,wake.y)*(1.-smoothstep(18.,110.,wake.y));
  float wakeLine = exp(-abs(abs(wake.x)-wake.y*.34)*.55);
  float wakeFoam = (.3+.7*pow(.5+.5*sin(wake.y*.83+sin(wake.y*.19)*1.7-uTime*4.),2.))
                 * (.65+.35*sin(wake.x*.8+uTime));
  col += vec3(.22,.29,.27)*wakeLine*behind*wakeFoam*uWake.w*smoothstep(.35,12.,uWake.z);

  col = mix(col,vec3(.30,.46,.57),1.-exp(-distanceToEye*.000035));
  gl_FragColor=vec4(col,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
