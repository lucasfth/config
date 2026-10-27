#include "../configs/davinci-resolve/native/transport.hpp"
#include <iostream>
int main(int argc,char **argv){
 if(argc!=4)return 2;
 ck::Worker worker;worker.start(argv[1],argv[2],argv[3]);
 unsigned fetched=0;
 auto frame=[&](unsigned index){++fetched;return std::vector<float>(1280*720*4,static_cast<float>(index+1)/4);};
 for(unsigned target : {3u,0u,2u,3u}){
  auto result=worker.renderTemporal(0,0,1,0,[]{return false;},1280,720,0,0,1,0,0,target,frame);
  if(result!=std::vector<float>(1280*720*4,static_cast<float>(target+1)/4))return 3;
 }
 if(fetched!=16)return 4;
 try{worker.renderTemporal(0,0,1,0,[]{return false;},6240,4160,0,0,1,0,0,2,frame);return 5;}catch(const std::exception&){}
 if(fetched!=16)return 6;
 auto plain=frame(0);if(worker.render(plain,0,0,1,0,[]{return false;})!=plain)return 7;
 worker.stop();std::cout<<"TEMPORAL_V3_TARGET_STREAM_BOUNDS_AND_V2_COMPAT=PASS\n";
}
