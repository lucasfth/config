// Adapter-to-worker consistency on one fixture frame; NOT Resolve acceptance.
#include "../configs/davinci-resolve/native/transport.hpp"
#include "ofxImageEffect.h"
#include "ofxParam.h"
#include "ofxProperty.h"
#include "ofxMessage.h"
#include <dlfcn.h>
#include <cstdarg>
#include <fstream>
#include <iostream>
#include <map>
#include <variant>

namespace test {
using Value=std::variant<int,double,void *,std::string>;
struct Properties {std::map<std::string,std::vector<Value>> values;};
struct Parameter {Properties properties;};
struct Effect {Properties properties;std::map<std::string,Properties> clips;std::map<std::string,Parameter> parameters;};
Properties inputImage,outputImage;
int acquired=0,released=0;
std::string lastError;
void check(OfxStatus status) {ck::require(status==kOfxStatOK,"OFX action failed");}
Properties &p(OfxPropertySetHandle h){return *reinterpret_cast<Properties *>(h);}
OfxPropertySetHandle h(Properties &p){return reinterpret_cast<OfxPropertySetHandle>(&p);}
template<class T> OfxStatus set(OfxPropertySetHandle handle,const char *key,int i,T value){
 if(!handle||i<0)return kOfxStatErrBadHandle;
 auto &v=p(handle).values[key];if(v.size()<=static_cast<size_t>(i))v.resize(i+1);
 v[i]=value;return kOfxStatOK;
}
template<class T> OfxStatus get(OfxPropertySetHandle handle,const char *key,int i,T *value){
 if(!handle||i<0)return kOfxStatErrBadHandle;
 auto f=p(handle).values.find(key);if(f==p(handle).values.end()||f->second.size()<=static_cast<size_t>(i))return kOfxStatErrUnknown;
 auto *v=std::get_if<T>(&f->second[i]);if(!v)return kOfxStatErrValue;*value=*v;return kOfxStatOK;
}
OfxStatus setString(OfxPropertySetHandle p,const char *k,int i,const char *v){
 // Resolve 21.1.1 rejects this optional effect-description property (status 3).
 if(!strcmp(k,kOfxPropPluginDescription))return kOfxStatErrUnsupported;
 return set(p,k,i,std::string(v));
}
OfxStatus getString(OfxPropertySetHandle handle,const char *k,int i,char **v){
 std::string value;auto status=get(handle,k,i,&value);if(status)return status;
 *v=std::get<std::string>(p(handle).values[k][i]).data();return kOfxStatOK;
}
template<class T> OfxStatus getN(OfxPropertySetHandle p,const char *k,int n,T *v){for(int i=0;i<n;++i){auto s=get(p,k,i,v+i);if(s)return s;}return kOfxStatOK;}
OfxStatus effectProps(OfxImageEffectHandle e,OfxPropertySetHandle *out){*out=h(reinterpret_cast<Effect *>(e)->properties);return kOfxStatOK;}
OfxStatus paramSet(OfxImageEffectHandle e,OfxParamSetHandle *out){*out=reinterpret_cast<OfxParamSetHandle>(e);return kOfxStatOK;}
OfxStatus defineClip(OfxImageEffectHandle e,const char *name,OfxPropertySetHandle *out){*out=h(reinterpret_cast<Effect *>(e)->clips[name]);return kOfxStatOK;}
OfxStatus clipHandle(OfxImageEffectHandle e,const char *name,OfxImageClipHandle *out,OfxPropertySetHandle *){*out=reinterpret_cast<OfxImageClipHandle>(&reinterpret_cast<Effect *>(e)->clips.at(name));return kOfxStatOK;}
Properties *sourceClip=nullptr;
OfxStatus image(OfxImageClipHandle clip,double,const OfxRectD *,OfxPropertySetHandle *out){++acquired;*out=h(reinterpret_cast<Properties *>(clip)==sourceClip?inputImage:outputImage);return kOfxStatOK;}
OfxStatus release(OfxPropertySetHandle){++released;return kOfxStatOK;}
int abort(OfxImageEffectHandle){return 0;}
OfxStatus defineParam(OfxParamSetHandle s,const char *,const char *name,OfxPropertySetHandle *out){*out=h(reinterpret_cast<Effect *>(s)->parameters[name].properties);return kOfxStatOK;}
OfxStatus paramHandle(OfxParamSetHandle s,const char *name,OfxParamHandle *out,OfxPropertySetHandle *){*out=reinterpret_cast<OfxParamHandle>(&reinterpret_cast<Effect *>(s)->parameters.at(name));return kOfxStatOK;}
OfxStatus valueAtTime(OfxParamHandle handle,double time,...){
 (void)time;va_list args;va_start(args,time);
 auto &v=reinterpret_cast<Parameter *>(handle)->properties.values.at(kOfxParamPropDefault)[0];
 if(auto *d=std::get_if<double>(&v))*va_arg(args,double *)=*d;else *va_arg(args,int *)=std::get<int>(v);
 va_end(args);return kOfxStatOK;
}
OfxStatus message(void *,const char *,const char *,const char *format,...){char text[4096];va_list args;va_start(args,format);vsnprintf(text,sizeof(text),format,args);va_end(args);lastError=text;return kOfxStatOK;}
OfxStatus clear(void *){lastError.clear();return kOfxStatOK;}
OfxPropertySuiteV1 properties{};OfxImageEffectSuiteV1 effects{};OfxParameterSuiteV1 parameters{};OfxMessageSuiteV2 messages{};
const void *fetch(OfxPropertySetHandle,const char *name,int version){
 if(!strcmp(name,kOfxPropertySuite)&&version==1)return &properties;
 if(!strcmp(name,kOfxImageEffectSuite)&&version==1)return &effects;
 if(!strcmp(name,kOfxParameterSuite)&&version==1)return &parameters;
 if(!strcmp(name,kOfxMessageSuite)&&version==2)return &messages;
 return nullptr;
}
void init(){
 properties.propSetInt=set<int>;properties.propSetDouble=set<double>;properties.propSetPointer=set<void *>;properties.propSetString=setString;
 properties.propGetInt=get<int>;properties.propGetDouble=get<double>;properties.propGetPointer=get<void *>;properties.propGetString=getString;
 properties.propGetIntN=getN<int>;properties.propGetDoubleN=getN<double>;
 effects.getPropertySet=effectProps;effects.getParamSet=paramSet;effects.clipDefine=defineClip;effects.clipGetHandle=clipHandle;
 effects.clipGetImage=image;effects.clipReleaseImage=release;effects.abort=abort;
 parameters.paramDefine=defineParam;parameters.paramGetHandle=paramHandle;parameters.paramGetValueAtTime=valueAtTime;
 messages.setPersistentMessage=message;messages.clearPersistentMessage=clear;
}
void configure(Properties &image,float *data,bool negative){
 set(h(image),kOfxImagePropData,0,static_cast<void *>(data));
 setString(h(image),kOfxImageEffectPropPixelDepth,0,kOfxBitDepthFloat);setString(h(image),kOfxImageEffectPropComponents,0,kOfxImageComponentRGBA);
 for(int i=0;i<4;++i)set(h(image),kOfxImagePropBounds,i,(int[]){0,0,1280,720}[i]);
 set(h(image),kOfxImagePropRowBytes,0,(negative?-1:1)*1280*16);set(h(image),kOfxImagePropPixelAspectRatio,0,1.);
}
}
int main(int argc,char **argv){
 using namespace test;
 try{
 ck::require(argc==5,"Usage: host input.f32 batch-reference.f32 positive|negative plugin.ofx");init();
 void *library=dlopen(argv[4],RTLD_NOW|RTLD_LOCAL);ck::require(library,"Cannot load OFX bundle binary");
 auto getPlugin=reinterpret_cast<OfxPlugin *(*)(int)>(dlsym(library,"OfxGetPlugin"));
 auto countPlugins=reinterpret_cast<int (*)()>(dlsym(library,"OfxGetNumberOfPlugins"));
 ck::require(getPlugin&&countPlugins,"Missing OFX exports");
 std::vector<float> src(1280*720*4),dst(src.size(),-1),expected(src.size());
 ck::require(bool(std::ifstream(argv[1],std::ios::binary).read(reinterpret_cast<char *>(src.data()),ck::bytes)),"Truncated input fixture");
 ck::require(bool(std::ifstream(argv[2],std::ios::binary).read(reinterpret_cast<char *>(expected.data()),ck::bytes)),"Truncated batch reference");
 bool negative=std::string(argv[3])=="negative";
 // Input fixture files are top-down. Positive OFX rows are bottom-up.
 if(!negative)for(int y=0;y<360;++y)for(int x=0;x<1280*4;++x)std::swap(src[y*1280*4+x],src[(719-y)*1280*4+x]);
 configure(inputImage,negative?src.data()+719*1280*4:src.data(),negative);
 configure(outputImage,negative?dst.data()+719*1280*4:dst.data(),negative);
 Effect effect;auto e=reinterpret_cast<OfxImageEffectHandle>(&effect);OfxHost host{nullptr,fetch};auto *plugin=getPlugin(0);plugin->setHost(&host);
 ck::require(countPlugins()==1&&getPlugin(1)==nullptr,"Invalid exports");
 auto call=[&](const char *a,OfxPropertySetHandle in=nullptr,OfxPropertySetHandle out=nullptr){return plugin->mainEntry(a,e,in,out);};
 check(call(kOfxActionLoad));check(call(kOfxActionDescribe));check(call(kOfxImageEffectActionDescribeInContext));
 sourceClip=&effect.clips.at(kOfxImageEffectSimpleSourceClipName);
 check(call(kOfxActionCreateInstance));
 Properties args,prefs;set(h(args),kOfxPropTime,0,0.);
 set(h(args),kOfxImageEffectPropRenderScale,0,1.);set(h(args),kOfxImageEffectPropRenderScale,1,1.);
 for(int i=0;i<4;++i)set(h(args),kOfxImageEffectPropRenderWindow,i,(int[]){0,0,1280,720}[i]);
 check(call(kOfxImageEffectActionGetClipPreferences,nullptr,h(prefs)));
 ck::require(std::get<std::string>(prefs.values[kOfxImageEffectPropPreMultiplication][0])==kOfxImagePreMultiplied,"Wrong alpha contract");
 for(int repeat=0;repeat<2;++repeat){
  check(call(kOfxImageEffectActionRender,h(args)));
  float worst=0;
  for(int y=0;y<720;++y)for(int x=0;x<1280*4;++x)worst=std::max(worst,std::abs(dst[(negative?y:719-y)*1280*4+x]-expected[y*1280*4+x]));
  ck::require(worst<.0001,"Host render pixels do not match reference");
 }
 set(h(args),kOfxImageEffectPropRenderScale,0,.5);
 ck::require(call(kOfxImageEffectActionRender,h(args))==kOfxStatFailed,"Scaled render must fail");
 ck::require(lastError.find("full-resolution")!=std::string::npos,"Missing scaled-render message");
 set(h(args),kOfxImageEffectPropRenderScale,0,1.);set(h(inputImage),kOfxImagePropBounds,2,640);
 ck::require(call(kOfxImageEffectActionRender,h(args))==kOfxStatFailed,"Wrong dimensions must fail");
 ck::require(lastError.find("1280x720")!=std::string::npos,"Missing dimensions error message");
 ck::require(acquired==released,"Host image handles leaked");
 check(call(kOfxActionDestroyInstance));check(call(kOfxActionUnload));
 dlclose(library);
 std::cout<<"OFX_HOST_RENDER=PASS stride="<<argv[3]<<" released="<<released<<"\n";
 }catch(const std::exception &e){std::cerr<<e.what()<<"\n";return 1;}
}
