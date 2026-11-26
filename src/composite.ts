/** Clouds stay linear and premultiplied until this one display transform.
 * Four depth-aware taps reject low-resolution cloud samples across silhouettes.
 */
export const compositeFragment = `
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
 vec3 ray=normalize(delta);float glow=pow(max(dot(ray,normalize(vec3(-.78,.38,-.36))),0.),8.);
 vec3 haze=mix(vec3(.24,.40,.51),vec3(.63,.57,.43),glow*.4);
 c=mix(c,haze,1.-exp(-min(optical,1.5)));
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
 c=c*(1.-clouds.a)+clouds.rgb;
 gl_FragColor=vec4(c,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;
