// Synthetic host temporal scheduling/stride/handle proof, not Resolve acceptance.
#define main independent_host_main
#include "corridorkey-ofx-host.cpp"
#undef main
namespace temporaltest {
std::vector<double> fetched;
std::map<int,std::vector<float>> frames;
OfxStatus clipProperties(OfxImageClipHandle clip,OfxPropertySetHandle *out){*out=reinterpret_cast<OfxPropertySetHandle>(clip);return kOfxStatOK;}
OfxStatus image(OfxImageClipHandle clip,double time,const OfxRectD *,OfxPropertySetHandle *out){
 using namespace test;
 if(reinterpret_cast<Properties *>(clip)==sourceClip){
  fetched.push_back(time);auto &pixels=frames.at(static_cast<int>(time));
  configure(inputImage,pixels.data(),false);*out=h(inputImage);
 }else *out=h(outputImage);
 ++acquired;return kOfxStatOK;
}
}
int main(int argc,char **argv){
 using namespace test;
 try{
  ck::require(argc==2||argc==4,"Usage: temporal-host plugin.ofx [frame-dir reference-dir]");init();effects.clipGetImage=temporaltest::image;effects.clipGetPropertySet=temporaltest::clipProperties;
  const bool real=argc==4;
  void *library=dlopen(argv[1],RTLD_NOW|RTLD_LOCAL);ck::require(library,"Cannot load temporal plugin");auto getPlugin=reinterpret_cast<OfxPlugin *(*)(int)>(dlsym(library,"OfxGetPlugin"));auto *plugin=getPlugin(0);Effect effect;auto e=reinterpret_cast<OfxImageEffectHandle>(&effect);Properties hostProperties;set(h(hostProperties),kOfxImageEffectPropTemporalClipAccess,0,0);OfxHost host{h(hostProperties),fetch};plugin->setHost(&host);auto call=[&](const char *a,OfxPropertySetHandle in=nullptr,OfxPropertySetHandle out=nullptr){return plugin->mainEntry(a,e,in,out);};
  check(call(kOfxActionLoad));check(call(kOfxActionDescribe));check(call(kOfxImageEffectActionDescribeInContext));sourceClip=&effect.clips.at(kOfxImageEffectSimpleSourceClipName);set(h(*sourceClip),kOfxImageEffectPropFrameRange,0,0.);set(h(*sourceClip),kOfxImageEffectPropFrameRange,1,6.);
  ck::require(effect.parameters.count("temporal")&&effect.parameters.count("lookahead"),"Temporal Inspector controls missing");
  set(h(effect.parameters.at("temporal").properties),kOfxParamPropDefault,0,1);set(h(effect.parameters.at("lookahead").properties),kOfxParamPropDefault,0,2);
  for(int time=0;time<=6;++time){
   auto &pixels=temporaltest::frames[time];pixels.resize(1280*720*4,float(time)/8);
   if(real){
    std::string file=std::string(argv[2])+"/"+std::to_string(time)+".f32";
    ck::require(bool(std::ifstream(file,std::ios::binary).read(reinterpret_cast<char *>(pixels.data()),pixels.size()*4)),"Missing real temporal input");
    for(int y=0;y<720/2;++y)for(int x=0;x<1280*4;++x)std::swap(pixels[y*1280*4+x],pixels[(719-y)*1280*4+x]);
   }
  }
  std::vector<float> dst(1280*720*4,-1);configure(outputImage,dst.data(),false);check(call(kOfxActionCreateInstance));Properties args;set(h(args),kOfxImageEffectPropRenderScale,0,1.);set(h(args),kOfxImageEffectPropRenderScale,1,1.);for(int i=0;i<4;++i)set(h(args),kOfxImageEffectPropRenderWindow,i,(int[]){0,0,1280,720}[i]);
  set(h(args),kOfxPropTime,0,3.);Properties unsupported;
  ck::require(call(kOfxImageEffectActionGetFramesNeeded,h(args),h(unsupported))==kOfxStatFailed,"Host without temporal access must reject context mode");
  ck::require(lastError.find("temporal")!=std::string::npos,"Missing temporal host capability error");
  set(h(hostProperties),kOfxImageEffectPropTemporalClipAccess,0,1);
  for(int ahead=0;ahead<=3;++ahead)for(double time : {3.,0.,6.,3.}){
   set(h(effect.parameters.at("lookahead").properties),kOfxParamPropDefault,0,ahead);
   set(h(args),kOfxPropTime,0,time);Properties needed;check(call(kOfxImageEffectActionGetFramesNeeded,h(args),h(needed)));double lo,hi;check(get(h(needed),"OfxImageClipPropFrameRange_Source",0,&lo));check(get(h(needed),"OfxImageClipPropFrameRange_Source",1,&hi));ck::require(lo==std::max(0.,time-(3-ahead))&&hi==std::min(6.,time+ahead),"Wrong frames-needed interval");
   temporaltest::fetched.clear();check(call(kOfxImageEffectActionRender,h(args)));
   std::vector<double> expected;for(int i=0;i<4;++i)expected.push_back(std::max(0.,std::min(6.,time+i-(3-ahead))));
   ck::require(temporaltest::fetched==expected,"Wrong source fetch times");
   if(real){
    std::vector<float> expectedPixels(dst.size());std::string file=std::string(argv[3])+"/"+std::to_string(ahead)+"-"+std::to_string(int(time))+".f32";
    ck::require(bool(std::ifstream(file,std::ios::binary).read(reinterpret_cast<char *>(expectedPixels.data()),expectedPixels.size()*4)),"Missing real temporal reference");
    float worst=0;for(int y=0;y<720;++y)for(int x=0;x<1280*4;++x)worst=std::max(worst,std::abs(dst[(719-y)*1280*4+x]-expectedPixels[y*1280*4+x]));
    ck::require(worst<.0001,"Real temporal host differs from model reference");
   }else for(float v:dst)ck::require(v==float(time)/8,"Wrong temporal target output");
   ck::require(acquired==released,"Temporal images leaked");
  }
  check(call(kOfxActionDestroyInstance));check(call(kOfxActionUnload));dlclose(library);std::cout<<"TEMPORAL_HOST_FRAMES_NEEDED_BOUNDARIES_ORDER_HANDLES=PASS\n";
 }catch(const std::exception &e){std::cerr<<e.what()<<"\n";return 1;}
}
