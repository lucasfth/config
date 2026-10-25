// Standalone test only: default SIGPIPE would terminate without per-pipe protection.
#include "../configs/davinci-resolve/native/transport.hpp"
#include <iostream>
int main(int argc,char **argv){
 if(argc!=3)return 2;
 signal(SIGPIPE,SIG_DFL);
 ck::Worker worker;
 worker.start(argv[1],argv[2],"/private/tmp/ck2-sigpipe.log");
 // Reap our exact child, proving its pipe reader is closed before render writes.
 int status=0;pid_t child;
 do {child=waitpid(-1,&status,0);} while(child<0&&errno==EINTR);
 if(child<=0)return 3;
 std::vector<float> frame(1280*720*4,1);
 try {worker.render(frame,0,0,1,0,[]{return false;});return 4;}
 catch(const std::exception &error){std::cout<<"EXPECTED_CLOSED_PIPE "<<error.what()<<"\n";}
 std::cout<<"SIGPIPE_DEFAULT_CLOSED_READER_WRITE=PASS\n";
}
