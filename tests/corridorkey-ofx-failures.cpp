#include "../configs/davinci-resolve/native/transport.hpp"
#include <iostream>
int main(int argc,char **argv){
 if(argc!=3)return 2;
 for(int trial=0;trial<2;++trial){
  ck::Worker worker;worker.start(argv[1],argv[2],"/private/tmp/ck2-worker-failure.log");
  std::vector<float> frame(1280*720*4,1);
  try{worker.render(frame,0,0,1,0,[&]{return trial==1;});return 3;}
  catch(const std::exception &error){std::cout<<"EXPECTED_WORKER_ERROR "<<error.what()<<"\n";}
 }
 std::cout<<"DEAD_WORKER_AND_ABORT=PASS\n";
}
