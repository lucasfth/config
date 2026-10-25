// Original CorridorKey 2.0 OpenFX adapter. OFX SDK headers: BSD-3-Clause.
#include "ofxImageEffect.h"
#include "ofxParam.h"
#include "ofxProperty.h"
#include "ofxMessage.h"
#include "transport.hpp"
#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <dlfcn.h>
#include <memory>
#include <mutex>

namespace {
OfxHost *host=nullptr;
const OfxImageEffectSuiteV1 *fx=nullptr;
const OfxPropertySuiteV1 *props=nullptr;
const OfxParameterSuiteV1 *params=nullptr;
const OfxMessageSuiteV2 *messages=nullptr;

void check(OfxStatus status) {ck::require(status==kOfxStatOK,"Resolve rejected an OFX property or image operation");}
OfxPropertySetHandle properties(OfxImageEffectHandle effect) {
 OfxPropertySetHandle p=nullptr; check(fx->getPropertySet(effect,&p));return p;
}
void propertyCheck(OfxStatus status,const char *key,int index) {
 if(status!=kOfxStatOK)throw std::runtime_error(std::string("OFX property rejected: ")+key+"["+std::to_string(index)+"] status="+std::to_string(status));
}
void text(OfxPropertySetHandle p,const char *key,const char *value,int index=0) {propertyCheck(props->propSetString(p,key,index,value),key,index);}
void integer(OfxPropertySetHandle p,const char *key,int value) {propertyCheck(props->propSetInt(p,key,0,value),key,0);}
int number(OfxPropertySetHandle p,const char *key,int index=0) {int v=0;check(props->propGetInt(p,key,index,&v));return v;}
std::string string(OfxPropertySetHandle p,const char *key) {char *v=nullptr;check(props->propGetString(p,key,0,&v));return v?v:"";}

struct Instance {
 OfxImageClipHandle source=nullptr,output=nullptr;
 OfxParamHandle screen=nullptr,mode=nullptr,despill=nullptr,encoding=nullptr;
 std::mutex mutex;
 ck::Worker worker;
};
Instance *instance(OfxImageEffectHandle effect) {
 void *p=nullptr;check(props->propGetPointer(properties(effect),kOfxPropInstanceData,0,&p));
 ck::require(p,"CorridorKey instance unavailable");return static_cast<Instance *>(p);
}
struct Image {
 OfxPropertySetHandle p=nullptr;
 Image(OfxImageClipHandle clip,double time) {check(fx->clipGetImage(clip,time,nullptr,&p));}
 ~Image(){if(p)fx->clipReleaseImage(p);}
 Image(const Image &)=delete;
};
struct Pixels {
 char *data=nullptr; int x1,y1,x2,y2,stride;
 explicit Pixels(OfxPropertySetHandle image) {
  check(props->propGetPointer(image,kOfxImagePropData,0,reinterpret_cast<void **>(&data)));
  ck::require(data,"Missing CPU image pixels");
  ck::require(string(image,kOfxImageEffectPropPixelDepth)==kOfxBitDepthFloat &&
    string(image,kOfxImageEffectPropComponents)==kOfxImageComponentRGBA,"CorridorKey requires float32 RGBA CPU images");
  x1=number(image,kOfxImagePropBounds,0);y1=number(image,kOfxImagePropBounds,1);
  x2=number(image,kOfxImagePropBounds,2);y2=number(image,kOfxImagePropBounds,3);
  stride=number(image,kOfxImagePropRowBytes);
  ck::require(x2-x1==1280 && y2-y1==720 && std::abs(static_cast<long long>(stride))>=1280*16,
    "CorridorKey 2.0: use full-resolution 1280x720 SDR; disable proxy/half-resolution preview");
 }
 float *row(int y) const {return reinterpret_cast<float *>(data+static_cast<ptrdiff_t>(y-y1)*stride);}
};

void describe(OfxImageEffectHandle effect) {
 auto p=properties(effect);
 text(p,kOfxPropLabel,"CorridorKey 2.0");text(p,kOfxImageEffectPluginPropGrouping,"Keyer");
 text(p,kOfxImageEffectPropSupportedContexts,kOfxImageEffectContextFilter);
 text(p,kOfxImageEffectPropSupportedContexts,kOfxImageEffectContextGeneral,1);
 text(p,kOfxImageEffectPropSupportedPixelDepths,kOfxBitDepthFloat);
 integer(p,kOfxImageEffectPropSupportsTiles,0);integer(p,kOfxImageEffectPropSupportsMultiResolution,0);
 integer(p,kOfxImageEffectPropTemporalClipAccess,0);
 text(p,kOfxImageEffectPluginRenderThreadSafety,kOfxImageEffectRenderInstanceSafe);
 integer(p,kOfxImageEffectPluginPropHostFrameThreading,0);
 // Resolve rejects optional OfxPropPluginDescription; details live in bundle NOTICE/README.
}
void context(OfxImageEffectHandle effect) {
 for(auto name:{kOfxImageEffectSimpleSourceClipName,kOfxImageEffectOutputClipName}) {
  OfxPropertySetHandle p=nullptr;check(fx->clipDefine(effect,name,&p));
  text(p,kOfxImageEffectPropSupportedComponents,kOfxImageComponentRGBA);
  integer(p,kOfxImageEffectPropSupportsTiles,0);integer(p,kOfxImageClipPropOptional,0);
 }
 OfxParamSetHandle set=nullptr;check(fx->getParamSet(effect,&set));
 auto choice=[&](const char *name,const char *label,const char *first,const char *second) {
  OfxPropertySetHandle p=nullptr;check(params->paramDefine(set,kOfxParamTypeChoice,name,&p));
  text(p,kOfxPropLabel,label);text(p,kOfxParamPropChoiceOption,first);text(p,kOfxParamPropChoiceOption,second,1);
  integer(p,kOfxParamPropDefault,0);integer(p,kOfxParamPropAnimates,0);
 };
 choice("screen","Screen","Green","Blue");
 choice("output","Output","Cutout","Matte");
 choice("encoding","Input / output encoding","sRGB (display encoded)","Linear sRGB (Rec.709 primaries)");
 OfxPropertySetHandle p=nullptr;check(params->paramDefine(set,kOfxParamTypeDouble,"despill",&p));
 text(p,kOfxPropLabel,"Despill");check(props->propSetDouble(p,kOfxParamPropDefault,0,1));
 check(props->propSetDouble(p,kOfxParamPropMin,0,0));check(props->propSetDouble(p,kOfxParamPropMax,0,1));
 check(props->propSetDouble(p,kOfxParamPropDisplayMin,0,0));check(props->propSetDouble(p,kOfxParamPropDisplayMax,0,1));
}
void create(OfxImageEffectHandle effect) {
 auto state=std::make_unique<Instance>();
 check(fx->clipGetHandle(effect,kOfxImageEffectSimpleSourceClipName,&state->source,nullptr));
 check(fx->clipGetHandle(effect,kOfxImageEffectOutputClipName,&state->output,nullptr));
 OfxParamSetHandle set=nullptr;check(fx->getParamSet(effect,&set));
 check(params->paramGetHandle(set,"screen",&state->screen,nullptr));
 check(params->paramGetHandle(set,"output",&state->mode,nullptr));
 check(params->paramGetHandle(set,"despill",&state->despill,nullptr));
 check(params->paramGetHandle(set,"encoding",&state->encoding,nullptr));
 check(props->propSetPointer(properties(effect),kOfxPropInstanceData,0,state.get()));state.release();
}
void render(OfxImageEffectHandle effect,OfxPropertySetHandle args) {
 auto *state=instance(effect);std::lock_guard<std::mutex> guard(state->mutex);
 double time=0,scale[2]={1,1};check(props->propGetDouble(args,kOfxPropTime,0,&time));
 check(props->propGetDoubleN(args,kOfxImageEffectPropRenderScale,2,scale));
 ck::require(scale[0]==1 && scale[1]==1,"CorridorKey requires full-resolution rendering (disable proxies)");
 Image source(state->source,time),output(state->output,time);
 Pixels src(source.p),dst(output.p);
 ck::require(src.x1==dst.x1 && src.y1==dst.y1,"Input/output frame origins differ");
 double par=1; if(props->propGetDouble(source.p,kOfxImagePropPixelAspectRatio,0,&par)==kOfxStatOK)
  ck::require(par==1,"CorridorKey requires square pixels");
 int screen=0,mode=0,encoding=0;double despill=1;
 check(params->paramGetValueAtTime(state->screen,time,&screen));check(params->paramGetValueAtTime(state->mode,time,&mode));
 check(params->paramGetValueAtTime(state->encoding,time,&encoding));check(params->paramGetValueAtTime(state->despill,time,&despill));
 ck::require((screen==0||screen==1)&&(mode==0||mode==1)&&(encoding==0||encoding==1)&&std::isfinite(despill)&&despill>=0&&despill<=1,"Invalid CorridorKey parameters");
 std::vector<float> pixels(ck::width*ck::height*4);
 // OFX coordinates are bottom-up; MLX operates top-down. Respect negative row strides.
 for(int y=0;y<720;++y) std::copy_n(src.row(src.y2-1-y),1280*4,pixels.data()+y*1280*4);
 const char *home=getenv("HOME");ck::require(home,"HOME is not set");
 std::string runtime=std::string(home)+"/Library/Application Support/CorridorKey-Resolve";
 Dl_info location{};ck::require(dladdr(reinterpret_cast<void *>(&render),&location)!=0,"Cannot locate OFX bundle");
 std::string binary=location.dli_fname;auto slash=binary.find_last_of('/');
 std::string script=binary.substr(0,slash)+"/../Resources/worker.py";
 state->worker.start(runtime+"/venv/bin/python",script,runtime+"/ofx-worker.log");
 auto result=state->worker.render(pixels,screen,mode,static_cast<float>(despill),encoding,[&]{return fx->abort(effect)!=0;});
 for(float value:result)ck::require(std::isfinite(value),"Worker returned non-finite pixels");
 int window[4];check(props->propGetIntN(args,kOfxImageEffectPropRenderWindow,4,window));
 ck::require(window[0]>=dst.x1&&window[1]>=dst.y1&&window[2]<=dst.x2&&window[3]<=dst.y2,"Render window exceeds output bounds");
 for(int y=window[1];y<window[3];++y) {
  auto *row=dst.row(y);const float *input=result.data()+(dst.y2-1-y)*1280*4;
  std::copy(input+(window[0]-dst.x1)*4,input+(window[2]-dst.x1)*4,row+(window[0]-dst.x1)*4);
 }
 if(messages)messages->clearPersistentMessage(effect);
}
OfxStatus entry(const char *action,const void *handle,OfxPropertySetHandle in,OfxPropertySetHandle out) {
 auto effect=const_cast<OfxImageEffectHandle>(static_cast<const OfxImageEffectStruct *>(handle));
 try {
  if(!strcmp(action,kOfxActionLoad)) {
   fx=static_cast<const OfxImageEffectSuiteV1 *>(host->fetchSuite(host->host,kOfxImageEffectSuite,1));
   props=static_cast<const OfxPropertySuiteV1 *>(host->fetchSuite(host->host,kOfxPropertySuite,1));
   params=static_cast<const OfxParameterSuiteV1 *>(host->fetchSuite(host->host,kOfxParameterSuite,1));
   messages=static_cast<const OfxMessageSuiteV2 *>(host->fetchSuite(host->host,kOfxMessageSuite,2));
   return fx&&props&&params?kOfxStatOK:kOfxStatErrMissingHostFeature;
  }
  if(!strcmp(action,kOfxActionUnload))return kOfxStatOK;
  if(!strcmp(action,kOfxActionDescribe)){describe(effect);return kOfxStatOK;}
  if(!strcmp(action,kOfxImageEffectActionDescribeInContext)){context(effect);return kOfxStatOK;}
  if(!strcmp(action,kOfxActionCreateInstance)){create(effect);return kOfxStatOK;}
  if(!strcmp(action,kOfxActionDestroyInstance)){
   delete instance(effect);props->propSetPointer(properties(effect),kOfxPropInstanceData,0,nullptr);return kOfxStatOK;
  }
  if(!strcmp(action,kOfxImageEffectActionGetClipPreferences)){
   text(out,kOfxImageEffectPropPreMultiplication,kOfxImagePreMultiplied);
   integer(out,kOfxImageEffectFrameVarying,1);return kOfxStatOK;
  }
  if(!strcmp(action,kOfxImageEffectActionRender)){render(effect,in);return kOfxStatOK;}
  return kOfxStatReplyDefault;
 }catch(const std::exception &error){
  fprintf(stderr,"CorridorKey OFX: %s\n",error.what());
  if(messages&&effect)messages->setPersistentMessage(effect,kOfxMessageError,"CorridorKeyError","%s",error.what());
  return kOfxStatFailed;
 }catch(...){return kOfxStatErrUnknown;}
}
void setHost(OfxHost *value){host=value;}
OfxPlugin plugin={kOfxImageEffectPluginApi,1,"org.lucasfth.CorridorKey2",0,1,setHost,entry};
}
extern "C" {
OfxExport int OfxGetNumberOfPlugins(){return 1;}
OfxExport OfxPlugin *OfxGetPlugin(int index){return index==0?&plugin:nullptr;}
}
