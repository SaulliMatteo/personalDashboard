#ifndef _CRT_SECURE_NO_WARNINGS
#define _CRT_SECURE_NO_WARNINGS
#endif
#ifndef _WINSOCK_DEPRECATED_NO_WARNINGS
#define _WINSOCK_DEPRECATED_NO_WARNINGS
#endif

#include "network.h"
#include <stdio.h>

int net_init(void) {
    WSADATA wsa;
    return WSAStartup(MAKEWORD(2, 2), &wsa);
}

void net_cleanup(void) {
    WSACleanup();
}

int send_all(SOCKET s, const void *buf, size_t len) {
    const char *p = (const char *)buf;
    while (len > 0) {
        int chunk = len > 65536 ? 65536 : (int)len;
        int n = send(s, p, chunk, 0);
        if (n == SOCKET_ERROR) return -1;
        p += n;
        len -= (size_t)n;
    }
    return 0;
}

int recv_all(SOCKET s, void *buf, size_t len) {
    char *p = (char *)buf;
    while (len > 0) {
        int chunk = len > 65536 ? 65536 : (int)len;
        int n = recv(s, p, chunk, 0);
        if (n == SOCKET_ERROR || n == 0) return -1;  /* errore o connessione chiusa */
        p += n;
        len -= (size_t)n;
    }
    return 0;
}

uint64_t to_be64(uint64_t v) {
    uint64_t r = 0;
    for (int i = 0; i < 8; i++) {
        r = (r << 8) | (v & 0xFF);
        v >>= 8;
    }
    return r;
}

uint64_t from_be64(uint64_t v) {
    return to_be64(v);  /* l'operazione e' simmetrica */
}
