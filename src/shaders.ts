export const noiseGLSL = `
float hash21(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123); }
float noise2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),f.x),f.y);}
float fbm2(vec2 p){float n=0.,a=.5;for(int i=0;i<5;i++){n+=noise2(p)*a;p=p*2.03+vec2(13.4,7.9);a*=.5;}return n;}
`;
export const skyVertex = `varying vec3 vWorld; void main(){vWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
export const skyFragment = `
varying vec3 vWorld;uniform float uTime;uniform vec3 uSun;
${noiseGLSL}
void main(){
 vec3 d=normalize(vWorld-cameraPosition);float y=max(d.y,0.);
 vec3 horizon=vec3(.52,.67,.77),zenith=vec3(.035,.16,.32);
 vec3 col=mix(horizon,zenith,pow(y,.5));
 float sun=pow(max(dot(d,uSun),0.),1100.);float glow=pow(max(dot(d,uSun),0.),8.);
 col+=vec3(1.,.72,.38)*sun*4.+vec3(.38,.20,.075)*glow;
 vec2 uv=d.xz/(max(d.y,.035))*.6+vec2(uTime*.0013,0.);
 float cloud=fbm2(uv*.8+4.);float wisps=fbm2(uv*2.7+vec2(0.,uTime*.002));
 float c=smoothstep(.44,.72,cloud*.8+wisps*.25)*smoothstep(.01,.15,d.y);
 col=mix(col,vec3(.8,.86,.9),c*.48);
 col=mix(vec3(.43,.58,.69),col,smoothstep(-.12,.035,d.y));
 gl_FragColor=vec4(col,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;
export const waterVertex = `
varying vec3 vWorld;varying vec4 vReflect;uniform mat4 uTextureMatrix;
void main(){vec4 world=modelMatrix*vec4(position,1.);vWorld=world.xyz;vReflect=uTextureMatrix*world;gl_Position=projectionMatrix*viewMatrix*world;}`;
export const waterFragment = `
varying vec3 vWorld;varying vec4 vReflect;uniform float uTime;uniform sampler2D uLandscape;uniform sampler2D uReflection;uniform vec3 uSun;uniform float uReflectReady;uniform vec4 uWake;uniform float uWakeHeading;uniform vec2 uWindAxis;
${noiseGLSL}
void main(){
 vec2 p=vWorld.xz;
 // Analytic, band-limited wave slopes. Subpixel ripples become roughness
 // instead of unstable stripes, while long swells preserve the reflected vista.
 vec2 dx=dFdx(p),dy=dFdy(p);float footprint=max(length(dx),length(dy));
 vec2 slope=vec2(0.);
 float gust=noise2(p*.008+vec2(uTime*.003,0.))*9.;
 slope+=vec2(.84,.54)*cos(dot(p,vec2(.84,.54))*.065+uTime*.75+gust)*.013*exp(-footprint*footprint*.001);
 slope+=vec2(-.33,.94)*sin(dot(p,vec2(-.33,.94))*.11-uTime*.9+gust*.63)*.01*exp(-footprint*footprint*.003);
 slope+=vec2(.94,.34)*sin(dot(p,vec2(.94,.34))*.48+uTime*1.9+gust*.37)*.034*exp(-footprint*footprint*.10);
 slope+=vec2(-.62,.78)*cos(dot(p,vec2(-.62,.78))*1.13-uTime*2.6+gust)*.022*exp(-footprint*footprint*.55);
 vec4 land=texture2D(uLandscape,(p/15000.+.5)*(319./320.)+.5/320.);
 float exposed=land.a;
 vec2 windUV=vec2(dot(p,uWindAxis),dot(p,vec2(-uWindAxis.y,uWindAxis.x)));
 vec2 fetchUV=windUV*vec2(.007,.025)+vec2(-uTime*.033,gust*.10);
 float lanes=mix(noise2(fetchUV),.5,smoothstep(14.,45.,footprint));
 slope*=mix(.12,2.4,exposed);
 slope+=uWindAxis*cos(windUV.x*.24-uTime*1.8+gust)*.046*exposed*exp(-footprint*footprint*.04);
 vec3 normal=normalize(vec3(-slope.x,1.,-slope.y));
 vec3 view=normalize(cameraPosition-vWorld);float fresnel=.025+.955*pow(1.-max(dot(view,normal),0.),5.);
 vec2 uv=vReflect.xy/vReflect.w+normal.xz*.026;
 vec2 blur=vec2(.0014,.0035)*exposed*(.6+lanes);
 vec3 reflected=.5*texture2D(uReflection,clamp(uv,.002,.998)).rgb
   +.25*texture2D(uReflection,clamp(uv+blur,.002,.998)).rgb
   +.25*texture2D(uReflection,clamp(uv-blur,.002,.998)).rgb;

 float bed=land.b*180.-60.;float shallow=1.-smoothstep(3.,40.,-bed);
 vec3 base=mix(vec3(.007,.055,.075),vec3(.026,.23,.18),shallow);
 base*=.93+noise2(p*.04)*.07;
 float caustic=pow(max(0.,sin(p.x*.18+sin(p.y*.14+uTime*.7)*2.)*sin(p.y*.16-uTime*.5)),6.);
 const float meanSinSixth=5./16.;
 const float causticMean=.5*meanSinSixth*meanSinSixth;
 caustic=mix(caustic,causticMean,smoothstep(1.,6.,footprint));
 base+=vec3(.08,.14,.08)*caustic*shallow;
 base*=1.-land.r*.35;
 vec3 col=mix(base,reflected,fresnel*uReflectReady);
 // Unresolved capillaries scatter sky light in long bands of wind on open water.
 col=mix(col,vec3(.19,.35,.40),exposed*(.17+.40*smoothstep(.25,.78,lanes)));
 vec3 halfV=normalize(view+uSun);float spec=pow(max(dot(normal,halfV),0.),mix(420.,100.,clamp(footprint/14.,0.,1.)));
 col+=vec3(1.,.81,.49)*spec*1.55;
 vec2 delta=vWorld.xz-uWake.xy;float cs=cos(uWakeHeading),sn=sin(uWakeHeading);vec2 wake=vec2(dot(delta,vec2(cs,sn)),dot(delta,vec2(-sn,cs)));float behind=smoothstep(0.,8.,wake.y)*(1.-smoothstep(18.,110.,wake.y));float wakeLine=exp(-abs(abs(wake.x)-wake.y*.34)*.55);float wakeFoam=(.3+.7*pow(.5+.5*sin(wake.y*.83+sin(wake.y*.19)*1.7-uTime*4.),2.))*(.65+.35*sin(wake.x*.8+uTime));col+=vec3(.22,.29,.27)*wakeLine*behind*wakeFoam*uWake.w*smoothstep(.35,12.,uWake.z);
 float dist=length(cameraPosition-vWorld);col=mix(col,vec3(.30,.46,.57),1.-exp(-dist*.000035));
 gl_FragColor=vec4(col,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;
