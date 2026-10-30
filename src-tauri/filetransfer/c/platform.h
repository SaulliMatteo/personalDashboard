#ifndef PLATFORM_H
#define PLATFORM_H

/* Secondi di silenzio dopo cui una connessione si chiude. */
#define NET_CLIENT_TIMEOUT_S 30

/* Unico punto del server con codice diverso per sistema operativo:
   Winsock e thread Win32 su Windows, socket POSIX e pthread altrove
   (macOS, Linux). Il resto del server usa solo i nomi definiti qui. */

#ifdef _WIN32

#include <winsock2.h>
#include <windows.h>
#include <process.h>
#include <direct.h>
#include <stdio.h>

typedef HANDLE thread_t;
#define THREAD_FUNC unsigned __stdcall
typedef unsigned (__stdcall *thread_fn)(void *);

static inline int thread_start(thread_t *t, thread_fn fn, void *arg) {
    *t = (HANDLE)_beginthreadex(NULL, 0, fn, arg, 0, NULL);
    return *t ? 0 : -1;
}
static inline void thread_detach(thread_t t) { CloseHandle(t); }
static inline void thread_join(thread_t t)   { WaitForSingleObject(t, 2000); CloseHandle(t); }

static inline int  net_last_error(void)      { return WSAGetLastError(); }
/* accept() fallito perché il socket in ascolto è stato chiuso (stop del server). */
static inline int  net_listen_closed(int e)  { return e == WSAENOTSOCK || e == WSAEINVAL || e == WSAECONNABORTED; }
static inline void net_shutdown(SOCKET s)    { (void)s; }  /* closesocket sblocca già accept() */
/* Un client che non manda più niente non tiene occupato un thread per sempre. */
static inline void net_prepare_client(SOCKET s) {
    DWORD ms = NET_CLIENT_TIMEOUT_S * 1000;
    setsockopt(s, SOL_SOCKET, SO_RCVTIMEO, (const char *)&ms, sizeof(ms));
    setsockopt(s, SOL_SOCKET, SO_SNDTIMEO, (const char *)&ms, sizeof(ms));
}
static inline long atomic_add(volatile long *v, long d) { return InterlockedExchangeAdd(v, d) + d; }

#define make_dir(p)        _mkdir(p)
#define file_seek(f, o, w) _fseeki64(f, o, w)
#define file_tell(f)       _ftelli64(f)
#define SEND_FLAGS         0
typedef int net_len_t;

#else

#include <sys/types.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <unistd.h>
#include <pthread.h>
#include <errno.h>
#include <stdio.h>

typedef int SOCKET;
#define INVALID_SOCKET (-1)
#define SOCKET_ERROR   (-1)
#define closesocket(s) close(s)

typedef pthread_t thread_t;
#define THREAD_FUNC void *
typedef void *(*thread_fn)(void *);

static inline int  thread_start(thread_t *t, thread_fn fn, void *arg) { return pthread_create(t, NULL, fn, arg) == 0 ? 0 : -1; }
static inline void thread_detach(thread_t t) { pthread_detach(t); }
static inline void thread_join(thread_t t)   { pthread_join(t, NULL); }

static inline int  net_last_error(void)      { return errno; }
static inline int  net_listen_closed(int e)  { return e == EBADF || e == EINVAL || e == ECONNABORTED || e == ENOTSOCK; }
/* Su macOS close() non sblocca un accept() in attesa: serve prima shutdown(). */
static inline void net_shutdown(SOCKET s)    { shutdown(s, SHUT_RDWR); }

/* Un client che non manda più niente non tiene occupato un thread per sempre. */
static inline void net_set_timeouts(SOCKET s) {
    struct timeval tv = { NET_CLIENT_TIMEOUT_S, 0 };
    setsockopt(s, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));
    setsockopt(s, SOL_SOCKET, SO_SNDTIMEO, &tv, sizeof(tv));
}

/* Se l'iPad chiude la connessione a metà invio, send() non deve
   uccidere l'app con SIGPIPE. */
#ifdef SO_NOSIGPIPE
static inline void net_prepare_client(SOCKET s) {
    int yes = 1;
    setsockopt(s, SOL_SOCKET, SO_NOSIGPIPE, &yes, sizeof(yes));
    net_set_timeouts(s);
}
#define SEND_FLAGS 0
#else
static inline void net_prepare_client(SOCKET s) { net_set_timeouts(s); }
#define SEND_FLAGS MSG_NOSIGNAL
#endif

static inline long atomic_add(volatile long *v, long d) { return __sync_add_and_fetch(v, d); }

#define make_dir(p)        mkdir(p, 0755)
#define file_seek(f, o, w) fseeko(f, (off_t)(o), w)
#define file_tell(f)       ftello(f)
typedef socklen_t net_len_t;

#endif

#endif
