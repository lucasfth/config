#include "../configs/davinci-resolve/native/transport.hpp"
#include <iostream>
int main(int argc,char **argv) {
 if(argc!=4) return 2;
 ck::Worker worker;worker.start(argv[1],argv[2],argv[3]);
 std::vector<float> pixels(ck::width*ck::height*4,0.25f);
 for(size_t i=3;i<pixels.size();i+=4)pixels[i]=1;
 auto result=worker.render(pixels,0,0,1,0,[]{return false;});
 if(result!=pixels)return 3;
 std::cout<<"TRANSPORT_ROUNDTRIP=PASS\n";
 worker.stop();
 return 0;
}
