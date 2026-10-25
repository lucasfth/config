// Original local CorridorKey adapter. No third-party OFX implementation code.
#pragma once
#include <array>
#include <cerrno>
#include <chrono>
#include <csignal>
#include <cstdint>
#include <cstring>
#include <fcntl.h>
#include <functional>
#include <poll.h>
#include <spawn.h>
#include <stdexcept>
#include <string>
#include <sys/stat.h>
#include <sys/wait.h>
#include <unistd.h>
#include <vector>
extern char **environ;

namespace ck {
constexpr size_t width = 1280, height = 720, bytes = width * height * 4 * sizeof(float);
inline void require(bool ok, const char *message) { if (!ok) throw std::runtime_error(message); }

class Worker {
    pid_t pid = -1;
    int input = -1, output = -1;
    void transfer(int fd, void *buffer, size_t size, bool writing,
                  std::chrono::steady_clock::time_point deadline, const std::function<bool()> &abort) {
        auto *ptr = static_cast<char *>(buffer);
        while (size) {
            require(!abort(), "CorridorKey processing cancelled");
            require(std::chrono::steady_clock::now() < deadline, "CorridorKey worker timed out (180 seconds)");
            pollfd p{fd, static_cast<short>(writing ? POLLOUT : POLLIN), 0};
            int ready = poll(&p, 1, 100);
            if (ready < 0 && errno == EINTR) continue;
            require(ready >= 0, "CorridorKey pipe poll failed");
            if (!ready) continue;
            ssize_t n = writing ? write(fd, ptr, size) : read(fd, ptr, size);
            if (n < 0 && (errno == EINTR || errno == EAGAIN)) continue;
            require(n > 0, "CorridorKey worker exited; inspect CorridorKey-Resolve/ofx-worker.log");
            ptr += n; size -= static_cast<size_t>(n);
        }
    }
public:
    Worker() = default;
    Worker(const Worker &) = delete;
    ~Worker() { stop(); }
    void stop() {
        if (input >= 0) close(input);
        if (output >= 0) close(output);
        input = output = -1;
        if (pid > 0) {
            if (waitpid(pid, nullptr, WNOHANG) == 0) {
                kill(pid, SIGTERM);
                for (int i=0; i<20; ++i) {
                    if (waitpid(pid, nullptr, WNOHANG) != 0) { pid=-1; return; }
                    usleep(10000);
                }
                kill(pid, SIGKILL);
                while (waitpid(pid, nullptr, 0) < 0 && errno == EINTR) {}
            }
        }
        pid = -1;
    }
    void start(const std::string &python, const std::string &script, const std::string &log) {
        if (pid > 0) return;
        require(access(python.c_str(), X_OK) == 0, "CorridorKey runtime missing: run setup-corridorkey-resolve first");
        int in[2]={-1,-1}, out[2]={-1,-1};
        require(pipe(in) == 0, "Cannot create CorridorKey input pipe");
        if (pipe(out) != 0) { close(in[0]); close(in[1]); throw std::runtime_error("Cannot create output pipe"); }
        int err = open(log.c_str(), O_WRONLY|O_CREAT|O_APPEND|O_NOFOLLOW, 0600);
        if (err < 0) { for (int fd: {in[0],in[1],out[0],out[1]}) close(fd); throw std::runtime_error("Cannot open private CorridorKey worker log"); }
        auto closeSetup = [&] { for (int fd: {in[0],in[1],out[0],out[1],err}) close(fd); };
        for (int fd: {in[0],in[1],out[0],out[1],err}) {
            if (fcntl(fd,F_SETFD,FD_CLOEXEC) < 0) {closeSetup();throw std::runtime_error("Cannot protect worker descriptors");}
        }
        // Per-pipe suppression preserves Resolve's process-wide SIGPIPE policy.
#ifdef F_SETNOSIGPIPE
        if (fcntl(in[1],F_SETNOSIGPIPE,1) < 0) {closeSetup();throw std::runtime_error("Cannot suppress worker pipe SIGPIPE");}
#else
        closeSetup();throw std::runtime_error("This adapter requires macOS pipe SIGPIPE suppression");
#endif
        if (fcntl(in[1],F_SETFL,O_NONBLOCK) < 0 || fcntl(out[0],F_SETFL,O_NONBLOCK) < 0) {
            closeSetup();throw std::runtime_error("Cannot configure nonblocking worker pipes");
        }
        posix_spawn_file_actions_t actions;
        int status=posix_spawn_file_actions_init(&actions);
        if (status) {closeSetup();throw std::runtime_error("Cannot configure worker spawn");}
        for (auto pair: {std::pair<int,int>{in[0],STDIN_FILENO},{out[1],STDOUT_FILENO},{err,STDERR_FILENO}}) {
            if (!status) status=posix_spawn_file_actions_adddup2(&actions,pair.first,pair.second);
        }
        for (int fd: {in[0],in[1],out[0],out[1],err}) {
            if (!status) status=posix_spawn_file_actions_addclose(&actions,fd);
        }
        char *argv[] = {const_cast<char *>(python.c_str()),const_cast<char *>("-u"),const_cast<char *>(script.c_str()),nullptr};
        if (!status) status=posix_spawn(&pid,python.c_str(),&actions,nullptr,argv,environ);
        posix_spawn_file_actions_destroy(&actions);
        close(in[0]); close(out[1]); close(err);
        if (status) {close(in[1]);close(out[0]);pid=-1;throw std::runtime_error("Cannot start CorridorKey worker");}
        input=in[1]; output=out[0];
    }
    std::vector<float> render(std::vector<float> &pixels, uint32_t screen, uint32_t mode, float despill,
                              uint32_t encoding, const std::function<bool()> &abort) {
        static_assert(sizeof(float)==4,"Protocol requires IEEE float32");
        require(pixels.size()*4 == bytes, "Invalid CorridorKey frame size");
        std::array<unsigned char,32> header{};
        static_assert(sizeof(header)==8+4*4+4+4,"Header must match Python <8sIIIIfI (32 bytes)");
        memcpy(header.data(),"CK2OFX01",8);
        uint32_t values[] = {width,height,screen,mode};
        memcpy(header.data()+8,values,16); memcpy(header.data()+24,&despill,4); memcpy(header.data()+28,&encoding,4);
        auto deadline=std::chrono::steady_clock::now()+std::chrono::seconds(180);
        try {
            transfer(input,header.data(),header.size(),true,deadline,abort);
            transfer(input,pixels.data(),bytes,true,deadline,abort);
            uint32_t response[2]; transfer(output,response,sizeof(response),false,deadline,abort);
            if (response[0]) {
                require(response[0]==1 && response[1]<=4096,"Invalid worker error response");
                std::string error(response[1],' ');transfer(output,error.data(),error.size(),false,deadline,abort);
                throw std::runtime_error(error);
            }
            require(response[1]==bytes,"Invalid CorridorKey worker response size");
            std::vector<float> result(width*height*4);
            transfer(output,result.data(),bytes,false,deadline,abort);
            return result;
        } catch (...) { stop(); throw; }
    }
};
} // namespace ck
