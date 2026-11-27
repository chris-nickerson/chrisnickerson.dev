import { stormOpening } from "./atmosphere";

/** Clouds stay linear and premultiplied until this one display transform.
 * Four depth-aware taps reject low-resolution cloud samples across silhouettes.
 */
export const compositeFragment = `
uniform float uNight,uTime;
uniform vec3 uSun;
${stormOpening}
uniform sampler2D uImage,uClouds,uDepth;
uniform vec2 uCloudSize,uNearFar;
uniform mat4 uProjectionInverse,uCameraWorld;
uniform vec3 uCamera;
varying vec2 vUv;varying vec3 vRay;
float viewDepth(float d){return uNearFar.x*uNearFar.y/(uNearFar.y-d*(uNearFar.y-uNearFar.x));}
void main(){
 float depth=texture2D(uDepth,vUv).r;
 vec3 c=texture2D(uImage,vUv).rgb;
 vec3 delta=vRay*viewDepth(depth);float distanceTo=length(delta);
 // Analytic integral through a height-dependent atmosphere. Stable for horizontal rays.
 float h=clamp(delta.y/520.,-24.,24.);
 float integral=abs(h)<.01?1.-h*.5:(1.-exp(-h))/h;
 float optical=distanceTo*.000095*exp(-max(0.,uCamera.y)/520.)*integral;
 vec3 ray=normalize(delta);
 float sunward=max(dot(ray,uSun),0.);
 vec3 haze=mix(vec3(.16,.26,.37),vec3(.55,.45,.38),pow(sunward,11.));
 if(depth<1.) {
   float range=min(distanceTo,7800.);
   float shafts=0.;
   for (int i=0; i<4; i++) {
     vec3 samplePoint=uCamera+ray*(range*((float(i)+.5)/4.));
     float mist=exp(-max(samplePoint.y,0.)/400.);
     shafts+=sunlightAt(samplePoint,uSun,uTime)*mist;
   }
   float air=1.-exp(-min(optical,1.8));
   c=mix(c,haze,air);
   float scattered=(1.-exp(-shafts*.25*range*.00015))*(.18+.82*pow(sunward,5.));
   c+=vec3(.57,.36,.19)*scattered*(1.-uNight);
 }
 vec4 clouds=texture2D(uClouds,vUv);
 if(clouds.a>.001){
 vec2 pixel=vUv*uCloudSize-.5,base=floor(pixel),f=fract(pixel);
 clouds=vec4(0.);float total=0.;
 for(int y=0;y<2;y++)for(int x=0;x<2;x++){
   vec2 offset=vec2(float(x),float(y));vec2 uv=(base+offset+.5)/uCloudSize;
   float nearby=texture2D(uDepth,uv).r;
   float weight=(x==0?1.-f.x:f.x)*(y==0?1.-f.y:f.y);
   weight*=exp(-abs(viewDepth(nearby)-viewDepth(depth))/max(1.,viewDepth(depth)*.015));
   clouds+=texture2D(uClouds,uv)*weight;total+=weight;
 }
 clouds/=max(total,.00001);
 }
 if (uNight>.5) {
   float cloudLight=dot(clouds.rgb,vec3(.21,.72,.07));
   clouds.rgb=cloudLight*vec3(.35,.46,.66);
 }
 c=c*(1.-clouds.a)+clouds.rgb;
 if(uNight>.5){
   float luminance=dot(c,vec3(.21,.72,.07));
   float warmth=smoothstep(.035,.25,c.r-c.b)*smoothstep(.01,.15,c.r-c.g);
   vec3 moonlit=mix(c,vec3(luminance),.13)*vec3(.12,.17,.27);
   c=moonlit+vec3(.028,.044,.071)*sqrt(max(luminance,0.))
       +warmth*c*vec3(.83,.60,.31);
 }
 gl_FragColor=vec4(c,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;
